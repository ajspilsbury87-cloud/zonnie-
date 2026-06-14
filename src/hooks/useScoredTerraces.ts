import { useMemo } from 'react';

import { TERRACES } from '@/src/data/terraces';
import { regionForArea } from '@/src/data/regions';
import { categoriesForTerrace } from '@/src/data/categories';
import { computeGemScore, computeTouristProxy, TOURIST_TRAP_FLOOR } from '@/src/engines/gems';
import { cachedHourScore } from '@/src/hooks/scoreCache';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useAreaStore } from '@/src/store/areaStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import type { Terrace } from '@/src/engines/types';

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

// Per-hour scoring + the visit-window range score live in `scoreCache.ts`
// (pure, no React/store imports) so they're testable and shared across callers.

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
  const hiddenGemOnly = useAreaStore((s) => s.hiddenGemOnly);
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
    // Hidden gem: when the 💎 chip is active we exclude tourist traps (those
    // whose touristProxy exceeds TOURIST_TRAP_FLOOR) at the filter stage so they
    // don't appear at all — not just rank lower. The re-ranking by gemScore
    // happens after scoring below. The displayed score for every terrace that
    // passes the filter is still the plain sun score (gemScore is sort-only).
    if (hiddenGemOnly) {
      filtered = filtered.filter(
        (t) => computeTouristProxy(t) <= TOURIST_TRAP_FLOOR,
      );
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

    if (hiddenGemOnly) {
      // Gem mode: rank by gemScore (sun 60 % + inverse-tourist 25 % + rating 15 %).
      // The score property on each ScoredTerrace is still the plain sun score —
      // we do not replace it. gemScore is a private sort key only.
      scored.sort((a, b) => {
        const ga = computeGemScore(a.score, a.terrace);
        const gb = computeGemScore(b.score, b.terrace);
        return gb - ga;
      });
    } else if (sortByDistance && userCoord) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `coordKey` (lat/lng rounded to 4dp) is the intentional dep proxy for `userCoord`, so minor GPS jitter doesn't bust the memo (see coordKey above).
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
    hiddenGemOnly,
    query,
    weatherByDate,
    coordKey,
  ]);
}
