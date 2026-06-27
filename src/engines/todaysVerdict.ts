/**
 * Pure helpers for the "Today's Verdict" daily-summary card.
 *
 * Why a separate file?
 *   The verdict logic has no React or Zustand imports, so it can be tested
 *   with plain Jest without pulling in AsyncStorage, Reanimated, or any
 *   native module. The component (TodaysVerdict.tsx) imports from here and
 *   feeds in the scored data it has already computed.
 *
 * How the verdict is derived:
 *   We scan today's terraces over the "core terrace day" window (08:00–21:00)
 *   and count how many reach a "good" threshold (score > 0.65, i.e. "mostly
 *   sunny" or better). That count drives the headline tier:
 *
 *     ≥ 10 strong terraces → "Cracking terrace day" ☀️
 *     ≥  2 strong terraces → "A few sunny spots" ⛅
 *     else                 → "Not really a terrace day" ☁️
 *
 *   The stat line reports the count of strong terraces and the city-wide
 *   best 2-hour window (the window that maximises the average score across
 *   ALL terraces simultaneously).
 *
 * This file is intentionally free of React, Zustand, and any native imports
 * so it can be imported in Jest tests without mocking.
 */

import { findBestWindow } from './scoring';

// ── Threshold ──────────────────────────────────────────────────────────────────
// Aligns with "mostly sunny" band floor in bands.ts (> 0.65).
// We use the same value so the card and the score badges are consistent.
export const VERDICT_STRONG_THRESHOLD = 0.65;

// Tier boundaries — counts of "strong" terraces required for each headline.
// Chosen empirically: on a sunny Amsterdam June day ~30–50 terraces exceed 0.65
// at peak; on an overcast day almost none do. These boundaries feel right:
//   ≥ 10 → clearly a good day, go out
//    2-9 → partial sun, some options
//      < 2 → not worth a special trip
export const VERDICT_TIER_HIGH = 10;
export const VERDICT_TIER_MID = 2;

/** The three possible daily verdict tiers. */
export type VerdictTier = 'high' | 'mid' | 'low';

export interface TodaysVerdictData {
  tier: VerdictTier;
  /** Number of terraces scoring above VERDICT_STRONG_THRESHOLD city-wide today. */
  strongCount: number;
  /**
   * Best 2-hour window city-wide for today, or null if none qualifies.
   * Derived by running findBestWindow over the AVERAGE hourly scores across
   * all terraces — "when is the city sunniest overall?"
   */
  bestWindow: { fromHour: number; toHour: number } | null;
}

/**
 * Determine the verdict for the given set of all-day scores.
 *
 * @param allDayScoresByTerrace
 *   Array of 24-element arrays (one per terrace), each indexed by hour.
 *   Pass the hours 0–23; values outside [8,21] are ignored by findBestWindow.
 *
 * This function is pure — no side effects, no imports beyond scoring.ts.
 * Easy to unit-test: build synthetic 24-hour arrays and assert on the output.
 */
export function computeTodaysVerdict(
  allDayScoresByTerrace: readonly (readonly number[])[],
): TodaysVerdictData {
  if (allDayScoresByTerrace.length === 0) {
    return { tier: 'low', strongCount: 0, bestWindow: null };
  }

  // Build city-wide average score per hour (mean across all terraces).
  const cityAvgByHour: number[] = Array.from({ length: 24 }, (_, h) => {
    let sum = 0;
    let n = 0;
    for (const scores of allDayScoresByTerrace) {
      const s = scores[h];
      if (s != null) {
        sum += s;
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  });

  // City-wide best 2-hour window (08:00–21:00 search range).
  const bestWindow = findBestWindow(cityAvgByHour, 2, 0.35, 8, 21);

  // Count terraces that score strongly at ANY point during the day (08–21).
  // We use the peak score per terrace (max over hours) so an early-afternoon
  // SW terrace that is excellent at 15:00 but moderate at 13:00 still counts.
  let strongCount = 0;
  for (const scores of allDayScoresByTerrace) {
    let peak = 0;
    for (let h = 8; h <= 21; h++) {
      const s = scores[h];
      if (s != null && s > peak) peak = s;
    }
    if (peak > VERDICT_STRONG_THRESHOLD) strongCount++;
  }

  const tier: VerdictTier =
    strongCount >= VERDICT_TIER_HIGH ? 'high'
    : strongCount >= VERDICT_TIER_MID ? 'mid'
    : 'low';

  return {
    tier,
    strongCount,
    bestWindow: bestWindow !== null
      ? { fromHour: bestWindow.fromHour, toHour: bestWindow.toHour }
      : null,
  };
}
