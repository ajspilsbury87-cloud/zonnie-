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

import { useStrings } from '@/src/i18n/useStrings';
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

/**
 * Convert a meteorological wind direction in degrees (0 = wind FROM north)
 * to an 8-point compass label. Shown only when wind speed is meaningful
 * (≥ 8 km/h) so the direction is relevant to terrace comfort.
 *
 * Meteorological convention: direction = where wind is blowing FROM.
 * So 270° = wind coming from the west (blowing eastward).
 */
function windDirLabel(degrees: number | undefined, windKmh: number | undefined): string {
  if (degrees == null || windKmh == null || windKmh < 8) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(degrees / 45) % 8;
  return ` ${dirs[idx]}`;
}

interface CellProps {
  hour: number;
  temp: number;
  cloudCover: number;
  windSpeed: number | undefined;
  windDirection: number | undefined;
}

function Cell({ hour, temp, cloudCover, windSpeed, windDirection }: CellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.hour}>{hour.toString().padStart(2, '0')}</Text>
      <Text style={styles.glyph}>{cloudGlyph(cloudCover)}</Text>
      <Text style={styles.temp}>{temp}°</Text>
      <Text style={styles.detail}>
        {cloudCover}%{windDirLabel(windDirection, windSpeed)}{windGlyph(windSpeed)}
      </Text>
    </View>
  );
}

export function WeatherStrip() {
  const t = useStrings();
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const { cells, status } = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (!entry || entry.status === 'idle' || entry.status === 'loading') {
      return { cells: null, status: 'loading' as const };
    }
    if (entry.status === 'error' || !entry.data) {
      return { cells: null, status: 'error' as const };
    }
    const out: CellProps[] = [];
    // Show at least 2 hours even when fromHour === toHour (e.g. "Now"
    // preset sets both to the same hour). Also clamp to available data
    // so we never read past index 23.
    const displayTo = Math.min(23, Math.max(toHour, fromHour + 1));
    for (let h = fromHour; h <= displayTo; h++) {
      const w = entry.data[h];
      if (!w) continue;
      out.push({
        hour: h,
        temp: w.temp,
        cloudCover: w.cloudCover,
        windSpeed: w.windSpeed,
        windDirection: w.windDirection,
      });
    }
    return { cells: out, status: 'ready' as const };
  }, [dateOffset, fromHour, toHour, weatherByDate]);

  // Always render *something* so the strip's vertical space is reserved
  // (no layout jump when data lands) and the user has clear feedback that
  // a weather row exists here. Earlier versions returned null on
  // loading/error, which made the strip invisible at peek and led to
  // "where's the weather?" reports.
  if (cells == null || cells.length === 0) {
    return (
      <View style={styles.placeholderRow}>
        <Text style={styles.placeholderText}>
          {status === 'loading' ? t.weatherLoading : t.weatherNoData}
        </Text>
      </View>
    );
  }

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
  // Placeholder row matches the cell row's vertical footprint so the
  // strip reserves the same height regardless of data state — keeps the
  // peek-snap layout stable.
  placeholderRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: palette.sandDeep,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  placeholderText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
});
