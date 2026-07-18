/**
 * sunStats — "My sun summer" aggregates over the on-device sun log
 * (Phase A of the community plan: personal, shareable stats with zero
 * backend — FEATURE-RESEARCH-community-Jul2026.md).
 *
 * Pure module: timestamps are converted to Amsterdam day strings by an
 * injected `dayOf` so tests run without date-fns-tz/native deps.
 *
 * Honesty note: the log records in-app interactions, not physical visits —
 * copy must say "explored", never "visited".
 */

import type { SunLogEvent } from '@/src/store/sunLogStore';

export interface SunStats {
  /** Distinct real terraces interacted with (terraceId < 0 sentinels ignored). */
  distinctTerraces: number;
  totalActions: number;
  /** Distinct Amsterdam days with at least one event. */
  activeDays: number;
  /** Consecutive-day streak ending today (or yesterday — an evening person's
   *  streak shouldn't die at breakfast). 0 when the last activity is older. */
  currentStreak: number;
  bestStreak: number;
  /** sunrun_generate count. */
  sunRuns: number;
  /** share + sunrun_share + wrapped_share count. */
  shares: number;
  /** Highest score seen at interaction time, as 0–99, or null. */
  sunniestPct: number | null;
  /** Terrace of that sunniest moment, or null. */
  sunniestTerraceId: number | null;
  /** Day string of the first event, or null for an empty log. */
  sinceDay: string | null;
}

/** Whole-day difference between two yyyy-MM-dd strings (UTC calendar math). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000,
  );
}

export function computeSunStats(
  events: readonly SunLogEvent[],
  todayStr: string,
  dayOf: (ts: number) => string,
): SunStats {
  const days = new Set<string>();
  const terraces = new Set<number>();
  let sunRuns = 0;
  let shares = 0;
  let sunniest: { pct: number; terraceId: number } | null = null;
  let sinceDay: string | null = null;

  for (const e of events) {
    const day = dayOf(e.ts);
    days.add(day);
    if (sinceDay == null || day < sinceDay) sinceDay = day;
    if (e.terraceId >= 0) terraces.add(e.terraceId);
    if (e.action === 'sunrun_generate') sunRuns++;
    if (e.action === 'share' || e.action === 'sunrun_share' || e.action === 'wrapped_share') shares++;
    if (e.score != null && e.terraceId >= 0) {
      const pct = Math.min(99, Math.max(0, Math.round(e.score * 100)));
      if (sunniest == null || pct > sunniest.pct) sunniest = { pct, terraceId: e.terraceId };
    }
  }

  // Streaks over the sorted distinct days.
  const sorted = [...days].sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && dayDiff(sorted[i - 1]!, sorted[i]!) === 1 ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }
  let currentStreak = 0;
  const last = sorted[sorted.length - 1];
  if (last != null) {
    const gap = dayDiff(last, todayStr);
    if (gap <= 1) {
      // Walk back from the last active day while days stay consecutive.
      currentStreak = 1;
      for (let i = sorted.length - 2; i >= 0; i--) {
        if (dayDiff(sorted[i]!, sorted[i + 1]!) === 1) currentStreak++;
        else break;
      }
    }
  }

  return {
    distinctTerraces: terraces.size,
    totalActions: events.length,
    activeDays: days.size,
    currentStreak,
    bestStreak,
    sunRuns,
    shares,
    sunniestPct: sunniest?.pct ?? null,
    sunniestTerraceId: sunniest?.terraceId ?? null,
    sinceDay,
  };
}
