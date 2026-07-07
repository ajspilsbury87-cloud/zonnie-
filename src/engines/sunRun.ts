/**
 * sunRun — plan a run that STARTS at a chosen terrace and FINISHES at a
 * terrace that will be sunny when you arrive (SPEC-sun-run-phase0.md).
 *
 * The differentiator is sun timing, not routing: given a start terrace,
 * distance, pace band and start time, we estimate the arrival time and
 * pick a finish terrace that scores well AT THAT HOUR. We deliberately
 * never draw a street route — Strava owns navigation; Zonnie owns the sun.
 *
 * Times are MINUTES FROM MIDNIGHT (Amsterdam local) so the start-time
 * slider can work in 15-minute steps; scoring rounds to the nearest hour
 * (the sun engine's resolution). Pure module: the scorer is injected
 * (`scoreAt`) so tests run without weather/native stubs.
 */

import type { Terrace } from '@/src/engines/types';

/** Distance chips, km. */
export const RUN_DISTANCES = [5, 10, 15, 20] as const;
export type RunDistance = (typeof RUN_DISTANCES)[number];

/**
 * Pace bands in 15-second steps of min/km, 4:00–4:15 through 7:15–7:30.
 * `secPerKm` is the band's lower bound; math uses the band midpoint.
 */
export interface PaceBand {
  secPerKm: number;
  label: string;
}

function fmtPace(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const PACE_BANDS: PaceBand[] = Array.from({ length: 13 }, (_, i) => {
  const sec = 240 + i * 15; // 4:00 … 7:00
  return { secPerKm: sec, label: `${fmtPace(sec)}–${fmtPace(sec + 15)}` };
});

/** Default selection: the 5:30–5:45 band (index 6). */
export const DEFAULT_PACE_INDEX = 6;

/** A finish only counts as genuinely sunny at or above this score.
 *  Same bar as SUN_THRESHOLD (handoff.ts/sunUntil.ts) so Sun Run and the
 *  peek card never disagree about whether a terrace is sunny. */
export const SUNNY_FINISH_THRESHOLD = 0.5;

/** "HH:MM" from minutes-from-midnight. */
export function fmtClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Run duration in whole minutes, using the pace band's midpoint. */
export function runMinutes(distanceKm: number, paceSecPerKm: number): number {
  return Math.round((distanceKm * (paceSecPerKm + 7.5)) / 60);
}

export interface SunRunPlan {
  finish: Terrace;
  /** Sun score (0–1) at the arrival hour. */
  score: number;
  /** Whether the finish clears the sunny threshold (false → honest fallback). */
  isSunny: boolean;
  /** Last consecutive hour (from arrival) the finish stays sunny; null if never sunny. */
  sunUntilHour: number | null;
  distanceKm: RunDistance;
  pace: PaceBand;
  /** Start / arrival as minutes from midnight (exact, for display). */
  startMinutes: number;
  arriveMinutes: number;
  /** Arrival rounded to the scoring hour. */
  arriveHour: number;
  runMinutes: number;
  /** Name of the start terrace, when the run starts from one. */
  originName?: string;
}

const M_LAT = 110540;
const M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt(((b.lng - a.lng) * M_LNG) ** 2 + ((b.lat - a.lat) * M_LAT) ** 2);
}

export interface PlanSunRunOptions {
  terraces: readonly Terrace[];
  distanceKm: RunDistance;
  pace: PaceBand;
  /** Start time, minutes from midnight (slider gives 15-min steps). */
  startMinutes: number;
  /** Start point (usually the origin terrace); when absent, any terrace qualifies. */
  origin?: { lat: number; lng: number } | null;
  originName?: string;
  /** Injected scorer: sun score (0–1) for a terrace at an Amsterdam hour. */
  scoreAt: (terrace: Terrace, hour: number) => number;
  /** Terrace ids to skip — the origin itself + the "another finish" shuffle. */
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
  const { terraces, distanceKm, pace, startMinutes, origin, originName, scoreAt, excludeIds } = opts;
  const duration = runMinutes(distanceKm, pace.secPerKm);
  const arriveMinutes = startMinutes + duration;
  const arriveHour = Math.min(23, Math.max(0, Math.round(arriveMinutes / 60)));

  const minDisp = origin ? distanceKm * 1000 * 0.15 : 0;
  const maxDisp = origin ? distanceKm * 1000 * 0.75 : Infinity;

  let best: { terrace: Terrace; score: number } | null = null;
  for (const t of terraces) {
    if (excludeIds?.has(t.id)) continue;
    if (origin) {
      const d = distMeters(origin, t);
      if (d < minDisp || d > maxDisp) continue;
    }
    const s = scoreAt(t, arriveHour);
    if (best == null || s > best.score) best = { terrace: t, score: s };
  }
  if (best == null) return null;

  // How long the finish stays sunny from arrival (consecutive hours).
  let sunUntil: number | null = null;
  if (best.score >= SUNNY_FINISH_THRESHOLD) {
    sunUntil = arriveHour;
    for (let h = arriveHour + 1; h <= 23; h++) {
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
    startMinutes,
    arriveMinutes,
    arriveHour,
    runMinutes: duration,
    originName,
  };
}

/**
 * Text share message for a Sun Run (EN by design — share messages travel
 * to mixed-language group chats, matching buildCrawlShareMessage).
 */
export function buildSunRunShareMessage(plan: SunRunPlan, appStoreUrl: string): string {
  const lines = [
    `🏃☀️ Sun Run — ${plan.distanceKm}k @ ${plan.pace.label} /km`,
    plan.originName
      ? `Start ${fmtClock(plan.startMinutes)} at ${plan.originName}`
      : `Start ${fmtClock(plan.startMinutes)}`,
    plan.isSunny && plan.sunUntilHour != null
      ? `Finish ~${fmtClock(plan.arriveMinutes)}: ${plan.finish.name}, ${plan.finish.area} — sunny till ${String(plan.sunUntilHour + 1).padStart(2, '0')}:00 ☀️`
      : `Finish ~${fmtClock(plan.arriveMinutes)}: ${plan.finish.name}, ${plan.finish.area}`,
    '',
    `Plan yours → ${appStoreUrl}`,
  ];
  return lines.join('\n');
}
