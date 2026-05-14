/**
 * Hour-by-hour sun strength chart for a single terrace.
 *
 * Renders as a smooth-looking area curve across the day: 144 thin
 * sub-bars (6 per hour) with linearly-interpolated scores and a
 * continuously-graded colour. This replaces the previous 24-chunky-bar
 * implementation — user-test feedback was that the bar chart didn't
 * read as "sun strength across the day", just "a chart of something."
 * The continuous fill reads as a sunrise/sunset arc by itself.
 *
 * No charting dep — pure RN Views with interpolated heights and
 * RGB-lerped colours. 144 bars × N detail sheets is well within RN's
 * comfort zone (we don't re-render unless terrace or date changes).
 *
 * Tap behaviour from the old chart is preserved: 24 invisible touch
 * targets layered over the bars convert taps to single-hour visit
 * windows (`setRange(h, h)`).
 *
 * Title and sunrise/sunset labels are intentional — they tell the user
 * what the curve IS, instead of leaving them to infer it from shape.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { getBuildingsForTerrace } from '@/src/data/buildings';
import { computeSunScore } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import type { Terrace } from '@/src/engines/types';
import { fonts, fontSizes, palette, spacing } from '@/src/theme/tokens';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** Sub-bars per hour. 6 = ~2.5px each at typical detail-sheet width. */
const SUBBARS_PER_HOUR = 6;
const TOTAL_SUBBARS = 24 * SUBBARS_PER_HOUR;
const BAR_HEIGHT = 64;
/** Score above which an hour counts as "sunlit" for sunrise/sunset detection. */
const SUNLIT_THRESHOLD = 0.05;

/**
 * Continuous colour gradient from deep cocoa (no sun) → vivid orange
 * (full sun), via the same brand-saturated palette as the previous
 * step-banded chart. Smoothly lerped between stops so adjacent
 * sub-bars don't show vertical colour seams at band boundaries.
 */
const SUN_COLOR_STOPS: ReadonlyArray<{ stop: number; rgb: [number, number, number] }> = [
  { stop: 0.0, rgb: [90, 36, 16] }, // #5A2410 deep cocoa
  { stop: 0.1, rgb: [154, 58, 25] }, // #9A3A19 rust brown
  { stop: 0.3, rgb: [244, 196, 67] }, // #F4C443 saturated mustard
  { stop: 0.5, rgb: [245, 147, 40] }, // #F59328 warm orange
  { stop: 0.7, rgb: [255, 107, 26] }, // #FF6B1A vivid bright orange
  { stop: 1.0, rgb: [255, 107, 26] }, // same — saturate at the top
];

function lerpColor(score: number): string {
  for (let i = 0; i < SUN_COLOR_STOPS.length - 1; i++) {
    // Indices are bounded by the loop condition; non-null asserted to
    // satisfy noUncheckedIndexedAccess.
    const a = SUN_COLOR_STOPS[i]!;
    const b = SUN_COLOR_STOPS[i + 1]!;
    if (score <= b.stop) {
      const t = (score - a.stop) / (b.stop - a.stop);
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t);
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t);
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return `rgb(${SUN_COLOR_STOPS[SUN_COLOR_STOPS.length - 1]!.rgb.join(',')})`;
}

/** Format an hour number as "HH:MM" for sunrise/sunset annotations. */
function fmtHour(hourFrac: number): string {
  const h = Math.floor(hourFrac);
  const m = Math.round((hourFrac - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface SunTimelineProps {
  terrace: Pick<Terrace, 'id' | 'lat' | 'lng' | 'facing'>;
}

export function SunTimeline({ terrace }: SunTimelineProps) {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setRange = useTimeStore((s) => s.setRange);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  /** Hourly scores (24 samples), feeds the interpolated sub-bar fill. */
  const hourly = useMemo(() => {
    const buildings = getBuildingsForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return HOURS.map((h) =>
      computeSunScore(
        terrace,
        buildings,
        h,
        dateStr,
        weatherProfile,
        hourlyWeather?.[h],
      ).score,
    );
  }, [terrace, dateOffset, weatherProfile, weatherByDate]);

  /** 144 sub-bars with linearly-interpolated scores. */
  const subBars = useMemo(() => {
    return Array.from({ length: TOTAL_SUBBARS }, (_, i) => {
      const hourFrac = i / SUBBARS_PER_HOUR; // 0.000 .. 23.833
      const h0 = Math.min(23, Math.floor(hourFrac));
      const h1 = Math.min(23, h0 + 1);
      const t = hourFrac - h0;
      // h0/h1 are bounded to [0, 23]; non-null asserted for the
      // strict-index-access check.
      const score = hourly[h0]! * (1 - t) + hourly[h1]! * t;
      const inRange = hourFrac >= fromHour && hourFrac <= toHour + 1;
      return { score, inRange };
    });
  }, [hourly, fromHour, toHour]);

  /**
   * Estimate sunrise/sunset from the hourly scores: the first/last
   * fractional hour where the curve crosses `SUNLIT_THRESHOLD`. Linear
   * interpolation between adjacent hourly samples gives minute-level
   * precision good enough for an at-a-glance "sun's up at X" label.
   * Returns null when the curve never reaches the threshold (polar
   * night, or a fully-shadowed terrace on a fully-overcast day).
   */
  const sunrise = useMemo(() => {
    for (let h = 0; h < 23; h++) {
      // h ∈ [0, 22], h+1 ∈ [1, 23]; both valid indices into a length-24
      // array. Non-null asserted for noUncheckedIndexedAccess.
      const cur = hourly[h]!;
      const next = hourly[h + 1]!;
      if (cur < SUNLIT_THRESHOLD && next >= SUNLIT_THRESHOLD) {
        const t = (SUNLIT_THRESHOLD - cur) / (next - cur);
        return h + t;
      }
    }
    return null;
  }, [hourly]);
  const sunset = useMemo(() => {
    for (let h = 22; h >= 0; h--) {
      const cur = hourly[h]!;
      const next = hourly[h + 1]!;
      if (cur >= SUNLIT_THRESHOLD && next < SUNLIT_THRESHOLD) {
        const t = (cur - SUNLIT_THRESHOLD) / (cur - next);
        return h + t;
      }
    }
    return null;
  }, [hourly]);

  return (
    <View style={styles.root}>
      {/*
        Title strip — explicit, so first-time users don't have to infer
        that this curve represents sun strength over the day. Sunrise
        and sunset are shown to the right as small annotations.
      */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Sun by hour</Text>
        {sunrise != null && sunset != null ? (
          <Text style={styles.annotations}>
            ☀ {fmtHour(sunrise)} – {fmtHour(sunset)}
          </Text>
        ) : null}
      </View>

      {/*
        Chart stack: the visual bars layer + an invisible touch layer
        on top. The touch layer keeps the existing "tap to focus this
        hour" behaviour from the old bar chart.
      */}
      <View style={styles.chartStack}>
        <View style={styles.barRow}>
          {subBars.map((bar, i) => (
            <View
              key={i}
              style={[
                styles.subBar,
                {
                  height: Math.max(2, bar.score * BAR_HEIGHT),
                  backgroundColor: lerpColor(bar.score),
                  // Out-of-visit-window bars dim significantly so the
                  // user's selected hours pop, but still legible so the
                  // shape-of-the-day reads correctly.
                  opacity: bar.inRange ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.touchRow} pointerEvents="box-none">
          {HOURS.map((h) => (
            <TouchableOpacity
              key={h}
              onPress={() => setRange(h, h)}
              activeOpacity={0.6}
              style={styles.touchCol}
              hitSlop={4}
            />
          ))}
        </View>
      </View>

      {/* Hour-axis labels at 00 / 06 / 12 / 18. */}
      <View style={styles.labelRow}>
        {HOURS.map((h) => (
          <View key={h} style={styles.labelCol}>
            {h % 6 === 0 ? (
              <Text style={styles.hourLabel}>{h.toString().padStart(2, '0')}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.ink,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  annotations: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
  },
  chartStack: {
    height: BAR_HEIGHT,
    position: 'relative',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_HEIGHT,
  },
  subBar: {
    flex: 1,
  },
  touchRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  touchCol: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  labelCol: {
    flex: 1,
    alignItems: 'center',
  },
  hourLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
  },
});
