import { useMemo } from 'react';

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { regionForArea } from '@/src/data/regions';
import { categoriesForTerrace } from '@/src/data/categories';
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
  /** Distance from user's location in metres, if available. */
  distanceM?: number;
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
// Caching at (terrace, hour, date, weather-bucket) means time-window shifts
// reuse most of the prior computation — going 14:00–17:00 → 15:00–18:00
// only computes the new hour 18, the others are O(1) lookups.
//
// Bounded by MAX_CACHE_SIZE. When exceeded, the oldest 20% of entries are
// dropped (FIFO is fine — the user's recent time selections are most likely
// to be revisited).

const HOUR_SCORE_CACHE = new Map<string, number>();
const MAX_CACHE_SIZE = 8000;

function weatherBucket(w: Weather | undefined): string {
  if (!w) return 'syn';
  return `${Math.round(w.cloudCover / 5) * 5}`;
}

function cachedHourScore(
  terrace: Pick<Terrace, 'id' | 'lat' | 'lng' | 'facing'>,
  hour: number,
  dateStr: string,
  weather: Weather | undefined,
): number {
  const key = `${terrace.id}|${hour}|${dateStr}|${weatherBucket(weather)}`;
  const hit = HOUR_SCORE_CACHE.get(key);
  if (hit != null) return hit;
  const buildings = getBuildingsForTerrace(terrace.id);
  const score = computeSunScore(
    terrace,
    buildings,
    hour,
    dateStr,
    'sunny',
    weather,
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

// ─── Distance helpers ────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_AT_AMS = 111320 * Math.cos(52.37 * (Math.PI / 180));

/** Flat-earth distance in metres — accurate to <0.5% within Amsterdam. */
function distanceMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lng2 - lng1) * M_PER_DEG_LNG_AT_AMS;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance decay multiplier: maps distance → [0,1] with exponential falloff.
 *   0 m   → 1.0
 *   500 m → 0.78
 *   1 km  → 0.61
 *   2 km  → 0.37
 *   5 km  → 0.08
 *
 * Half-life ~1 km — a terrace 1 km away must score ~60% higher to beat
 * one 200 m away with the same sun score.
 */
function distanceDecay(metres: number): number {
  return Math.exp(-metres / 1000);
}

/**
 * Score every terrace by average sun across the visit window, filter by
 * active filters, and sort by score (or by nearest+sunniest if sortByDistance
 * is on and a user coordinate is provided).
 */
export function useScoredTerraces(
  userCoord?: { lat: number; lng: number } | null,
): ScoredTerrace[] {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
  const selectedCategories = useAreaStore((s) => s.selectedCategories);
  const favoritesOnly = useAreaStore((s) => s.favoritesOnly);
  const matchModeOnly = useAreaStore((s) => s.matchModeOnly);
  const sortByDistance = useAreaStore((s) => s.sortByDistance);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
  const query = useSearchStore((s) => s.query);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  // Stable coord key — minor GPS jitter (~11 m at 4dp) doesn't bust the memo.
  const coordKey = userCoord
    ? `${userCoord.lat.toFixed(4)},${userCoord.lng.toFixed(4)}`
    : 'none';

  return useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const q = fold(query.trim());
    const weatherEntry = weatherByDate[dateStr];
    const hourlyWeather =
      weatherEntry?.status === 'ready' ? weatherEntry.data : undefined;

    let filtered: readonly Terrace[] = TERRACES;
    if (favoritesOnly) {
      filtered = filtered.filter((t) => favoriteIds.has(t.id));
    }
    if (matchModeOnly) {
      filtered = filtered.filter((t) => (t.outdoorScreens ?? 0) > 0);
    }
    if (selectedRegions.size > 0) {
      filtered = filtered.filter((t) => {
        const region = regionForArea(t.area);
        return region != null && selectedRegions.has(region);
      });
    }
    if (selectedCategories.size > 0) {
      filtered = filtered.filter((t) => {
        const cats = categoriesForTerrace(t);
        for (const sel of selectedCategories) {
          if (cats.has(sel)) return true;
        }
        return false;
      });
    }
    if (q.length > 0) {
      filtered = filtered.filter((t) => {
        const haystack = HAYSTACK.get(t.id);
        return haystack != null && haystack.includes(q);
      });
    }

    const span = Math.max(1, toHour - fromHour + 1);
    const scored: ScoredTerrace[] = filtered.map((terrace) => {
      let sum = 0;
      for (let h = fromHour; h <= toHour; h++) {
        sum += cachedHourScore(terrace, h, dateStr, hourlyWeather?.[h]);
      }
      const score = sum / span;
      const dist = userCoord
        ? distanceMetres(userCoord.lat, userCoord.lng, terrace.lat, terrace.lng)
        : undefined;
      return { terrace, score, distanceM: dist };
    });

    if (sortByDistance && userCoord) {
      // Blended sort: sunScore × distanceDecay — nearest+sunniest wins.
      scored.sort((a, b) => {
        const da = distanceDecay(a.distanceM ?? 0) * a.score;
        const db = distanceDecay(b.distanceM ?? 0) * b.score;
        return db - da;
      });
    } else {
      scored.sort((a, b) => b.score - a.score);
    }

    return scored;
  }, [
    dateOffset,
    fromHour,
    toHour,
    selectedRegions,
    selectedCategories,
    favoritesOnly,
    favoriteIds,
    matchModeOnly,
    sortByDistance,
    query,
    weatherByDate,
    coordKey, // eslint-disable-line react-hooks/exhaustive-deps
  ]);
}
