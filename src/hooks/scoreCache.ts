/**
 * Per-hour sun-score cache + pure scoring helpers.
 *
 * Extracted from useScoredTerraces so the scoring logic can be imported WITHOUT
 * pulling in React / Zustand stores (which transitively import AsyncStorage and
 * fail to load in the jest test environment). This module imports only pure
 * data + engine code, so it's freely testable.
 *
 * Caching at (terrace, hour, date, weather-bucket) means time-window shifts
 * reuse most of the prior computation — going 14:00–17:00 → 15:00–18:00 only
 * computes the new hour 18, the rest are O(1) lookups. The cache is module-level
 * so it's shared across every caller (the ranked list AND the group-vote share),
 * which keeps repeated scoring of the same terrace/hour free.
 *
 * Bounded by MAX_CACHE_SIZE; when exceeded, the oldest 20% of entries are
 * dropped (FIFO — recent time selections are the most likely to be revisited).
 */
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { getTreesForTerrace } from '@/src/data/trees';
import { computeSunScore } from '@/src/engines/scoring';
import type { Terrace, Weather } from '@/src/engines/types';

const HOUR_SCORE_CACHE = new Map<string, number>();
// Must comfortably exceed the largest single working set: TodaysVerdict scores
// the WHOLE dataset across all 24 hours (≈2,000 terraces × 24 = ~48k entries)
// in one pass, and the ranked list/map add a multi-hour window on top. At the
// old 8,000 cap that pass thrashed — evicting entries before reuse, so a warm
// re-score of a full-day window cost ~750ms on-device (measured) and also
// evicted the entries the map + list needed, forcing THEM to recompute cold.
// 60,000 holds a full 24h dataset pass plus a second weather bucket during a
// refresh, with headroom to ~2,500 terraces. Memory ≈ 60k × ~150B ≈ 9MB.
// (Sized as a constant rather than importing TERRACES.length to keep this
// module free of React/store/data deps — see the file header.)
const MAX_CACHE_SIZE = 60000;

function weatherBucket(w: Weather | undefined): string {
  if (!w) return 'syn';
  // Bucket EVERY signal computeSunScore reads, not just cloud cover —
  // keying on cloud alone kept serving pre-refresh scores when radiation,
  // temp or wind changed within the same cloud bucket. Buckets are coarse
  // (25 W/m2, 2C, 5 km/h) to keep hit rates high.
  const rad = w.directRadiation != null ? Math.round(w.directRadiation / 25) : -1;
  const wind = w.windSpeed != null ? Math.round(w.windSpeed / 5) : -1;
  return `${Math.round(w.cloudCover / 5) * 5}|${rad}|${Math.round(w.temp / 2)}|${wind}`;
}

/** Sun score for a single terrace at a single hour, memoised. */
export function cachedHourScore(
  terrace: Pick<Terrace, 'id' | 'lat' | 'lng' | 'facing' | 'openness'>,
  hour: number,
  dateStr: string,
  weather: Weather | undefined,
): number {
  const key = `${terrace.id}|${hour}|${dateStr}|${weatherBucket(weather)}`;
  const hit = HOUR_SCORE_CACHE.get(key);
  if (hit != null) return hit;
  const buildings = getBuildingsForTerrace(terrace.id);
  const trees = getTreesForTerrace(terrace.id);
  const score = computeSunScore(
    terrace,
    hour,
    dateStr,
    'sunny',
    weather,
    buildings,
    trees,
  ).score;
  if (HOUR_SCORE_CACHE.size >= MAX_CACHE_SIZE) {
    const dropCount = Math.floor(MAX_CACHE_SIZE * 0.2);
    let i = 0;
    for (const k of HOUR_SCORE_CACHE.keys()) {
      if (i++ >= dropCount) break;
      HOUR_SCORE_CACHE.delete(k);
    }
  }
  HOUR_SCORE_CACHE.set(key, score);
  return score;
}

/**
 * Average sun score for ONE terrace across the visit window — same per-hour
 * scoring + cache as the ranked list, so a score computed here matches what the
 * list row displayed. Filter-INDEPENDENT: it scores whatever terrace it's
 * handed, ignoring the active search/region/match/etc. filters.
 *
 * Used by `useShortlistScores` (group-vote share) so a shortlisted terrace is
 * still scored even if a filter change has since removed it from the visible
 * list — previously the share looked the score up in the FILTERED list and
 * silently dropped any now-hidden terrace from the vote URL.
 */
export function rangeScoreForTerrace(
  terrace: Terrace,
  fromHour: number,
  toHour: number,
  dateStr: string,
  hourlyWeather: Weather[] | undefined,
): number {
  const span = Math.max(1, toHour - fromHour + 1);
  let sum = 0;
  for (let h = fromHour; h <= toHour; h++) {
    sum += cachedHourScore(terrace, h, dateStr, hourlyWeather?.[h]);
  }
  return sum / span;
}
