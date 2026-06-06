/**
 * "Featured terrace of the month" notification.
 * Fires on the 1st of the next calendar month at 10:00 Amsterdam time.
 * Rotates through `featured: true` terraces by current month index.
 * No weather condition — pure promotional showcase.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromZonedTime } from 'date-fns-tz';
import { TERRACES } from '@/src/data/terraces';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';

const NOTIFICATION_ID = 'zonnie-featured-monthly';

function pickFeaturedTerrace() {
  const featured = TERRACES.filter((t) => t.featured);
  if (featured.length === 0) return null;
  const monthIndex = new Date().getMonth(); // 0–11
  return featured[monthIndex % featured.length] ?? null;
}

function firstOfNextMonthAt10am(): Date {
  const now = new Date();
  const month = now.getMonth(); // 0–11
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear  = month === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
  return fromZonedTime(`${dateStr}T10:00:00`, AMSTERDAM_TZ);
}

export async function syncFeaturedTerraceNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

    const terrace = pickFeaturedTerrace();
    if (!terrace) return;

    const fireAt = firstOfNextMonthAt10am();
    if (fireAt.getTime() < Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `🌟 ${terrace.name} — terras van de maand`,
        body: `${terrace.vibe} — bekijk in de app →`,
        sound: 'default',
        badge: 1,
        data: { terraceId: terrace.id, type: 'featured' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {
    // Native module not available in this build.
  }
}

export async function cancelFeaturedTerraceNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  } catch {}
}
