/**
 * Mounts in `app/_layout.tsx`. Watches the live `useScoredTerraces`
 * output and writes the top-3 to the App Group every time the ranking
 * changes — so the widget always reflects what the user would see if
 * they opened the app.
 *
 * Debounced 1.5s so a slider drag doesn't pummel the bridge with 30
 * writes per second. The widget reads its own cadence (~15 min via
 * WidgetKit), so write-rate doesn't really need to be live; we
 * debounce to be polite to UserDefaults' atomicity guarantees and the
 * native bridge.
 *
 * Always writes "right now" — the widget shows the score for the
 * CURRENT hour regardless of what the user has selected in-app. So we
 * temporarily score the top 3 against the current Amsterdam hour
 * (single point in time, not a window) before writing.
 *
 * iOS-only — the writer itself no-ops on Android, so the hook just
 * runs a useless effect there. Cheap; not worth a Platform.OS guard
 * around the hook itself.
 */

import { useEffect, useMemo, useRef } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { computeSunScore, AMSTERDAM_TZ } from '@/src/engines/scoring';
import { selectedDateStr, todayAmsterdamDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';

import { buildSnapshot, writeWidgetSnapshot } from './snapshot';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';

const DEBOUNCE_MS = 1500;

function nowAmsterdamHour(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

/**
 * Score every terrace at the CURRENT hour (single point), sort, take top 3.
 * Reuses the cached weather forecast if loaded; falls back to the synthetic
 * 'sunny' profile otherwise (= what the in-app list does on cold start).
 */
function topThreeRightNow(weatherByDate: ReturnType<typeof useWeatherStore.getState>['byDate']): ScoredTerrace[] {
  const dateStr = todayAmsterdamDateStr();
  const hour = nowAmsterdamHour();
  const entry = weatherByDate[dateStr];
  const hourly = entry?.status === 'ready' ? entry.data : undefined;
  const weather = hourly?.[hour];

  const scored: ScoredTerrace[] = TERRACES.map((t) => {
    const buildings = getBuildingsForTerrace(t.id);
    const r = computeSunScore(t, buildings, hour, dateStr, 'sunny', weather);
    return { terrace: t, score: r.score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

export function useWidgetSync(): void {
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const weatherEntryReady = useMemo(() => {
    const entry = weatherByDate[todayAmsterdamDateStr()];
    return entry?.status === 'ready';
  }, [weatherByDate]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const top = topThreeRightNow(weatherByDate);
      const snapshot = buildSnapshot(top, nowAmsterdamHour());
      void writeWidgetSnapshot(snapshot);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // We re-trigger whenever weather data changes (cold-start hydration
    // → re-score with real cloud cover). Past that, scores depend on
    // hour-of-day which we sample at write time, so no other deps.
  }, [weatherByDate, weatherEntryReady]);
}
