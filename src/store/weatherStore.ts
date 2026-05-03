/**
 * Cached hourly weather forecasts, keyed by date string.
 *
 * One entry per visible date (max 8: today + 7 days ahead). Cache is
 * in-memory only; cold-launching the app refetches today. The fetch hook
 * `useWeatherForDate` triggers a fetch lazily when a date is requested
 * that doesn't have an entry yet.
 *
 * State per date:
 *   - 'idle'    — never requested
 *   - 'loading' — fetch in flight
 *   - 'ready'   — `data` populated
 *   - 'error'   — fetch failed; `error` populated; UI uses synthetic fallback
 */

import { create } from 'zustand';

import type { Weather } from '@/src/engines/types';
import { fetchHourlyForecast } from '@/src/data/weather';

type EntryStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CacheEntry {
  status: EntryStatus;
  data?: Weather[];
  error?: string;
  /** ms since epoch — used to evict stale entries if we ever add TTL. */
  fetchedAt?: number;
}

interface WeatherState {
  /** date string (YYYY-MM-DD) → cache entry */
  byDate: Record<string, CacheEntry>;
  /** Trigger a fetch if not already loading/ready. Idempotent. */
  ensure: (dateStr: string) => void;
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  byDate: {},
  ensure: (dateStr) => {
    const existing = get().byDate[dateStr];
    if (existing && (existing.status === 'loading' || existing.status === 'ready')) {
      return;
    }
    set((s) => ({
      byDate: { ...s.byDate, [dateStr]: { status: 'loading' } },
    }));
    fetchHourlyForecast(dateStr)
      .then((data) => {
        set((s) => ({
          byDate: {
            ...s.byDate,
            [dateStr]: { status: 'ready', data, fetchedAt: Date.now() },
          },
        }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        set((s) => ({
          byDate: {
            ...s.byDate,
            [dateStr]: { status: 'error', error: message },
          },
        }));
      });
  },
}));

/** Selector for a specific date's cache entry. */
export function selectWeatherEntry(state: WeatherState, dateStr: string): CacheEntry | undefined {
  return state.byDate[dateStr];
}
