import { useMemo } from 'react';

import { TERRACES } from '@/src/data/terraces';
import { getBuildings } from '@/src/data/buildings';
import { regionForArea } from '@/src/data/regions';
import { computeSunScore } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useAreaStore } from '@/src/store/areaStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import type { Terrace, Weather } from '@/src/engines/types';

export interface ScoredTerrace {
  terrace: Terrace;
  /** Average sun score across the visit window [fromHour..toHour], 0–1. */
  score: number;
}

/**
 * Diacritic-insensitive lowercase fold so "kiebert" matches "Café Kiebêrt".
 * NFD decomposes accented characters into base + combining mark, then we
 * strip the combining marks (Unicode block U+0300–U+036F).
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Pre-folded haystack per terrace. Built once per session — folding 378 × 4
 * fields on every keystroke is fine but doing it once is free.
 */
const HAYSTACK = new Map<number, string>();
for (const t of TERRACES) {
  HAYSTACK.set(t.id, fold(`${t.name} ${t.area} ${t.vibe} ${t.address}`));
}

// ─── Per-hour scoring cache ──────────────────────────────────────────────────
//
// Key insight for the time-change crash: every chip tap was re-running
// `computeSunScore` for 378 terraces × every hour in the visit window, and
// each call ray-casts against ~343 procedural buildings. ~500k operations on
// the JS thread per tap. Rapid taps compound into multi-second blocks and
// iOS Watchdog kills the app.
//
// Caching at (terrace, hour, date, weather-bucket) means time-window shifts
// reuse most of the prior computation — going 14:00–17:00 → 15:00–18:00
// only computes the new hour 18, the others are O(1) lookups.
//
// Bounded by `MAX_CACHE_SIZE`. When exceeded, the oldest 20% of entries are
// dropped (FIFO is fine for our workload — the user's recent time selections
// are the most-likely-to-be-revisited).

const HOUR_SCORE_CACHE = new Map<string, number>();
const MAX_CACHE_SIZE = 8000;

function weatherBucket(w: Weather | undefined): string {
  if (!w) return 'syn';
  // Round to 5%-buckets so tiny forecast variations don't busts the cache.
  return `${Math.round(w.cloudCover / 5) * 5}`;
}

function cachedHourScore(
  terrace: Pick<Terrace, 'id' | 'lat' | 'lng' | 'facing'>,
  buildings: ReturnType<typeof getBuildings>,
  hour: number,
  dateStr: string,
  weather: Weather | undefined,
): number {
  const key = `${terrace.id}|${hour}|${dateStr}|${weatherBucket(weather)}`;
  const hit = HOUR_SCORE_CACHE.get(key);
  if (hit != null) return hit;
  const score = computeSunScore(
    terrace,
    buildings,
    hour,
    dateStr,
    'sunny', // weatherProfile is unused when weather override is provided
    weather,
  ).score;
  if (HOUR_SCORE_CACHE.size >= MAX_CACHE_SIZE) {
    // Drop the oldest 20% — Map iteration is insertion order, so this is FIFO.
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
 * Score every terrace by the AVERAGE sun across the user's visit window
 * (`fromHour..toHour`) on the selected date, filter by selected regions and
 * free-text query, and sort descending by score.
 *
 * Uses a per-hour memoization cache so repeated time changes are cheap —
 * critical for stability since uncached recomputes block the JS thread for
 * long enough that iOS kills the app on rapid chip taps.
 *
 * Filters are AND-combined: a terrace must pass region AND query to appear.
 * Empty region selection or empty query = that filter is bypassed.
 */
export function useScoredTerraces(): ScoredTerrace[] {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
  const favoritesOnly = useAreaStore((s) => s.favoritesOnly);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
  const query = useSearchStore((s) => s.query);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  return useMemo(() => {
    const buildings = getBuildings();
    const dateStr = selectedDateStr(dateOffset);
    const q = fold(query.trim());
    const weatherEntry = weatherByDate[dateStr];
    const hourlyWeather =
      weatherEntry?.status === 'ready' ? weatherEntry.data : undefined;

    let filtered: readonly Terrace[] = TERRACES;
    if (favoritesOnly) {
      filtered = filtered.filter((t) => favoriteIds.has(t.id));
    }
    if (selectedRegions.size > 0) {
      filtered = filtered.filter((t) => {
        const region = regionForArea(t.area);
        return region != null && selectedRegions.has(region);
      });
    }
    if (q.length > 0) {
      filtered = filtered.filter((t) => {
        const haystack = HAYSTACK.get(t.id);
        return haystack != null && haystack.includes(q);
      });
    }

    // Range score = mean of cached per-hour scores.
    const span = Math.max(1, toHour - fromHour + 1);
    const scored: ScoredTerrace[] = filtered.map((terrace) => {
      let sum = 0;
      for (let h = fromHour; h <= toHour; h++) {
        sum += cachedHourScore(terrace, buildings, h, dateStr, hourlyWeather?.[h]);
      }
      return { terrace, score: sum / span };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [
    dateOffset,
    fromHour,
    toHour,
    selectedRegions,
    favoritesOnly,
    favoriteIds,
    query,
    weatherByDate,
  ]);
}
