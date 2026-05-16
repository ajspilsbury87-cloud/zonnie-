/**
 * Syncs per-favourite terrace "going sunny" notifications.
 *
 * Re-runs whenever:
 *   - Tomorrow's weather data loads or refreshes
 *   - The user's favourite set changes (add / remove)
 *
 * This covers all the cases where notifications might become stale:
 *   1. User opens app → tomorrow's weather loads → schedule for all favourites
 *   2. User hearts a new terrace → schedule a notification for it
 *   3. User un-hearts a terrace → cancel its notification
 *   4. Overnight forecast update → reschedule with latest times
 *
 * Uses the same `selectedDateStr(1)` offset as the daily forecast hook
 * so both hooks agree on which date is "tomorrow".
 */

import { useEffect, useMemo } from 'react';

import { selectedDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { syncFavouritesSunnyNotifications } from './favouritesSunnyNotification';

export function useFavouritesSunnyNotifications(): void {
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const favouriteIds = useFavoritesStore((s) => s.favoriteIds);
  const hydrated = useFavoritesStore((s) => s.hydrated);

  const tomorrowDateStr = useMemo(() => selectedDateStr(1), []);
  const entry = weatherByDate[tomorrowDateStr];
  const hourly = entry?.status === 'ready' ? entry.data : undefined;

  useEffect(() => {
    // Wait until favourites have loaded from AsyncStorage — otherwise
    // we'd cancel notifications for all favourites on the first render
    // before the persisted set has been restored.
    if (!hydrated) return;
    // If no weather yet, syncFavouritesSunnyNotifications handles it
    // gracefully (cancels stale ones, schedules nothing new).
    void syncFavouritesSunnyNotifications(favouriteIds, tomorrowDateStr, hourly);
  }, [favouriteIds, hourly, hydrated, tomorrowDateStr]);
}
