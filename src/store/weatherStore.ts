/**
 * Cached hourly weather forecasts, keyed by date string.
 *
 * One entry per visible date (max 8: today + 7 days ahead). Cache is
 * in-memory only; cold-launching the app refetches today.
 *
 * State per date:
 *   - 'idle'    — never requested
 *   - 'loading' — fetch in flight
 *   - 'ready'   — `data` populated; re-fetched automatically when stale
 *   - 'error'   — last fetch failed; retried on next `ensure()` call
 *
 * Freshness policy:
 *   - Today's data: stale after 30 minutes. Open-Meteo updates hourly and
 *     cloud cover can change materially in 30 min — this is the main driver
 *     of "why does the app still show 40% cloud when it's now sunny outside?"
 *   - Future dates: stale after 3 hours. Forecast skill degrades with range
 *     so sub-hourly refreshes aren't meaningful.
 *   - Errors: always re-fetched (no backoff — we only have at most 8 dates).
 */

import { create } from 'zustand';
import { formatInTimeZone } from 'date-fns-tz';

import type { Weather } from '@/src/engines/types';
import { fetchHourlyForecast } from '@/src/data/weather';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';

type EntryStatus = 'idle' | 'loading' | 'ready' | 'error';

/** ms — today's forecast is considered stale after 30 minutes. */
const TODAY_TTL_MS = 30 * 60 * 1000;
/** ms — future-date forecasts are considered stale after 3 hours. */
const FUTURE_TTL_MS = 3 * 60 * 60 * 1000;

function todayDateStr(): string {
  return formatInTimeZone(new Date(), AMSTERDAM_TZ, 'yyyy-MM-dd');
}

function ttlFor(dateStr: string): number {
  return dateStr === todayDateStr() ? TODAY_TTL_MS : FUTURE_TTL_MS;
}

function isStale(entry: CacheEntry, dateStr: string): boolean {
  if (entry.status === 'idle' || entry.status === 'error') return true;
  if (entry.status === 'loading') return false;
  // 'ready' — check age
  const age = Date.now() - (entry.fetchedAt ?? 0);
  return age > ttlFor(dateStr);
}

interface CacheEntry {
  status: EntryStatus;
  data?: Weather[];
  error?: string;
  /** ms since epoch — used for TTL freshness checks. */
  fetchedAt?: number;
}

interface WeatherState {
  /** date string (YYYY-MM-DD) → cache entry */
  byDate: Record<string, CacheEntry>;
  /**
   * Ensure a forecast is loaded and fresh for the given date.
   *
   * - If idle or errored: fetches immediately.
   * - If ready but stale (age > TTL): re-fetches in the background,
   *   keeping the existing data visible until the new fetch lands.
   * - If loading or fresh: no-op.
   */
  ensure: (dateStr: string) => void;
  /**
   * Bust the cache for today and re-fetch. Called when the app returns
   * to the foreground — a common scenario is "opened the app this
   * morning, left it in background all day, reopened at 4pm" where the
   * cloud cover from 9am is still driving scores.
   */
  invalidateToday: () => void;
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  byDate: {},

  ensure: (dateStr) => {
    const existing = get().byDate[dateStr];

    // Skip if currently loading, or if ready and still fresh.
    if (existing && existing.status === 'loading') return;
    if (existing && existing.status === 'ready' && !isStale(existing, dateStr)) return;

    // Mark as loading. If there's existing ready data keep it so the UI
    // doesn't blank out during a background refresh.
    set((s) => ({
      byDate: {
        ...s.byDate,
        [dateStr]: {
          ...(s.byDate[dateStr] ?? {}),
          status: 'loading',
        },
      },
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
        // On error, preserve any existing data so scores don't vanish —
        // synthetic fallback is worse than slightly-stale real data.
        set((s) => {
          const prev = s.byDate[dateStr];
          return {
            byDate: {
              ...s.byDate,
              [dateStr]: {
                status: 'error',
                // Keep prior data if we had it (background refresh failure).
                data: prev?.data,
                error: message,
                fetchedAt: prev?.fetchedAt,
              },
            },
          };
        });
      });
  },

  invalidateToday: () => {
    const today = todayDateStr();
    const existing = get().byDate[today];
    // Don't interrupt an in-flight fetch.
    if (existing?.status === 'loading') return;
    // Drop today's entry; next `ensure(today)` will re-fetch.
    set((s) => {
      const next = { ...s.byDate };
      delete next[today];
      return { byDate: next };
    });
  },
}));

/** Selector for a specific date's cache entry. */
export function selectWeatherEntry(state: WeatherState, dateStr: string): CacheEntry | undefined {
  return state.byDate[dateStr];
}
