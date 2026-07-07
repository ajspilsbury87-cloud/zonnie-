/**
 * Golden-hour helpers — tiny pure functions over a day's 24 hourly sun
 * scores (index = Amsterdam local hour, values 0–1, as produced by
 * `computeSunScore` per hour).
 *
 * Two consumers:
 *   - Sundowner countdown pill on the terrace detail sheet
 *     ("☀️ Sun leaves this terrace in 40 min") — urgency cue, the fact
 *     someone announces to the table.
 *   - The upcoming Sun Flex share card ("golden until 19:00").
 *
 * Kept separate from scoring.ts on purpose: these are presentation-level
 * derivations of the score curve, not part of the score computation.
 */

/** Score at/above this counts as "golden" (matches the 'mostly' band floor
 *  in bands.ts — these drifted when the bands were recalibrated, so golden
 *  pills appeared on terraces whose badge said partial/shade). */
const GOLDEN_THRESHOLD = 0.65;
/** Score below this counts as "sun has left" (matches the 'partial' band floor). */
const SUNDOWN_THRESHOLD = 0.4;
/** Only show the countdown when the drop is at most this many minutes away. */
const SUNDOWNER_HORIZON_MIN = 90;

/**
 * The hour (0–24, Amsterdam local) until which the terrace stays "golden"
 * today: the END boundary of the last hour whose score ≥ 0.5.
 *
 * Example: scores ≥ 0.5 through hour 19 (19:00–19:59) → returns 20
 * → render as "golden until 20:00".
 *
 * Returns null when no hour qualifies (overcast day / deep-shade terrace).
 */
export function goldenUntilHour(
  hourlyScores: readonly number[],
  threshold = GOLDEN_THRESHOLD,
): number | null {
  let last = -1;
  for (let h = 0; h < Math.min(24, hourlyScores.length); h++) {
    if ((hourlyScores[h] ?? 0) >= threshold) last = h;
  }
  return last >= 0 ? last + 1 : null;
}

/**
 * Minutes until the sun "leaves" this terrace, measured from `nowHour`
 * (fractional Amsterdam local hour, e.g. 17.25 = 17:15).
 *
 * Defined as the first upcoming integer-hour boundary whose score drops
 * below 0.3. Only returns a value when:
 *   - the terrace currently HAS sun (score at the current hour ≥ 0.3), and
 *   - the drop is within the next 90 minutes (urgency window).
 *
 * Returns null otherwise — the pill simply doesn't render.
 */
export function sundownerMinutes(
  hourlyScores: readonly number[],
  nowHour: number,
  dropThreshold = SUNDOWN_THRESHOLD,
  horizonMin = SUNDOWNER_HORIZON_MIN,
): number | null {
  if (nowHour < 0 || nowHour >= 24) return null;
  const current = hourlyScores[Math.floor(nowHour)] ?? 0;
  if (current < dropThreshold) return null; // no sun now → nothing to lose

  for (let h = Math.floor(nowHour) + 1; h < Math.min(24, hourlyScores.length); h++) {
    if ((hourlyScores[h] ?? 0) < dropThreshold) {
      const minutes = Math.round((h - nowHour) * 60);
      return minutes > 0 && minutes <= horizonMin ? minutes : null;
    }
  }
  return null; // sun stays past the end of the scored day
}
