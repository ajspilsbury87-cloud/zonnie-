/**
 * "Chase the Sun" crawl engine.
 *
 * Generates a walking route of ~3 terraces timed so the user stays in
 * sunlight across an Amsterdam afternoon. The idea: start at a sunny
 * terrace, hop to the next one as the first falls into shade, and finish
 * at a west-facing golden-hour spot.
 *
 * Algorithm: greedy. At each stop we find the nearest still-sunny terrace
 * that will stay sunny the LONGEST — the same strategy proved viable by
 * scripts/probe-chase-the-sun.ts on the full 993-terrace dataset.
 *
 * Performance: we prefilter with haversine (~600m radius) before scoring.
 * In Amsterdam Centrum that typically yields 40–80 candidates per hop.
 * Each candidate needs one full 24-hour scoring pass (24 computeSunScore
 * calls) so the engine roughly makes 40–80 × 24 = ~960–1920 calls per
 * hop, and ~3k–6k total for a 3-stop crawl. This runs in well under
 * 50 ms. The SEARCH_RADIUS_M constant comes from handoff.ts and is reused
 * here for the same reason.
 *
 * Design choices:
 *   - Integer hours throughout — consistent with how handoff.ts works and
 *     precise enough for the "which bar next" use case.
 *   - arriveHour = sunLeavesHour(prev) + 1 — the first hour the previous
 *     stop goes shady is when we'd move; walk time is shown in the UI but
 *     not consumed from the clock (users don't leave exactly on the hour).
 *   - No revisits — a Set<number> of visited terrace IDs guards this.
 *   - null when < 2 stops — a single-stop "plan" isn't a crawl.
 */

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { getTreesForTerrace } from '@/src/data/trees';
import { computeSunScore } from '@/src/engines/scoring';
import {
  haversineM,
  sunLeavesHour,
  SUN_THRESHOLD,
  WALK_MPM,
  WALK_CUTOFF_M,
} from '@/src/engines/handoff';
import type { Terrace, Weather, WeatherProfile } from '@/src/engines/types';

/** Search radius for haversine prefilter — slightly larger than WALK_CUTOFF_M. */
const SEARCH_RADIUS_M = 600;

/** West-ish facings that catch the golden-hour sun. */
const GOLDEN_FACINGS = new Set<Terrace['facing']>(['W', 'SW', 'NW']);

// ─── Public types ──────────────────────────────────────────────────────────────

export interface CrawlStop {
  /** The terrace at this stop. */
  terrace: Terrace;
  /**
   * Amsterdam local hour at which the crawl arrives here.
   * Stop 1: opts.startHour (default 15).
   * Later stops: previous stop's sunLeavesHour + 1.
   */
  arriveHour: number;
  /**
   * Last Amsterdam local hour at which this terrace is still sunny
   * (score >= SUN_THRESHOLD). Think of it as "stay until XX:59".
   */
  sunUntilHour: number;
  /** Straight-line walk distance from the previous stop, metres (0 for stop 1). */
  walkMetersFromPrev: number;
  /** Estimated walk time from previous stop, minutes at 80 m/min (0 for stop 1). */
  walkMinutesFromPrev: number;
  /**
   * True only on the last stop when it faces a golden-hour direction (W/SW/NW)
   * OR is the stop staying sunny latest. Always false on earlier stops.
   */
  isGoldenFinish: boolean;
}

export interface CrawlPlan {
  stops: CrawlStop[];
  /** Amsterdam local hour the crawl starts (= arriveHour of stop 1). */
  startHour: number;
  /**
   * Amsterdam local hour the sun leaves the final stop. Equals the last
   * stop's sunUntilHour.
   */
  endHour: number;
  /**
   * Total minutes the user spends in sun across all stops.
   * Clamped so a stop's sun-end doesn't exceed the next stop's arriveHour
   * (the user leaves before the shade arrives).
   */
  totalSunMinutes: number;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Compute a full 24-hour score array for a terrace (index = Amsterdam hour).
 * Used both for the origin check and for finding each hop's sunLeavesHour.
 */
function hourlyScores(
  terrace: Terrace,
  dateStr: string,
  weatherProfile: WeatherProfile,
  hourlyWeather?: readonly (Weather | undefined)[],
): number[] {
  const buildings = getBuildingsForTerrace(terrace.id);
  const trees = getTreesForTerrace(terrace.id);
  return Array.from({ length: 24 }, (_, h) =>
    computeSunScore(
      terrace,
      h,
      dateStr,
      weatherProfile,
      hourlyWeather?.[h],
      buildings,
      trees,
    ).score,
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a walking sun crawl starting at `originId`.
 *
 * @param originId        ID of the starting terrace.
 * @param dateStr         Date in 'YYYY-MM-DD' (Amsterdam local).
 * @param weatherProfile  Synthetic weather profile ('sunny', 'partlyCloudy', etc.).
 * @param hourlyWeather   Optional 24-element array of real forecast weather, overrides the
 *                        synthetic profile per hour (consistent with handoff.ts + scoring.ts).
 * @param opts            Optional overrides: startHour (default 15), maxStops (default 3),
 *                        walkCutoffM (default WALK_CUTOFF_M), allTerraces (default TERRACES).
 * @returns               A CrawlPlan with ≥2 stops, or null if the origin isn't sunny
 *                        at startHour or no valid hand-offs exist.
 */
export function generateSunCrawl(
  originId: number,
  dateStr: string,
  weatherProfile: WeatherProfile,
  hourlyWeather?: readonly (Weather | undefined)[],
  opts?: {
    startHour?: number;
    maxStops?: number;
    walkCutoffM?: number;
    allTerraces?: readonly Terrace[];
    /**
     * Terrace IDs to skip when choosing hop candidates. The origin is still
     * allowed as stop 1 — the exclude list only filters the greedy hop loop.
     * Used by the "Shuffle" action in the UI to force a different route.
     */
    excludeIds?: readonly number[];
  },
): CrawlPlan | null {
  const startHour = opts?.startHour ?? 15;
  const maxStops = opts?.maxStops ?? 3;
  const walkCutoffM = opts?.walkCutoffM ?? WALK_CUTOFF_M;
  const allTerraces = opts?.allTerraces ?? TERRACES;
  const excludeSet = new Set<number>(opts?.excludeIds ?? []);

  // ── 1. Look up origin ────────────────────────────────────────────────────────
  const origin = allTerraces.find((t) => t.id === originId);
  if (!origin) return null;

  // ── 2. Score origin + verify it is sunny at startHour ───────────────────────
  const originScores = hourlyScores(origin, dateStr, weatherProfile, hourlyWeather);
  if ((originScores[startHour] ?? 0) < SUN_THRESHOLD) return null;

  const originSunLeaves = sunLeavesHour(originScores);
  // sunLeavesHour returns -1 if never sunny in the afternoon window (13-23).
  // We already confirmed it's sunny at startHour, so this guard is defensive.
  if (originSunLeaves < 0) return null;

  // ── 3. Build stop 1 ─────────────────────────────────────────────────────────
  const stops: CrawlStop[] = [
    {
      terrace: origin,
      arriveHour: startHour,
      sunUntilHour: originSunLeaves,
      walkMetersFromPrev: 0,
      walkMinutesFromPrev: 0,
      isGoldenFinish: false, // updated at the end
    },
  ];

  const visited = new Set<number>([originId]);

  // ── 4. Greedy hop loop ──────────────────────────────────────────────────────
  for (let guard = 0; guard < maxStops - 1; guard++) {
    const cur = stops[stops.length - 1]!;

    // If the current stop stays sunny through the last afternoon hour, there's
    // no reason to move — it's already the golden finish.
    if (cur.sunUntilHour >= 23) break;

    // The user moves when the current stop's sun runs out. The next stop's
    // arriveHour is the first hour the current stop goes shady.
    const nextArriveHour = cur.sunUntilHour + 1;

    // Prefilter candidates within the search radius (cheap arithmetic).
    // ~40–80 candidates in a dense area → ~24 scoring calls each per hop.
    // excludeSet lets the "Shuffle" caller rule out the previous route's stops.
    const candidates = allTerraces.filter((t) => {
      if (visited.has(t.id)) return false;
      if (excludeSet.has(t.id)) return false;
      return haversineM(cur.terrace.lat, cur.terrace.lng, t.lat, t.lng) <= SEARCH_RADIUS_M;
    });

    if (candidates.length === 0) break;

    // Score each candidate and find the one sunny longest at arrival.
    let bestCandidate: Terrace | null = null;
    let bestSunLeaves = -1;
    let bestDist = Infinity;

    for (const candidate of candidates) {
      const dist = haversineM(cur.terrace.lat, cur.terrace.lng, candidate.lat, candidate.lng);
      // Apply the stricter walk cutoff at scoring time (prefilter used wider radius).
      if (dist > walkCutoffM) continue;

      const scores = hourlyScores(candidate, dateStr, weatherProfile, hourlyWeather);

      // Must be sunny at the moment we arrive.
      if ((scores[nextArriveHour] ?? 0) < SUN_THRESHOLD) continue;

      // Find when this candidate's sun leaves.
      const candidateSunLeaves = sunLeavesHour(scores);
      // sunLeavesHour scans 13–23; if the candidate is sunny at nextArriveHour
      // but sunLeavesHour returns < nextArriveHour, treat arriveHour as the floor.
      const effectiveSunLeaves = Math.max(candidateSunLeaves, nextArriveHour);

      // Tie-break: prefer longest-lasting, then closest.
      if (
        effectiveSunLeaves > bestSunLeaves ||
        (effectiveSunLeaves === bestSunLeaves && dist < bestDist)
      ) {
        bestCandidate = candidate;
        bestSunLeaves = effectiveSunLeaves;
        bestDist = dist;
      }
    }

    if (!bestCandidate) break;

    visited.add(bestCandidate.id);
    stops.push({
      terrace: bestCandidate,
      arriveHour: nextArriveHour,
      sunUntilHour: bestSunLeaves,
      walkMetersFromPrev: Math.round(bestDist),
      walkMinutesFromPrev: Math.round(bestDist / WALK_MPM),
      isGoldenFinish: false, // updated below
    });

    // Stop early if we've reached the max.
    if (stops.length >= maxStops) break;
  }

  // ── 5. Need at least 2 stops to be a crawl ──────────────────────────────────
  if (stops.length < 2) return null;

  // ── 6. Mark isGoldenFinish on the last stop only ────────────────────────────
  //
  // A "golden finish" is a west-ish terrace that catches the low evening sun.
  // We mark the last stop if it faces W/SW/NW OR if it stays sunny the latest
  // of all stops (it was the best we could do — golden by position if not by
  // facing).
  const lastStop = stops[stops.length - 1]!;
  const latestSunUntil = Math.max(...stops.map((s) => s.sunUntilHour));
  lastStop.isGoldenFinish =
    GOLDEN_FACINGS.has(lastStop.terrace.facing) || lastStop.sunUntilHour === latestSunUntil;

  // ── 7. Compute totalSunMinutes ───────────────────────────────────────────────
  //
  // For each stop: (sunUntilHour - arriveHour) * 60.
  // Clamp the sun-end so it doesn't exceed the next stop's arriveHour
  // (the user leaves before shade — they don't sit through the shady hour).
  let totalSunMinutes = 0;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const nextArriveHour = i + 1 < stops.length ? stops[i + 1]!.arriveHour : Infinity;
    const clampedSunEnd = Math.min(stop.sunUntilHour, nextArriveHour);
    totalSunMinutes += Math.max(0, clampedSunEnd - stop.arriveHour) * 60;
  }

  return {
    stops,
    startHour,
    endHour: lastStop.sunUntilHour,
    totalSunMinutes,
  };
}

/**
 * Quick viability check — true iff generateSunCrawl returns a plan with ≥2 stops.
 * Used by the UI to decide whether to show the "Chase the Sun" entry button.
 */
export function isCrawlViable(
  originId: number,
  dateStr: string,
  weatherProfile: WeatherProfile,
  hourlyWeather?: readonly (Weather | undefined)[],
): boolean {
  return generateSunCrawl(originId, dateStr, weatherProfile, hourlyWeather) !== null;
}
