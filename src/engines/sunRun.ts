/**
 * sunRun — plan a run that FINISHES at a terrace that will be sunny when
 * you arrive (Phase 0 of the runs direction, SPEC-sun-run-phase0.md).
 *
 * The differentiator is sun timing, not routing: we pick a start time,
 * estimate the arrival hour from distance ÷ pace, and choose a finish
 * terrace that scores well AT THAT HOUR. We deliberately never draw a
 * street route — Strava owns navigation; Zonnie owns the sun.
 *
 * Pure module: the scorer is injected (`scoreAt`) so tests run without
 * weather/native stubs and the component wires in `cachedHourScore`.
 */

import type { Terrace } from '@/src/engines/types';

export type RunPace = 'easy' | 'steady' | 'quick';

/** Minutes per km per pace chip. Rounded, honest amateur-runner numbers. */
export const PACE_MIN_PER_KM: Record<RunPace, number> = {
  easy: 6.5,
  steady: 5.5,
  quick: 4.75,
};

/** Distance chips, km. */
export const RUN_DISTANCES = [3, 5, 10, 15] as const;
export type RunDistance = (typeof RUN_DISTANCES)[number];

/** A finish only counts as genuinely sunny at or above this score. */
export const SUNNY_FINISH_THRESHOLD = 0.45;

export interface SunRunPlan {
  finish: Terrace;
  /** Sun score (0–1) at the arrival hour. */
  score: number;
  /** Whether the finish clears the sunny threshold (false → honest fallback). */
  isSunny: boolean;
  /** Last consecutive hour (from arrival) the finish stays sunny; null if never sunny. */
  sunUntilHour: number | null;
  distanceKm: RunDistance;
  pace: RunPace;
  startHour: number;
  arriveHour: number;
  runMinutes: number;
}

export function runMinutes(distanceKm: number, pace: RunPace): number {
  return Math.round(distanceKm * PACE_MIN_PER_KM[pace]);
}

/** Arrival hour, rounded to the nearest whole hour and clamped to the day. */
export function arrivalHour(startHour: number, distanceKm: number, pace: RunPace): number {
  const h = Math.round(startHour + runMinutes(distanceKm, pace) / 60);
  return Math.min(23, Math.max(0, h));
}

const M_LAT = 110540;
const M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt(((b.lng - a.lng) * M_LNG) ** 2 + ((b.lat - a.lat) * M_LAT) ** 2);
}

export interface PlanSunRunOptions {
  terraces: readonly Terrace[];
  distanceKm: RunDistance;
  pace: RunPace;
  startHour: number;
  /** Runner's start point; when absent, any terrace qualifies. */
  origin?: { lat: number; lng: number } | null;
  /** Injected scorer: sun score (0–1) for a terrace at an Amsterdam hour. */
  scoreAt: (terrace: Terrace, hour: number) => number;
  /** Terrace ids to skip — powers the "another finish" shuffle. */
  excludeIds?: ReadonlySet<number>;
}

/**
 * Pick the sunny finish. Runs meander, so with an origin we require the
 * finish's straight-line displacement to be 15–75% of the run distance —
 * far enough to be a real destination, near enough to plausibly close the
 * loop. Ranked purely by sun score at arrival; when nothing clears the
 * sunny threshold we still return the best available with isSunny:false
 * so the UI can be honest instead of empty.
 */
export function planSunRun(opts: PlanSunRunOptions): SunRunPlan | null {
  const { terraces, distanceKm, pace, startHour, origin, scoreAt, excludeIds } = opts;
  const arrive = arrivalHour(startHour, distanceKm, pace);

  const minDisp = origin ? distanceKm * 1000 * 0.15 : 0;
  const maxDisp = origin ? distanceKm * 1000 * 0.75 : Infinity;

  let best: { terrace: Terrace; score: number } | null = null;
  for (const t of terraces) {
    if (excludeIds?.has(t.id)) continue;
    if (origin) {
      const d = distMeters(origin, t);
      if (d < minDisp || d > maxDisp) continue;
    }
    const s = scoreAt(t, arrive);
    if (best == null || s > best.score) best = { terrace: t, score: s };
  }
  if (best == null) return null;

  // How long the finish stays sunny from arrival (consecutive hours).
  let sunUntil: number | null = null;
  if (best.score >= SUNNY_FINISH_THRESHOLD) {
    sunUntil = arrive;
    for (let h = arrive + 1; h <= 23; h++) {
      if (scoreAt(best.terrace, h) >= SUNNY_FINISH_THRESHOLD) sunUntil = h;
      else break;
    }
  }

  return {
    finish: best.terrace,
    score: best.score,
    isSunny: best.score >= SUNNY_FINISH_THRESHOLD,
    sunUntilHour: sunUntil,
    distanceKm,
    pace,
    startHour,
    arriveHour: arrive,
    runMinutes: runMinutes(distanceKm, pace),
  };
}

/**
 * Text share message for a Sun Run (EN by design — share messages travel
 * to mixed-language group chats, matching buildCrawlShareMessage).
 */
export function buildSunRunShareMessage(plan: SunRunPlan, appStoreUrl: string): string {
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const paceLabel = { easy: 'easy', steady: 'steady', quick: 'quick' }[plan.pace];
  const lines = [
    `🏃☀️ Sun Run — ${plan.distanceKm}k ${paceLabel}, finishing in the sun`,
    `Start ${fmt(plan.startHour)} · arrive ~${fmt(plan.arriveHour)} (${plan.runMinutes} min)`,
    plan.isSunny && plan.sunUntilHour != null
      ? `Finish: ${plan.finish.name}, ${plan.finish.area} — sunny till ${fmt(plan.sunUntilHour + 1)} ☀️`
      : `Finish: ${plan.finish.name}, ${plan.finish.area}`,
    '',
    `Plan yours → ${appStoreUrl}`,
  ];
  return lines.join('\n');
}
