/**
 * Compact horizontal hour-by-hour weather strip for the visit window.
 *
 * One cell per hour from `fromHour` to `toHour` — temperature, cloud
 * glyph, and wind speed. Uses the cached forecast in `weatherStore` for
 * the currently selected date. Renders nothing if the forecast isn't
 * loaded yet (the date picker prefetches all 8 dates on mount, so this
 * is rare except in offline / fetch-failed states).
 *
 * Intentionally global (not per-terrace) — Amsterdam's weather is the
 * same everywhere in the city, so this lives at the time-control level
 * rather than inside the detail sheet.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

function cloudGlyph(cloudCover: number): string {
  if (cloudCover < 25) return '☀';
  if (cloudCover < 50) return '🌤';
  if (cloudCover < 80) return '⛅';
  return '☁';
}

function windGlyph(windKmh: number | undefined): string {
  if (windKmh == null) return '';
  if (windKmh < 8) return '';
  if (windKmh < 20) return ' 💨';
  return ' 🌬️';
}

interface CellProps {
  hour: number;
  temp: number;
  cloudCover: number;
  windSpeed: number | undefined;
}

function Cell({ hour, temp, cloudCover, windSpeed }: CellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.hour}>{hour.toString().padStart(2, '0')}</Text>
      <Text style={styles.glyph}>{cloudGlyph(cloudCover)}</Text>
      <Text style={styles.temp}>{temp}°</Text>
      <Text style={styles.detail}>
        {cloudCover}%{windGlyph(windSpeed)}
      </Text>
    </View>
  );
}

export function WeatherStrip() {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const cells = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (entry?.status !== 'ready' || !entry.data) return null;
    const cells: CellProps[] = [];
    for (let h = fromHour; h <= toHour; h++) {
      const w = entry.data[h];
      if (!w) continue;
      cells.push({
        hour: h,
        temp: w.temp,
        cloudCover: w.cloudCover,
        windSpeed: w.windSpeed,
      });
    }
    return cells;
  }, [dateOffset, fromHour, toHour, weatherByDate]);

  if (!cells || cells.length === 0) return null;

  // For long ranges (>5 hours), make horizontally scrollable so cells
  // stay readable without shrinking. Short ranges fit naturally.
  const isLong = cells.length > 5;

  if (isLong) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {cells.map((c) => (
          <Cell key={c.hour} {...c} />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.row}>
      {cells.map((c) => (
        <Cell key={c.hour} {...c} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
  },
  hour: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
  },
  glyph: {
    fontSize: fontSizes.xl,
    marginTop: 2,
  },
  temp: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
    marginTop: 2,
  },
  detail: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 1,
  },
});
