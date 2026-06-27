/**
 * "Next Sunny Spot" hand-off engine.
 *
 * When the sun is about to leave the terrace you're sitting at, this finds
 * the nearest alternative that is STILL sunny and will stay sunny LONGER —
 * the single-hop version of a "Chase the Sun" crawl.
 *
 * Design choices (mirroring probe-chase-the-sun.ts):
 *
 *   - SUN_THRESHOLD = 0.5  — matches the probe script and golden.ts's
 *     GOLDEN_THRESHOLD so all three agree on "is it sunny".
 *   - Walk speed = 80 m/min — same constant the probe uses.
 *   - Distance cutoff = 500 m (≈6 min walk) — keeps suggestions walkable
 *     while being slightly more generous than the probe's EASY_M=480 m.
 *   - ORIGIN_HORIZON_MIN = 120 — only show the suggestion when the origin's
 *     sun leaves within 2 hours (otherwise the user isn't in a hurry yet).
 *   - PREFILTER first with haversine ≤ SEARCH_RADIUS_M before scoring —
 *     with 993 terraces in the dataset, scoring all of them per sheet open
 *     would be expensive. The search radius is slightly larger than the walk
 *     cutoff to catch candidates whose straight-line distance would round-
 *     trip within range.
 *
 * Performance: in a dense area like Amsterdam Centrum you typically have
 * 40–80 terraces within 500 m of any given terrace. We prefilter to those
 * and score all of them (one computeSunScore call per terrace per relevant
 * hour = ~2–4 calls per candidate). Total: ~80–320 scoring calls per sheet
 * open, taking well under 10 ms. This is fine.
 */

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { getTreesForTerrace } from '@/src/data/trees';
import { computeSunScore } from '@/src/engines/scoring';
import type { Terrace, Weather, WeatherProfile } from '@/src/engines/types';

/** Score at or above this means "sunny enough to sit outside". */
const SUN_THRESHOLD = 0.5;

/** Walking speed in metres per minute — same as the probe script. */
const WALK_MPM = 80;

/** Maximum walking distance to a hand-off candidate (metres). */
const WALK_CUTOFF_M = 500;

/**
 * Only show the hand-off suggestion when the origin's sun leaves within
 * this many minutes (2 hours). Further away and the user has time to decide
 * later; no need to prompt them now.
 */
const ORIGIN_HORIZON_MIN = 120;

/**
 * Search radius for candidate prefiltering. Slightly larger than WALK_CUTOFF_M
 * to avoid clipping candidates whose straight-line distance would be
 * borderline (the scoring step then applies the precise cutoff).
 */
const SEARCH_RADIUS_M = 600;

export interface HandoffResult {
  /** The suggested next terrace. */
  terrace: Terrace;
  /**
   * The integer hour (Amsterdam local) until which the suggested terrace
   * stays sunny (score ≥ 0.5). Format as HH:00.
   *
   * Example: sunnyUntilHour = 19 → "sunny until 19:00".
   */
  sunnyUntilHour: number;
  /** Straight-line distance from origin to suggestion, in metres. */
  walkMeters: number;
  /** Estimated walk time in minutes (straight-line at 80 m/min, rounded). */
  walkMinutes: number;
}

/** Haversine distance in metres between two WGS84 coordinates. */
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Find the last integer afternoon hour (13–23) at which this terrace's score
 * is still ≥ SUN_THRESHOLD, given pre-computed hourly scores.
 *
 * Returns -1 when the terrace is never sunny in the afternoon window —
 * that case means there's nothing for the user to "lose" so no hand-off
 * is needed.
 */
function sunLeavesHour(hourlyScores: readonly number[]): number {
  let last = -1;
  // We only scan the afternoon/evening window (13–23) because morning sun
  // leaving isn't a "chase the sun" situation — the sun is still rising.
  for (let h = 13; h <= 23; h++) {
    if ((hourlyScores[h] ?? 0) >= SUN_THRESHOLD) last = h;
  }
  return last; // last hour that is sunny; -1 if never sunny
}

/**
 * Find the next sunny spot for a user sitting at `origin`.
 *
 * @param origin          The terrace the user is currently at.
 * @param dateStr         The date in 'YYYY-MM-DD' (Amsterdam local).
 * @param weatherProfile  Synthetic weather profile ('sunny', 'partlyCloudy', etc.).
 * @param hourlyWeather   Optional 24-element array of real forecast weather per
 *                        hour (same shape as in weatherStore). When provided,
 *                        each element overrides the synthetic profile for that
 *                        hour — consistent with how TerraceDetailSheet scores.
 * @param allTerraces     The full terrace list to search. Defaults to TERRACES
 *                        (injected as a parameter so tests can pass small fixtures
 *                        without loading the full 993-terrace dataset).
 * @returns               The best hand-off candidate, or null if none qualifies.
 */
export function findNextSunnySpot(
  origin: Terrace,
  dateStr: string,
  weatherProfile: WeatherProfile,
  hourlyWeather?: readonly (Weather | undefined)[],
  allTerraces: readonly Terrace[] = TERRACES,
): HandoffResult | null {
  // ── 1. Score the origin for the afternoon window ───────────────────────────
  //
  // We compute one score per integer afternoon hour for the origin. This is
  // the same approach as probe-chase-the-sun.ts (which scored at half-hour
  // steps, but integer hours are precise enough for the UX we're building).
  const originBuildings = getBuildingsForTerrace(origin.id);
  const originTrees = getTreesForTerrace(origin.id);
  const originScores: number[] = Array.from({ length: 24 }, (_, h) =>
    computeSunScore(
      origin,
      h,
      dateStr,
      weatherProfile,
      hourlyWeather?.[h],
      originBuildings,
      originTrees,
    ).score,
  );

  // ── 2. Find when the origin's sun leaves ──────────────────────────────────
  const originSunLeavesHour = sunLeavesHour(originScores);

  // Not sunny in the afternoon at all → nothing to hand off from.
  if (originSunLeavesHour < 0) return null;

  // The origin's sun leaves at the END of originSunLeavesHour (i.e. at
  // originSunLeavesHour+1 the terrace goes shady). We tell users the sun
  // goes away at (originSunLeavesHour + 1):00, and look for terraces that
  // are still sunny at that hour.
  const handoffHour = originSunLeavesHour + 1; // the first "dark" hour on origin

  // ── 3. Check the horizon: is the hand-off coming up soon enough? ──────────
  // We check against the current wall-clock hour ONLY when called from UI
  // that passes an hourlyWeather (a proxy for "we have real data / time context").
  // But the pure engine doesn't have access to the current time — that's the
  // UI's job. The UI (TerraceDetailSheet) is responsible for applying the
  // ORIGIN_HORIZON_MIN gate before rendering the result. We still export
  // the constant so the UI can use it.

  // ── 4. Prefilter candidates by distance ───────────────────────────────────
  //
  // CHEAP: haversine uses only arithmetic, no scoring. Filter to within
  // SEARCH_RADIUS_M before scoring anything. This is the key perf win —
  // scoring all 993 terraces would take ~50–200 ms; scoring 40–80 nearby
  // ones takes ~2–5 ms.
  const candidates = allTerraces.filter((t) => {
    if (t.id === origin.id) return false;
    const d = haversineM(origin.lat, origin.lng, t.lat, t.lng);
    return d <= SEARCH_RADIUS_M;
  });

  if (candidates.length === 0) return null;

  // ── 5. Score candidates at the hand-off hour and later hours ──────────────
  //
  // For each candidate we need to know:
  //   (a) Is it sunny AT handoffHour? (≥ SUN_THRESHOLD)
  //   (b) Until when does it stay sunny? (to pick the longest-lasting one)
  //
  // We only score integer hours from handoffHour through 23 — typically 3–10
  // calls per candidate, not the full 24-hour scan. This keeps cost down.
  let bestResult: HandoffResult | null = null;
  let bestSunnyUntil = -1;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = haversineM(origin.lat, origin.lng, candidate.lat, candidate.lng);
    // Apply the stricter walk cutoff at scoring time.
    if (dist > WALK_CUTOFF_M) continue;

    const cBuildings = getBuildingsForTerrace(candidate.id);
    const cTrees = getTreesForTerrace(candidate.id);

    // Is the candidate sunny at the exact hand-off hour?
    const scoreAtHandoff = computeSunScore(
      candidate,
      handoffHour,
      dateStr,
      weatherProfile,
      hourlyWeather?.[handoffHour],
      cBuildings,
      cTrees,
    ).score;

    if (scoreAtHandoff < SUN_THRESHOLD) continue; // not sunny when we'd arrive

    // Find the last hour it stays sunny (= sunnyUntilHour).
    // We start from handoffHour+1 to check hours after arrival.
    // We already know handoffHour is sunny; we look for when it drops.
    let candidateSunnyUntil = handoffHour; // at minimum, sunny at arrival
    for (let h = handoffHour + 1; h <= 23; h++) {
      const s = computeSunScore(
        candidate,
        h,
        dateStr,
        weatherProfile,
        hourlyWeather?.[h],
        cBuildings,
        cTrees,
      ).score;
      if (s >= SUN_THRESHOLD) {
        candidateSunnyUntil = h;
      } else {
        break; // once it drops below threshold, stop scanning
      }
    }

    // The candidate must stay sunny LONGER than the origin (otherwise it
    // doesn't gain us anything meaningful). "Longer" means its last-sunny
    // hour is later than the origin's last-sunny hour.
    if (candidateSunnyUntil <= originSunLeavesHour) continue;

    // Tie-break: prefer longer-lasting, then closer.
    if (
      candidateSunnyUntil > bestSunnyUntil ||
      (candidateSunnyUntil === bestSunnyUntil && dist < bestDist)
    ) {
      bestSunnyUntil = candidateSunnyUntil;
      bestDist = dist;
      bestResult = {
        terrace: candidate,
        // "sunny until HH:00" = the hour AFTER the last-sunny integer hour,
        // matching the goldenUntilHour convention in golden.ts.
        sunnyUntilHour: candidateSunnyUntil + 1,
        walkMeters: Math.round(dist),
        walkMinutes: Math.round(dist / WALK_MPM),
      };
    }
  }

  return bestResult;
}

/** Export the horizon constant so TerraceDetailSheet can apply the time gate. */
export { ORIGIN_HORIZON_MIN, SUN_THRESHOLD };
