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
import { haptics } from '@/src/lib/haptics';
import { useTimeStore, MAX_DATE_OFFSET, selectedDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

interface ChipDate {
  offset: number;
  dateStr: string;
  topLine: string; // "Today" / "Tomorrow" / "Wed"
  bottomLine: string; // "6" (day of month) for distant chips
}

function buildDates(): ChipDate[] {
  const dates: ChipDate[] = [];
  for (let offset = 0; offset <= MAX_DATE_OFFSET; offset++) {
    const dateStr = selectedDateStr(offset);
    const ms = Date.now() + offset * 24 * 60 * 60 * 1000;
    let topLine: string;
    let bottomLine: string;
    if (offset === 0) {
      topLine = 'Today';
      bottomLine = formatInTimeZone(new Date(ms), AMSTERDAM_TZ, 'd MMM');
    } else if (offset === 1) {
      topLine = 'Tomorrow';
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

/** Average daytime cloud cover (10:00–18:00) — the part that matters for terraces. */
function dayCloudAvg(hourly: { cloudCover: number }[] | undefined): number | null {
  if (!hourly || hourly.length < 19) return null;
  let sum = 0;
  let count = 0;
  for (let h = 10; h <= 18; h++) {
    sum += hourly[h]?.cloudCover ?? 0;
    count++;
  }
  return count > 0 ? sum / count : null;
}

export function DatePicker() {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const setDateOffset = useTimeStore((s) => s.setDateOffset);
  const byDate = useWeatherStore((s) => s.byDate);
  const ensure = useWeatherStore((s) => s.ensure);

  const dates = useMemo(() => buildDates(), []);

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
        const avgCloud = entry?.status === 'ready' ? dayCloudAvg(entry.data) : null;
        return (
          <TouchableOpacity
            key={d.dateStr}
            onPress={() => {
              if (d.offset !== dateOffset) haptics.selection();
              setDateOffset(d.offset);
            }}
            activeOpacity={0.7}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.topLine, active && styles.activeText]} numberOfLines={1}>
              {d.topLine}
            </Text>
            <Text style={[styles.bottomLine, active && styles.activeText]} numberOfLines={1}>
              {d.bottomLine}
            </Text>
            <Text style={[styles.glyph, active && styles.activeText]}>
              {cloudGlyph(avgCloud)}
            </Text>
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
  },
  chipActive: {
    backgroundColor: palette.amber,
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
  glyph: {
    fontSize: fontSizes.md,
    marginTop: spacing.xs / 2,
  },
  activeText: {
    color: palette.white,
  },
});
