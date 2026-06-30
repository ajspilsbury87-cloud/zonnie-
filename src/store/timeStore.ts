import { create } from 'zustand';
import { formatInTimeZone } from 'date-fns-tz';

import { AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ } from '@/src/engines/scoring';
import { sunriseHour, sunsetHour } from '@/src/engines/solar';
import type { WeatherProfile } from '@/src/engines/types';

/** Maximum days into the future the date picker offers — Open-Meteo's reliable horizon. */
export const MAX_DATE_OFFSET = 7;

interface TimeState {
  /**
   * 0 = today, 1 = tomorrow, ... up to MAX_DATE_OFFSET. The actual date string
   * is derived via `selectedDateStr()` so today's roll-over is automatic.
   */
  dateOffset: number;
  /**
   * Visit window — start of the range (Amsterdam local hour, integer 0–23).
   * The user selects "I'll be there from X to Y" rather than a single point
   * in time, which matches how people actually think about meeting at a bar.
   */
  fromHour: number;
  /** Visit window — end of the range (integer 0–23). */
  toHour: number;
  /**
   * Weather profile — UI-hidden, used as a synthetic FALLBACK only when real
   * forecast data hasn't loaded yet (or fails to load). Real forecast data
   * comes from `weatherStore` and overrides this when present.
   */
  weatherProfile: WeatherProfile;
  setDateOffset: (offset: number) => void;
  setFromHour: (h: number) => void;
  setToHour: (h: number) => void;
  setRange: (from: number, to: number) => void;
  resetToNow: () => void;
}

function nowAmsterdamHour(): number {
  const now = new Date();
  const [hh] = formatInTimeZone(now, AMSTERDAM_TZ, 'HH:mm').split(':').map(Number);
  return hh ?? 12;
}

/**
 * True when the current Amsterdam time is past today's sunset. After sunset
 * there's no sun to chase tonight, so the app pivots its default day to
 * TOMORROW — the verdict card, the sunniest list, and the map all open on
 * tomorrow (clearly labelled). Evaluated at launch; a session left open across
 * sunset keeps its window until relaunch, same as the window default already does.
 */
export function isPastSunsetAmsterdam(): boolean {
  const dateStr = formatInTimeZone(new Date(), AMSTERDAM_TZ, 'yyyy-MM-dd');
  const sunset = sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
  return nowAmsterdamHour() > sunset;
}

/**
 * Sensible from/to defaults for a given date.
 *
 * - Today: "Now" window — current hour to current hour + 2, CAPPED at
 *   sunset. (It used to cap at 23, which dragged the displayed score down
 *   in the evening: at 20:00 the window was [20,21,22] and the post-sunset
 *   hour 22 scores 0, roughly halving the 3-hour average. The Morning/
 *   Afternoon/Evening presets already clamp to sunset, so the default now
 *   matches them. The WeatherStrip keeps its own max(toHour, fromHour+1)
 *   floor, so it still shows ≥2 hours.)
 * - Future dates: afternoon window (13:00–17:00) since "now" is
 *   meaningless for tomorrow. Matches the Afternoon preset.
 */
function defaultRangeForDate(dateOffset: number): { fromHour: number; toHour: number } {
  if (dateOffset === 0) {
    // Today — current Amsterdam hour to +2, capped at sunset (not 23) so the
    // average never includes dead post-sunset hours.
    const dateStr = formatInTimeZone(new Date(), AMSTERDAM_TZ, 'yyyy-MM-dd');
    const sunrise = sunriseHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
    const sunset = sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
    const now = nowAmsterdamHour();
    const clampedNow = Math.max(sunrise, Math.min(now, sunset));
    return {
      fromHour: clampedNow,
      toHour: Math.min(clampedNow + 2, sunset),
    };
  }
  // Future date — default to afternoon.
  return { fromHour: 13, toHour: 17 };
}

function initialFromTo(): { fromHour: number; toHour: number } {
  return defaultRangeForDate(0);
}

function clampHour(h: number): number {
  if (h < 0) return 0;
  if (h > 23) return 23;
  return Math.round(h);
}

function clampOffset(o: number): number {
  if (o < 0) return 0;
  if (o > MAX_DATE_OFFSET) return MAX_DATE_OFFSET;
  return Math.round(o);
}

export const useTimeStore = create<TimeState>((set, get) => ({
  dateOffset: 0,
  ...initialFromTo(),
  weatherProfile: 'sunny',
  setDateOffset: (offset) => {
    const clamped = clampOffset(offset);
    // Reset the visit window whenever the date changes so users don't
    // land on tomorrow with tonight's 21:00–21:00 range still set.
    set({ dateOffset: clamped, ...defaultRangeForDate(clamped) });
  },
  setFromHour: (h) => {
    // Clamp From to <= current To, but never PUSH To. Reason: the iOS
    // native Slider reports the user's finger position on release (not
    // the visually-clamped value). If user drags From past To, the
    // raw value comes through > toHour. Earlier we set
    // `toHour: Math.max(from, toHour)`, which made the To handle jump
    // up to follow — Andy saw this as "I move one bar, the other
    // moves too". Now we silently clamp From to To and never disturb
    // To. Visual effect: From's thumb snaps back to To's position;
    // To stays still.
    const from = clampHour(h);
    const { toHour } = get();
    set({ fromHour: Math.min(from, toHour) });
  },
  setToHour: (h) => {
    const to = clampHour(h);
    const { fromHour } = get();
    set({ toHour: Math.max(to, fromHour) });
  },
  setRange: (from, to) => {
    const f = clampHour(from);
    const t = clampHour(to);
    set({ fromHour: Math.min(f, t), toHour: Math.max(f, t) });
  },
  resetToNow: () => {
    set({ dateOffset: 0, ...initialFromTo() });
  },
}));

/** Today's date in Amsterdam, formatted YYYY-MM-DD. Re-evaluated on each call. */
export function todayAmsterdamDateStr(): string {
  return formatInTimeZone(new Date(), AMSTERDAM_TZ, 'yyyy-MM-dd');
}

/**
 * The currently selected date in Amsterdam, formatted YYYY-MM-DD.
 * Today + dateOffset days. Re-evaluated on each call so a session left open
 * past midnight rolls over correctly.
 */
export function selectedDateStr(dateOffset: number): string {
  const ms = Date.now() + dateOffset * 24 * 60 * 60 * 1000;
  return formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'yyyy-MM-dd');
}
