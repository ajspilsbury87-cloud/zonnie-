/**
 * "Good weather tomorrow" detector.
 *
 * Walks tomorrow's hourly forecast (from `weatherStore`) and finds the
 * longest contiguous block where the conditions look like genuine
 * terrace weather. If that block is at least 3 hours long, the
 * scheduler turns it into a push notification: "Sunny weather expected
 * tomorrow from HH:00 to HH:00 — find a terrace →".
 *
 * Definition of a "good" hour (city-wide, terrace-agnostic):
 *   - cloudCover < 40%   — clear to partly-cloudy sky
 *   - temp ≥ 14°C        — warm enough for outdoor seating
 *   - hour 9..21         — within a sensible "go outside" window
 *
 * Per-terrace shadow/facing isn't factored — the notification answers
 * "is tomorrow worth the trip?" not "which exact venue should I go to".
 * The user opens the app to figure that part out.
 */

import type { Weather } from '@/src/engines/types';

const MAX_CLOUD_FOR_GOOD = 40; // percent
const MIN_TEMP_FOR_GOOD = 14; // °C
const MIN_HOUR = 9;
const MAX_HOUR = 21;
const MIN_BLOCK_HOURS = 3;

export interface GoodWeatherBlock {
  /** Local Amsterdam hour (inclusive) the block starts. */
  fromHour: number;
  /** Local Amsterdam hour (inclusive) the block ends. */
  toHour: number;
  /** Average cloud cover within the block, %. */
  avgCloudCover: number;
  /** Average temperature within the block, °C. */
  avgTemp: number;
}

function isGoodHour(w: Weather | undefined): boolean {
  if (!w) return false;
  if (w.cloudCover >= MAX_CLOUD_FOR_GOOD) return false;
  if (w.temp < MIN_TEMP_FOR_GOOD) return false;
  return true;
}

/**
 * Find the LONGEST contiguous good-weather block within hours [9..21].
 * Ties broken in favour of earlier-in-the-day. Returns null if no
 * eligible block reaches `MIN_BLOCK_HOURS`.
 */
export function findGoodWeatherBlock(
  hourly: readonly (Weather | undefined)[],
): GoodWeatherBlock | null {
  if (!hourly || hourly.length === 0) return null;

  let bestStart = -1;
  let bestEnd = -1;
  let bestLen = 0;

  let curStart = -1;
  for (let h = MIN_HOUR; h <= MAX_HOUR; h++) {
    const ok = isGoodHour(hourly[h]);
    if (ok) {
      if (curStart < 0) curStart = h;
      const len = h - curStart + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
        bestEnd = h;
      }
    } else {
      curStart = -1;
    }
  }

  if (bestLen < MIN_BLOCK_HOURS) return null;

  let cloudSum = 0;
  let tempSum = 0;
  let count = 0;
  for (let h = bestStart; h <= bestEnd; h++) {
    const w = hourly[h];
    if (!w) continue;
    cloudSum += w.cloudCover;
    tempSum += w.temp;
    count++;
  }

  return {
    fromHour: bestStart,
    toHour: bestEnd,
    avgCloudCover: Math.round(cloudSum / count),
    avgTemp: Math.round(tempSum / count),
  };
}

/** Format the block into the notification body string. */
export function formatNotificationBody(block: GoodWeatherBlock): string {
  const f = block.fromHour.toString().padStart(2, '0');
  const t = block.toHour.toString().padStart(2, '0');
  return `Looks like good terrace weather from ${f}:00 to ${t}:00 — find a sunny spot →`;
}
