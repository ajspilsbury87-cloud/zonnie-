import { useMemo } from 'react';

import { TERRACES } from '@/src/data/terraces';
import { getBuildings } from '@/src/data/buildings';
import { regionForArea } from '@/src/data/regions';
import { computeRangeScore } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import type { Terrace } from '@/src/engines/types';

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

/**
 * Score every terrace by the AVERAGE sun across the user's visit window
 * (`fromHour..toHour`) on the selected date, filter by selected regions and
 * free-text query, and sort descending by score.
 *
 * Weather data: when the forecast for the selected date has loaded, real
 * hourly cloud cover overrides the synthetic profile. Until then (or on
 * fetch error), the engine falls back to synthetic — the app stays usable
 * offline, just less accurate.
 *
 * Filters are AND-combined: a terrace must pass region AND query to appear.
 * Empty region selection or empty query = that filter is bypassed.
 */
export function useScoredTerraces(): ScoredTerrace[] {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
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

    const scored: ScoredTerrace[] = filtered.map((terrace) => ({
      terrace,
      score: computeRangeScore(
        terrace,
        buildings,
        fromHour,
        toHour,
        dateStr,
        weatherProfile,
        hourlyWeather,
      ),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [dateOffset, fromHour, toHour, weatherProfile, selectedRegions, query, weatherByDate]);
}
