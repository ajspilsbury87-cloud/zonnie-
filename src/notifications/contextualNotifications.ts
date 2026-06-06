/**
 * Context-aware notifications — schedules three time-sensitive alerts:
 *
 *   B. Week Ahead   — Monday 08:00, previewing the week's best terrace windows.
 *   C. Evening Alert — Mon–Fri 16:00, fires if tonight (17–21h) has ≥2h good weather.
 *   D. Weekend Alert — Sat–Sun 09:00, fires if today's daytime (10–18h) has ≥3h good weather.
 *
 * All are rescheduled on every app open (idempotent). Content is computed from
 * the weather data available at scheduling time — the most accurate available
 * forecast for those windows.
 *
 * Window thresholds (intentionally slightly more lenient than the daily forecast):
 *   cloudCover < 50%   (daily uses 40%)
 *   temp ≥ 14°C
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { selectedDateStr } from '@/src/store/timeStore';
import type { Weather } from '@/src/engines/types';

// ── Notification IDs ──────────────────────────────────────────────────────────
const ID_WEEK_AHEAD    = 'zonnie-week-ahead';
const ID_EVE_ALERT     = 'zonnie-evening-alert';
const ID_WEEKEND_ALERT = 'zonnie-weekend-alert';

// ── Thresholds ────────────────────────────────────────────────────────────────
const CLOUD_MAX      = 50; // %
const TEMP_MIN       = 14; // °C
const EVE_FROM       = 17;
const EVE_TO         = 21;
const DAY_FROM       = 10;
const DAY_TO         = 18;
const EVE_MIN_BLOCK  = 2;  // hours
const DAY_MIN_BLOCK  = 3;  // hours

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

interface Block { fromHour: number; toHour: number }

function findBlock(
  hourly: readonly (Weather | undefined)[],
  fromHour: number,
  toHour: number,
  minLen: number,
): Block | null {
  let bestStart = -1, bestEnd = -1, bestLen = 0, curStart = -1;
  for (let h = fromHour; h <= toHour; h++) {
    const w = hourly[h];
    const ok = w != null && w.cloudCover < CLOUD_MAX && w.temp >= TEMP_MIN;
    if (ok) {
      if (curStart < 0) curStart = h;
      const len = h - curStart + 1;
      if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = h; }
    } else {
      curStart = -1;
    }
  }
  return bestLen >= minLen ? { fromHour: bestStart, toHour: bestEnd } : null;
}

function nowInAmsterdam() {
  const now = new Date();
  return {
    dow:  parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'i'), 10),  // 1=Mon … 7=Sun
    hour: parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'HH'), 10),
  };
}

// ── B: Week Ahead ─────────────────────────────────────────────────────────────

const DAY_NL: Record<number, string> = {
  1: 'ma', 2: 'di', 3: 'wo', 4: 'do', 5: 'vr', 6: 'za', 7: 'zo',
};

function nextMondayAt8am(): Date {
  const { dow, hour } = nowInAmsterdam();
  // If today IS Monday and it's before 08:00 → fire today; otherwise next Monday.
  const daysOffset = (dow === 1 && hour < 8) ? 0 : ((8 - dow) % 7 || 7);
  const ms = Date.now() + daysOffset * 24 * 60 * 60 * 1000;
  const dateStr = new Date(ms).toISOString().slice(0, 10);
  return fromZonedTime(`${dateStr}T08:00:00`, AMSTERDAM_TZ);
}

export async function syncWeekAheadNotification(
  readyByDate: Record<string, readonly (Weather | undefined)[]>,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(ID_WEEK_AHEAD).catch(() => {});

    const fireAt = nextMondayAt8am();
    if (fireAt.getTime() < Date.now()) return;

    // Scan the next 7 days for qualifying windows.
    const windows: string[] = [];
    for (let offset = 1; offset <= 7; offset++) {
      const dateStr = selectedDateStr(offset);
      const hourly  = readyByDate[dateStr];
      if (!hourly) continue;

      const dayMs  = Date.now() + offset * 24 * 60 * 60 * 1000;
      const dow    = parseInt(formatInTimeZone(new Date(dayMs), AMSTERDAM_TZ, 'i'), 10);
      const isWeekend = dow >= 6;

      const block = isWeekend
        ? findBlock(hourly, DAY_FROM, DAY_TO, DAY_MIN_BLOCK)
        : findBlock(hourly, EVE_FROM, EVE_TO, EVE_MIN_BLOCK);

      if (block) {
        const label = DAY_NL[dow] ?? '';
        const slot  = isWeekend
          ? `${label} ${pad(block.fromHour)}–${pad(block.toHour)}u`
          : `${label}-avond ${pad(block.fromHour)}–${pad(block.toHour)}u`;
        windows.push(slot);
      }
    }

    if (windows.length === 0) return; // No good windows — skip notification

    const preview = windows.slice(0, 3).join(', ');
    await Notifications.scheduleNotificationAsync({
      identifier: ID_WEEK_AHEAD,
      content: {
        title: '🗓 Terrasmomenten deze week',
        body: `Beste tijd buiten: ${preview}`,
        sound: 'default',
        badge: 1,
        data: { type: 'week-ahead' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {}
}

// ── C: Weekday Evening Alert ──────────────────────────────────────────────────

export async function syncWeekdayEveningNotification(
  readyByDate: Record<string, readonly (Weather | undefined)[]>,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(ID_EVE_ALERT).catch(() => {});

    const { dow, hour } = nowInAmsterdam();

    // Try today if it's a weekday and there's still time to fire at 16:00
    let targetOffset: number | null = null;
    if (dow >= 1 && dow <= 5 && hour < 15) {
      targetOffset = 0;
    } else {
      // Try tomorrow — but only if tomorrow is a weekday
      const tomorrowDow = dow === 7 ? 1 : dow + 1;
      if (tomorrowDow >= 1 && tomorrowDow <= 5) targetOffset = 1;
    }

    if (targetOffset === null) return;

    const dateStr = selectedDateStr(targetOffset);
    const hourly  = readyByDate[dateStr];
    if (!hourly) return;

    const block = findBlock(hourly, EVE_FROM, EVE_TO, EVE_MIN_BLOCK);
    if (!block) return;

    const fireAt = fromZonedTime(`${dateStr}T16:00:00`, AMSTERDAM_TZ);
    if (fireAt.getTime() < Date.now()) return;

    const prefix = targetOffset === 0 ? 'Vanavond' : 'Morgenavond';
    await Notifications.scheduleNotificationAsync({
      identifier: ID_EVE_ALERT,
      content: {
        title: `🍺 ${prefix} terrasweer!`,
        body: `Zon van ${pad(block.fromHour)}:00 tot ${pad(block.toHour)}:00 — vind een plekje →`,
        sound: 'default',
        badge: 1,
        data: { type: 'evening-alert' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {}
}

// ── D: Weekend Day-of Alert ───────────────────────────────────────────────────

export async function syncWeekendDaytimeNotification(
  readyByDate: Record<string, readonly (Weather | undefined)[]>,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(ID_WEEKEND_ALERT).catch(() => {});

    const { dow, hour } = nowInAmsterdam();

    // Fire for today if it's Sat/Sun and before 08:30 (so 09:00 is still ahead).
    // Otherwise fire for tomorrow if tomorrow is Sat/Sun.
    let targetOffset: number | null = null;
    if ((dow === 6 || dow === 7) && hour < 8) {
      targetOffset = 0;
    } else {
      const tomorrowDow = dow === 7 ? 1 : dow + 1;
      if (tomorrowDow === 6 || tomorrowDow === 7) targetOffset = 1;
    }

    if (targetOffset === null) return;

    const dateStr = selectedDateStr(targetOffset);
    const hourly  = readyByDate[dateStr];
    if (!hourly) return;

    const block = findBlock(hourly, DAY_FROM, DAY_TO, DAY_MIN_BLOCK);
    if (!block) return;

    const fireAt = fromZonedTime(`${dateStr}T09:00:00`, AMSTERDAM_TZ);
    if (fireAt.getTime() < Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: ID_WEEKEND_ALERT,
      content: {
        title: '☀️ Perfect terrasdag vandaag!',
        body: `Lekkerste uren: ${pad(block.fromHour)}:00–${pad(block.toHour)}:00 — ga naar buiten →`,
        sound: 'default',
        badge: 1,
        data: { type: 'weekend-alert' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {}
}

// ── Cancel all ────────────────────────────────────────────────────────────────

export async function cancelAllContextualNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Promise.all([
      Notifications.cancelScheduledNotificationAsync(ID_WEEK_AHEAD).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(ID_EVE_ALERT).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(ID_WEEKEND_ALERT).catch(() => {}),
    ]);
  } catch {}
}
