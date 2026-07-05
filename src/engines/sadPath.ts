/**
 * Sad-path helper — when the current window has no real sun, find the hour
 * it comes back so the UI can say so honestly ("sun returns around 15:00")
 * instead of showing a silent ranking of near-zero scores.
 *
 * Deliberately weather-only (cloud cover + sunset bound): scanning 24 cheap
 * numbers, never the terrace scorer — this runs on the main list render
 * path and must stay O(hours), not O(terraces).
 */

import type { Weather } from '@/src/engines/types';

/** Cloud cover below this counts as "the sun is out" for the banner. */
const SUNNY_CLOUD_MAX = 45;

/**
 * First hour AFTER `afterHour` (exclusive) and at or before `sunsetH` with
 * cloud cover under the sunny threshold. Null when the rest of the day
 * stays grey (or data is missing).
 */
export function nextSunnyHour(
  hourly: readonly (Weather | undefined)[] | undefined,
  afterHour: number,
  sunsetH: number,
): number | null {
  if (!hourly) return null;
  const from = Math.max(0, Math.floor(afterHour) + 1);
  const to = Math.min(23, Math.floor(sunsetH));
  for (let h = from; h <= to; h++) {
    const w = hourly[h];
    if (w != null && w.cloudCover < SUNNY_CLOUD_MAX) return h;
  }
  return null;
}

/**
 * Whether the ranked list should show the "no real sun in this window"
 * banner: there ARE results, but even the best of them is dismal.
 * Threshold sits well below the 'partial' band floor so the banner never
 * argues with a list that still shows believable sun.
 */
export function isGreyWindow(topScore: number | undefined, listLength: number): boolean {
  return listLength > 0 && topScore != null && topScore < 0.25;
}
