/**
 * useWeatherRefresh — keeps live weather data fresh automatically.
 *
 * Two mechanisms:
 *
 * 1. FOREGROUND RESUME: When the app returns from background, today's
 *    forecast is invalidated and immediately re-fetched. This covers the
 *    most common staleness scenario: a user who opened the app at 9am,
 *    backgrounded it, and reopens at 3pm — without this, the 9am cloud
 *    cover is still driving scores six hours later.
 *
 * 2. INTERVAL REFRESH: A 30-minute interval calls `ensure()` for today
 *    so long-running foreground sessions also stay current. The store's
 *    isStale() check means this is a cheap no-op when data is fresh; it
 *    only triggers a real network request when the TTL has elapsed.
 *    30-minute cadence matches Open-Meteo's typical update frequency.
 *
 * Mount this hook once at the app root (_layout.tsx). It sets up the
 * AppState listener and interval at boot and tears them down on unmount.
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useWeatherStore } from '@/src/store/weatherStore';
import { selectedDateStr } from '@/src/store/timeStore';

/** Interval between proactive TTL checks while the app is foregrounded. */
const FOREGROUND_INTERVAL_MS = 30 * 60 * 1000;

export function useWeatherRefresh(): void {
  const ensure = useWeatherStore((s) => s.ensure);
  const invalidateToday = useWeatherStore((s) => s.invalidateToday);

  useEffect(() => {
    // ── Foreground resume handler ─────────────────────────────────────
    // When the app transitions from background → active, bust today's
    // cache and trigger a fresh fetch. `ensure()` is then called for
    // all 8 visible dates by DatePicker's existing prefetch effect;
    // we only need to invalidate today here so the staleness check
    // in `ensure()` sees a cache miss and actually fetches.
    let prevState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (prevState !== 'active' && nextState === 'active') {
        // App just came to foreground — bust today's stale data.
        invalidateToday();
        // Re-fetch today immediately (DatePicker won't re-mount on resume).
        const today = selectedDateStr(0);
        ensure(today);
      }
      prevState = nextState;
    });

    // ── Interval refresh while foregrounded ──────────────────────────
    // Long-running foreground sessions (e.g. watching the time scrubber
    // for hours) should also get fresh data. 30-min cadence matches the
    // store's TTL so this only causes a real network request when due.
    const interval = setInterval(() => {
      const today = selectedDateStr(0);
      ensure(today);
    }, FOREGROUND_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [ensure, invalidateToday]);
}
