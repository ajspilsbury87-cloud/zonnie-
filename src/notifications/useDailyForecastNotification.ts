/**
 * Mounts in `app/_layout.tsx`. On every app open AND whenever
 * tomorrow's weather data changes (e.g., the cache hydrates from
 * Open-Meteo), this hook re-syncs the scheduled "sunny tomorrow"
 * notification:
 *
 *   - if tomorrow has a 3+ hour good-weather block, scheduler
 *     creates / updates a notification firing at 09:00 Amsterdam
 *     time tomorrow
 *   - if not, scheduler cancels any previously-scheduled notification
 *
 * Idempotent — safe to run on every render. Permission is checked
 * inside the scheduler; if the user hasn't granted, this is a no-op.
 *
 * Tomorrow's weather is whatever the cache holds for `dateOffset = 1`.
 * The DatePicker prefetches 8 days on mount, so within seconds of
 * the user opening the app, tomorrow's forecast is in the cache.
 */

import { useEffect, useMemo } from 'react';

import { selectedDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { syncTomorrowForecastNotification } from './scheduler';

export function useDailyForecastNotification(): void {
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const tomorrowDateStr = useMemo(() => selectedDateStr(1), []);
  const entry = weatherByDate[tomorrowDateStr];
  const hourly = entry?.status === 'ready' ? entry.data : undefined;

  useEffect(() => {
    if (!hourly) return;
    void syncTomorrowForecastNotification(hourly);
    // We re-trigger whenever the hourly array reference changes — the
    // weather store replaces the array on every fetch, so this catches
    // overnight forecast updates without polling.
  }, [hourly]);
}
