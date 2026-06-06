/**
 * Mounts in app/_layout.tsx. Re-syncs B/C/D contextual notifications
 * whenever weather data for any of the next 7 days changes.
 *
 * Builds a simple dateStr → hourly map (ready entries only) and passes
 * it to each sync function. The sync functions compute their own
 * schedule targets (next Monday, today/tomorrow, etc.) from real-time
 * day-of-week checks, so rescheduling on every app open keeps the
 * content fresh.
 */
import { useEffect, useMemo } from 'react';
import { useWeatherStore } from '@/src/store/weatherStore';
import { selectedDateStr } from '@/src/store/timeStore';
import {
  syncWeekAheadNotification,
  syncWeekdayEveningNotification,
  syncWeekendDaytimeNotification,
} from './contextualNotifications';
import type { Weather } from '@/src/engines/types';

export function useContextualNotifications(): void {
  const weatherByDate = useWeatherStore((s) => s.byDate);

  // Extract only ready hourly arrays for the next 0–7 days.
  const readyByDate = useMemo<Record<string, readonly (Weather | undefined)[]>>(() => {
    const out: Record<string, readonly (Weather | undefined)[]> = {};
    for (let offset = 0; offset <= 7; offset++) {
      const dateStr = selectedDateStr(offset);
      const entry   = weatherByDate[dateStr];
      if (entry?.status === 'ready' && entry.data) {
        out[dateStr] = entry.data;
      }
    }
    return out;
  }, [weatherByDate]);

  useEffect(() => {
    if (Object.keys(readyByDate).length === 0) return;
    void syncWeekAheadNotification(readyByDate);
    void syncWeekdayEveningNotification(readyByDate);
    void syncWeekendDaytimeNotification(readyByDate);
  }, [readyByDate]);
}
