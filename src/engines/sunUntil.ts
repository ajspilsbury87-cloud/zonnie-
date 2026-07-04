/**
 * "Sun until HH:00" — the single number the peek card leads with.
 *
 * Given a terrace's 24 pre-computed hourly scores and the hour the user's
 * visit starts, this finds how long the sun sticks around: the contiguous
 * run of sunny hours (score ≥ SUN_THRESHOLD) starting at `fromHour`.
 *
 * Conventions match the hand-off engine (handoff.ts):
 *   - SUN_THRESHOLD = 0.5 is the shared "sunny enough to sit outside" bar.
 *   - The returned hour is the one AFTER the last sunny hour — a run whose
 *     last sunny hour is 18 reads as "sun until 19:00", same as
 *     HandoffResult.sunnyUntilHour and goldenUntilHour in golden.ts.
 *
 * The scan stops at the first non-sunny hour rather than skipping gaps:
 * if a terrace is sunny 14–15, shaded at 16, and sunny again 17–18, the
 * honest answer at 14:00 is "sun until 16:00" — promising 19:00 would
 * strand the user in an hour of shade.
 */

import { SUN_THRESHOLD } from '@/src/engines/handoff';

/**
 * @param hourlyScores  24-element array of sun scores (index = hour 0–23).
 * @param fromHour      Integer hour the visit starts (Amsterdam local, 0–23).
 * @returns             The hour the sun leaves, for display as "HH:00", or
 *                      null when the terrace isn't sunny at `fromHour`
 *                      (there's no run to measure — caller shows the
 *                      "in shade" fallback instead).
 */
export function sunUntilHour(
  hourlyScores: readonly number[],
  fromHour: number,
): number | null {
  if (!Number.isInteger(fromHour) || fromHour < 0 || fromHour > 23) return null;
  if ((hourlyScores[fromHour] ?? 0) < SUN_THRESHOLD) return null;

  let lastSunny = fromHour;
  for (let h = fromHour + 1; h <= 23; h++) {
    if ((hourlyScores[h] ?? 0) >= SUN_THRESHOLD) lastSunny = h;
    else break;
  }
  // In practice scores are 0 after sunset, so lastSunny + 1 never exceeds
  // 23 in Amsterdam — but the math caps at 24 ("24:00") by construction.
  return lastSunny + 1;
}

/** Format an integer hour as "HH:00" — shared display convention. */
export function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}
