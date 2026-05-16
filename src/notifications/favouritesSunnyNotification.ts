/**
 * Per-favourite terrace "going sunny" notifications.
 *
 * For each favourited terrace, we compute its sun score for every
 * hour tomorrow. If there's a 2+ hour block where the score exceeds
 * SUNNY_THRESHOLD, we schedule a notification to fire at 09:00
 * Amsterdam time tomorrow:
 *
 *   "Café Kobalt is sunny 14:00–17:00 tomorrow ☀️"
 *
 * One notification per terrace. Notifications are identified by
 * `zonnie-fav-<terraceId>` so they can be individually cancelled if
 * the user un-favourites a terrace or tomorrow's forecast changes.
 *
 * Called from `useFavouritesSunnyNotifications` on every app open
 * and whenever favourites or tomorrow's weather change.
 *
 * Design decisions:
 *   - City-wide weather only (Open-Meteo) is used for cloud cover;
 *     per-terrace shadow + facing is calculated with the scoring engine.
 *     This means these notifications are as accurate as the main app.
 *   - We cap at MAX_FAVOURITE_NOTIFICATIONS to avoid spamming users
 *     who have many favourites.
 *   - Score threshold is 0.45 (45/100) — "Partial Sun" or better.
 *     Lower than "Mostly Sunny" (0.5) to account for the fact that
 *     tomorrow's forecast is inherently less certain.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromZonedTime } from 'date-fns-tz';

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { AMSTERDAM_TZ, computeSunScore } from '@/src/engines/scoring';
import type { Weather } from '@/src/engines/types';

/** Minimum score (0–1) to count as "sunny enough to notify". */
const SUNNY_THRESHOLD = 0.45;
/** Minimum contiguous sunny hours to be worth a notification. */
const MIN_SUNNY_HOURS = 2;
/** Earliest and latest hours we check (Amsterdam local). */
const MIN_HOUR = 9;
const MAX_HOUR = 21;
/** Cap on how many favourite notifications we schedule in one go. */
const MAX_FAVOURITE_NOTIFICATIONS = 5;
/** Local Amsterdam hour at which the notification fires. */
const NOTIFY_HOUR = 9;

function notifId(terraceId: number): string {
  return `zonnie-fav-${terraceId}`;
}

interface SunnyBlock {
  fromHour: number;
  toHour: number;
  peakScore: number;
}

/** Find the best contiguous sunny block for a terrace on a given date. */
function findSunnyBlock(
  terraceId: number,
  dateStr: string,
  hourly: readonly (Weather | undefined)[],
): SunnyBlock | null {
  const terrace = TERRACES.find((t) => t.id === terraceId);
  if (!terrace) return null;
  const buildings = getBuildingsForTerrace(terraceId);

  let bestStart = -1;
  let bestEnd = -1;
  let bestLen = 0;
  let bestPeak = 0;

  let curStart = -1;
  let curPeak = 0;

  for (let h = MIN_HOUR; h <= MAX_HOUR; h++) {
    const w = hourly[h];
    const { score } = computeSunScore(terrace, buildings, h, dateStr, 'sunny', w);
    if (score >= SUNNY_THRESHOLD) {
      if (curStart < 0) {
        curStart = h;
        curPeak = score;
      } else {
        curPeak = Math.max(curPeak, score);
      }
      const len = h - curStart + 1;
      if (len > bestLen || (len === bestLen && curPeak > bestPeak)) {
        bestLen = len;
        bestStart = curStart;
        bestEnd = h;
        bestPeak = curPeak;
      }
    } else {
      curStart = -1;
      curPeak = 0;
    }
  }

  if (bestLen < MIN_SUNNY_HOURS) return null;
  return { fromHour: bestStart, toHour: bestEnd, peakScore: bestPeak };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function notifBody(block: SunnyBlock): string {
  return `Sunny ${pad(block.fromHour)}:00–${pad(block.toHour)}:00 tomorrow ☀️`;
}

function tomorrowAt9amAmsterdam(tomorrowDateStr: string): Date {
  const localISO = `${tomorrowDateStr}T${pad(NOTIFY_HOUR)}:00:00`;
  return fromZonedTime(localISO, AMSTERDAM_TZ);
}

export interface FavouritesNotificationResult {
  scheduled: number[];
  cancelled: number[];
  status: 'done' | 'no-permission' | 'unsupported';
}

/**
 * Sync per-favourite notifications for tomorrow's forecast.
 * Schedules up to MAX_FAVOURITE_NOTIFICATIONS. Cancels notifications
 * for terraces no longer favourited or no longer sunny tomorrow.
 */
export async function syncFavouritesSunnyNotifications(
  favouriteIds: Set<number>,
  tomorrowDateStr: string,
  hourly: readonly (Weather | undefined)[] | undefined,
): Promise<FavouritesNotificationResult> {
  if (Platform.OS === 'web') return { scheduled: [], cancelled: [], status: 'unsupported' };

  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') {
      return { scheduled: [], cancelled: [], status: 'no-permission' };
    }

    const fireAt = tomorrowAt9amAmsterdam(tomorrowDateStr);
    const fireInPast = fireAt.getTime() < Date.now();

    const scheduled: number[] = [];
    const cancelled: number[] = [];

    // Cancel notifications for terraces no longer in favourites.
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of allScheduled) {
      if (n.identifier.startsWith('zonnie-fav-')) {
        const id = parseInt(n.identifier.replace('zonnie-fav-', ''), 10);
        if (!favouriteIds.has(id)) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
          cancelled.push(id);
        }
      }
    }

    if (!hourly || hourly.length === 0 || fireInPast) {
      // Cancel all favourite notifications — no forecast available or
      // notification time has passed.
      for (const id of favouriteIds) {
        await Notifications.cancelScheduledNotificationAsync(notifId(id)).catch(() => {});
        cancelled.push(id);
      }
      return { scheduled, cancelled, status: 'done' };
    }

    // Schedule (or refresh) for terraces that are sunny tomorrow.
    let count = 0;
    for (const id of favouriteIds) {
      if (count >= MAX_FAVOURITE_NOTIFICATIONS) {
        // Cancel the rest so we don't accumulate stale ones.
        await Notifications.cancelScheduledNotificationAsync(notifId(id)).catch(() => {});
        cancelled.push(id);
        continue;
      }

      const block = findSunnyBlock(id, tomorrowDateStr, hourly);
      if (!block) {
        await Notifications.cancelScheduledNotificationAsync(notifId(id)).catch(() => {});
        cancelled.push(id);
        continue;
      }

      const terrace = TERRACES.find((t) => t.id === id);
      if (!terrace) continue;

      await Notifications.cancelScheduledNotificationAsync(notifId(id)).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(id),
        content: {
          title: terrace.name,
          body: notifBody(block),
          sound: 'default',
          badge: 1,
          data: { terraceId: id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      });

      scheduled.push(id);
      count++;
    }

    return { scheduled, cancelled, status: 'done' };
  } catch {
    return { scheduled: [], cancelled: [], status: 'unsupported' };
  }
}

/** Cancel all favourite terrace notifications. */
export async function cancelAllFavouriteNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith('zonnie-fav-')) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch {}
}
