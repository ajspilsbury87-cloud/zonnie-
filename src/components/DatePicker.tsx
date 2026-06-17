/**
 * Horizontal date chip row — today + 7 future days. Tap to set the active
 * date. The chip shows the day name + day-of-month; "Today" / "Tomorrow"
 * are spelled out for the closest two so the picker reads naturally.
 *
 * The visible cloud-cover badge per chip comes from the weather cache
 * (when loaded). It's a small visual cue: ☀ = mostly clear, 🌥 = mixed,
 * ☁ = mostly cloudy. Helps you see "the day after tomorrow looks
 * grim, skip ahead" without opening each day.
 */

import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { formatInTimeZone } from 'date-fns-tz';

import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import type { Weather } from '@/src/engines/types';
import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { useTimeStore, MAX_DATE_OFFSET, selectedDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

interface ChipDate {
  offset: number;
  dateStr: string;
  topLine: string; // "Today" / "Tomorrow" / "Wed"
  bottomLine: string; // "6" (day of month) for distant chips
}

function buildDates(today: string, tomorrow: string): ChipDate[] {
  const dates: ChipDate[] = [];
  for (let offset = 0; offset <= MAX_DATE_OFFSET; offset++) {
    const dateStr = selectedDateStr(offset);
    const ms = Date.now() + offset * 24 * 60 * 60 * 1000;
    let topLine: string;
    let bottomLine: string;
    if (offset === 0) {
      topLine = today;
      bottomLine = formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'd MMM');
    } else if (offset === 1) {
      topLine = tomorrow;
      bottomLine = formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'd MMM');
    } else {
      topLine = formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'EEE');
      bottomLine = formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'd MMM');
    }
    dates.push({ offset, dateStr, topLine, bottomLine });
  }
  return dates;
}

/** Tiny cloud-cover summary glyph for the chip badge. */
function cloudGlyph(avgCloud: number | null): string {
  if (avgCloud == null) return ' ';
  if (avgCloud < 30) return '☀';
  if (avgCloud < 70) return '🌤';
  return '☁';
}

// Terrace-relevant daytime window — the hours someone would actually sit out.
const DAY_START = 10;
const DAY_END = 18;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface DayWeather {
  /** Overall daytime quality 0–1 (sunshine-dominant, small warmth nudge). */
  quality: number;
  /** Sunniest single daytime hour 0–1 — drives the "great day" ring. */
  peakClear: number;
  /** Average daytime cloud cover — feeds the existing ☀/🌤/☁ glyph. */
  avgCloud: number;
}

/**
 * Collapse a day's hourly forecast into the numbers a chip needs, over the
 * 10:00–18:00 window. Quality is mostly "how sunny" (inverse cloud cover)
 * with a gentle nudge for warmth, so a sunny cold day still ranks below a
 * sunny warm one. Returns null until the forecast for that date loads.
 */
function dayWeather(hourly: Weather[] | undefined): DayWeather | null {
  if (!hourly || hourly.length <= DAY_END) return null;
  let cloudSum = 0;
  let tempSum = 0;
  let minCloud = 100;
  let count = 0;
  for (let h = DAY_START; h <= DAY_END; h++) {
    const w = hourly[h];
    if (!w) continue;
    cloudSum += w.cloudCover;
    tempSum += w.temp;
    if (w.cloudCover < minCloud) minCloud = w.cloudCover;
    count++;
  }
  if (count === 0) return null;
  const avgCloud = cloudSum / count;
  const sunshine = (100 - avgCloud) / 100;
  // Map avg daytime temp 10°C→0 … 22°C→1, weighted lightly so sun dominates.
  const warmth = clamp01((tempSum / count - 10) / 12);
  return {
    quality: clamp01(sunshine * 0.85 + warmth * 0.15),
    peakClear: (100 - minCloud) / 100,
    avgCloud,
  };
}

/** Sunniest daytime hour ≤20% cloud → "very good at some point" → ring. */
const STANDOUT_PEAK_CLEAR = 0.8;

type WeatherBand = 'great' | 'good' | 'fair' | 'meh' | 'poor';

function weatherBand(quality: number): WeatherBand {
  if (quality >= 0.82) return 'great';
  if (quality >= 0.62) return 'good';
  if (quality >= 0.45) return 'fair';
  if (quality >= 0.3) return 'meh';
  return 'poor';
}

// Warmth bar — full-strength brand colors: deep terracotta (great) fading to
// a muted taupe (poor). Mirrors the map-pin warmth language.
const BAR_COLOR: Record<WeatherBand, string> = {
  great: palette.terracotta,
  good: palette.burnt,
  fair: palette.orange,
  meh: palette.mustard,
  poor: palette.mistDeep,
};

// Chip wash — light tints of the same bands. Picker-specific surface colors
// (not core palette tokens) so the row stays soft against the cream sheet.
const WASH_COLOR: Record<WeatherBand, string> = {
  great: '#F2C7B3',
  good: '#F6D3BE',
  fair: '#FAE4CA',
  meh: '#FBEFCF',
  poor: '#EDE8DE',
};

export function DatePicker() {
  const t = useStrings();
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const setDateOffset = useTimeStore((s) => s.setDateOffset);
  const byDate = useWeatherStore((s) => s.byDate);
  const ensure = useWeatherStore((s) => s.ensure);

  const dates = useMemo(() => buildDates(t.today, t.tomorrow), [t.today, t.tomorrow]);

  // Prefetch every visible date's forecast on mount, in parallel. Cheap
  // because Open-Meteo deduplicates at the network layer and the cache
  // is per-date — each fetch hydrates a chip's cloud glyph.
  useEffect(() => {
    for (const d of dates) ensure(d.dateStr);
  }, [dates, ensure]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {dates.map((d) => {
        const active = d.offset === dateOffset;
        const entry = byDate[d.dateStr];
        const wx = entry?.status === 'ready' ? dayWeather(entry.data) : null;
        const band = wx ? weatherBand(wx.quality) : null;
        // No data yet → neutral sand chip + faint placeholder bar (no jump).
        const washBg = band ? WASH_COLOR[band] : palette.sandDeep;
        // Selected day = bold solid fill so it clearly reads as the day you're
        // viewing; unselected days carry their soft weather wash.
        const chipBg = active ? palette.burnt : washBg;
        // On the filled selected chip a coloured bar would vanish, so show it
        // in cream — the WeatherStrip just below already details that day.
        const barColor = active
          ? palette.cream
          : band
            ? BAR_COLOR[band]
            : palette.mist;
        // A great day (very good at some point) gets a terracotta ring, but
        // only when it isn't the selected day — the fill is emphasis enough.
        const isStandout =
          !active && wx != null && wx.peakClear >= STANDOUT_PEAK_CLEAR;
        const borderColor = isStandout ? palette.terracotta : 'transparent';
        return (
          <TouchableOpacity
            key={d.dateStr}
            onPress={() => {
              if (d.offset !== dateOffset) haptics.selection();
              setDateOffset(d.offset);
            }}
            activeOpacity={0.7}
            style={[styles.chip, { backgroundColor: chipBg, borderColor }]}
          >
            <Text style={[styles.topLine, active && styles.activeText]} numberOfLines={1}>
              {d.topLine}
            </Text>
            <Text style={[styles.bottomLine, active && styles.activeText]} numberOfLines={1}>
              {d.bottomLine}
            </Text>
            <View style={styles.iconBarRow}>
              <Text style={styles.glyph}>{cloudGlyph(wx ? wx.avgCloud : null)}</Text>
              <View style={[styles.bar, { backgroundColor: barColor }]} />
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
    // 2px transparent border by default so the selected (ink) / great-day
    // (terracotta) ring can colour it in without resizing the chip.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  topLine: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.ink,
  },
  bottomLine: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 1,
  },
  // Selected chip uses a solid burnt fill — cream text reads cleanly on it.
  activeText: {
    color: palette.cream,
  },
  iconBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs / 2,
  },
  glyph: {
    fontSize: fontSizes.md,
  },
  bar: {
    width: 22,
    height: 5,
    borderRadius: radii.pill,
  },
});
