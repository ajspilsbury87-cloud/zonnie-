/**
 * Schedules and cancels the daily "sunny weather tomorrow" notification.
 *
 * Strategy: every time the user opens the app and weather data has
 * loaded for tomorrow, the hook in `useDailyForecastNotification`
 * calls `syncTomorrowForecastNotification`:
 *
 *   - if tomorrow has a good-weather block ≥ 3h, schedule (or
 *     reschedule, with the latest forecast) a notification for
 *     tomorrow 09:00 Amsterdam time
 *   - if not, cancel any previously-scheduled notification so users
 *     don't get a stale "sunny tomorrow!" buzz when overnight weather
 *     data changed and the day no longer qualifies
 *
 * iOS local notifications fire even with the app closed, as long as
 * the schedule was registered before iOS suspended/killed the app.
 * Re-scheduling on every app open keeps the notification fresh.
 *
 * No remote/push servers, no APNs cert, no Expo push tokens — local
 * notifications only. The cost of "user must open app at least once
 * per day to keep getting notifications" is fine for v1; the
 * notification is itself a hook back into the app.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromZonedTime } from 'date-fns-tz';

import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import {
  findGoodWeatherBlock,
  formatNotificationBody,
  type GoodWeatherBlock,
} from './forecast';
import type { Weather } from '@/src/engines/types';

/** Stable identifier so we can cancel + reschedule the same slot. */
const NOTIFICATION_ID = 'zonnie-tomorrow-forecast';
/** Local Amsterdam hour at which the notification fires. */
const NOTIFY_HOUR = 9;

/** Compute the next-occurrence Date for HH:00 Amsterdam time tomorrow. */
function tomorrowAt9amAmsterdam(): Date {
  const now = new Date();
  // Get tomorrow's date in Amsterdam (handles DST + midnight rollover).
  const tomorrowMs = now.getTime() + 24 * 60 * 60 * 1000;
  const dateOnly = new Date(tomorrowMs).toISOString().slice(0, 10);
  // Build "YYYY-MM-DDT09:00:00" in Amsterdam local time, then convert
  // to a UTC instant. Preserves the wall-clock time across DST.
  const localISO = `${dateOnly}T${NOTIFY_HOUR.toString().padStart(2, '0')}:00:00`;
  return fromZonedTime(localISO, AMSTERDAM_TZ);
}

/**
 * Reschedule (or cancel) the tomorrow-forecast notification based on
 * the current forecast for tomorrow. Idempotent — call on every app
 * open without checking permission state; this function checks
 * itself.
 */
export async function syncTomorrowForecastNotification(
  hourly: readonly (Weather | undefined)[] | undefined,
): Promise<{
  status: 'scheduled' | 'cancelled' | 'no-permission' | 'unsupported' | 'no-data';
  block?: GoodWeatherBlock;
}> {
  if (Platform.OS === 'web') return { status: 'unsupported' };
  if (!hourly || hourly.length === 0) return { status: 'no-data' };

  // Only schedule if the user has previously granted permission.
  // We never request inside this function — that's the prompt's job.
  // Wrapped in try/catch so a build without the native module (older
  // OTA target predating the expo-notifications install) gracefully
  // falls through to "unsupported" instead of throwing inside the
  // _layout effect.
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') {
      return { status: 'no-permission' };
    }

    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(
      () => {
        // Cancel can throw if the id doesn't exist — ignore.
      },
    );

    const block = findGoodWeatherBlock(hourly);
    if (!block) return { status: 'cancelled' };

    const fireAt = tomorrowAt9amAmsterdam();
    // Sanity check — if for some reason fireAt is in the past (clock skew,
    // user opens app at 8:59am with stale data), don't schedule.
    if (fireAt.getTime() < Date.now()) {
      return { status: 'cancelled' };
    }

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Morgen zonnig ☀️',
        body: formatNotificationBody(block),
        badge: 1,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });

    return { status: 'scheduled', block };
  } catch {
    // Native module not available in this build. No-op silently.
    return { status: 'unsupported' };
  }
}

/** Manually cancel — used by the "Disable notifications" toggle. */
export async function cancelTomorrowForecastNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(
      () => {},
    );
  } catch {
    // Native module missing.
  }
}
