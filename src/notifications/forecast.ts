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

/** Format the block into the standard notification body string. */
export function formatNotificationBody(block: GoodWeatherBlock): string {
  const f = block.fromHour.toString().padStart(2, '0');
  const t = block.toHour.toString().padStart(2, '0');
  return `Lekker terrasweer van ${f}:00 tot ${t}:00 — vind een zonnig terras →`;
}

// ── Top-tier ("cracking day") detection ─────────────────────────────────────
// A genuinely exceptional terrace day deserves more exciting copy than the
// everyday "lekker terrasweer" line — this is the re-activation nudge. We gate
// it on a LONG, CLEAR, WARM block so it stays rare and credible (a few times a
// season, not every mildly-nice day). Thresholds are deliberately stricter
// than isGoodHour's.
const TOP_TIER_MIN_HOURS = 5; // sustained, not a brief sunny gap
const TOP_TIER_MAX_CLOUD = 25; // %, genuinely clear (vs 40 for "good")
const TOP_TIER_MIN_TEMP = 18; // °C, properly warm (vs 14 for "good")

/**
 * True when a good-weather block is exceptional enough to celebrate: a long,
 * clear, warm stretch — a "cracking terrace day". Used by the scheduler to
 * pick the celebratory notification variant.
 */
export function isTopTierBlock(block: GoodWeatherBlock): boolean {
  const lengthHours = block.toHour - block.fromHour + 1;
  return (
    lengthHours >= TOP_TIER_MIN_HOURS &&
    block.avgCloudCover <= TOP_TIER_MAX_CLOUD &&
    block.avgTemp >= TOP_TIER_MIN_TEMP
  );
}

/** Celebratory body for a top-tier day (re-activation nudge). */
export function formatTopTierBody(block: GoodWeatherBlock): string {
  const f = block.fromHour.toString().padStart(2, '0');
  const t = block.toHour.toString().padStart(2, '0');
  return `Top terrasdag op komst! Zon van ${f}:00 tot ${t}:00 — waar drink jij? →`;
}
