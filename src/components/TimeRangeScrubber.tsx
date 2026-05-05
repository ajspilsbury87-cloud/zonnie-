/**
 * Time-window scrubber. Two stacked horizontal sliders — one for "From",
 * one for "To" — that let the user drag to set their visit window. The
 * track shows a day/night gradient (dark at 0–6 and 22–24, peak yellow
 * at 12) so the user gets a visual sense of where they're scrubbing
 * without needing to read the numeric label.
 *
 * Replaces the chip-row picker. Two reasons we moved away from chips:
 *   1. Coffee in the Sun's signature feature is a draggable scrubber and
 *      it tested as the killer interaction. Chip rows were second-best.
 *   2. The chip rows fired `setFromHour`/`setToHour` synchronously on
 *      every tap. Rapid tapping cascaded scoring recomputes and was the
 *      most likely culprit for the time-change crashes Andy was seeing.
 *
 * Slider behaviour: only commits to the store on `onSlidingComplete`
 * (drag-end). During the drag we update LOCAL state to keep the label
 * live, but the score engine doesn't run until the user lifts their
 * finger. That's the slider equivalent of "discrete tap" — one commit
 * per interaction, no cascade.
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const HOURS = 24;

/**
 * One-line weather summary for the visit window — average temp, dominant
 * sky condition, wind descriptor. Sits below the "Visiting HH:00 – HH:00"
 * title so users get a glance-able overall weather read at the lowest
 * sheet snap, before they expand to see the per-hour strip.
 */
function summarizeWindow(
  data: { temp: number; cloudCover: number; windSpeed?: number }[] | undefined,
  fromHour: number,
  toHour: number,
): string | null {
  if (!data) return null;
  let tempSum = 0;
  let cloudSum = 0;
  let windSum = 0;
  let count = 0;
  for (let h = fromHour; h <= toHour; h++) {
    const w = data[h];
    if (!w) continue;
    tempSum += w.temp;
    cloudSum += w.cloudCover;
    windSum += w.windSpeed ?? 0;
    count++;
  }
  if (count === 0) return null;
  const avgTemp = Math.round(tempSum / count);
  const avgCloud = cloudSum / count;
  const avgWind = windSum / count;

  let cloudLabel: string;
  if (avgCloud < 25) cloudLabel = '☀ Clear';
  else if (avgCloud < 50) cloudLabel = '🌤 Mostly clear';
  else if (avgCloud < 75) cloudLabel = '⛅ Mixed';
  else cloudLabel = '☁ Cloudy';

  let windLabel: string;
  if (avgWind < 8) windLabel = 'Calm';
  else if (avgWind < 16) windLabel = 'Breezy';
  else if (avgWind < 25) windLabel = 'Windy';
  else windLabel = 'Gusty';

  return `${cloudLabel} · ${avgTemp}° · ${windLabel}`;
}

function formatHour(h: number): string {
  const i = Math.round(h);
  return `${i.toString().padStart(2, '0')}:00`;
}

/**
 * Day/night track background. We render a row of 24 narrow segments
 * tinted by time-of-day brightness — dawn ramp, midday peak, dusk ramp,
 * night dim. The slider thumb glides over this so the user sees where
 * they're scrubbing without reading numbers. Cheap pure-View render,
 * no gradient library needed.
 */
function DayNightTrack() {
  const segments = Array.from({ length: HOURS }, (_, h) => {
    // Brightness curve: peak at 13, low at 1 and 23.
    // f(h) = max(0, sin((h-6) * π/12)) gives 0 at sunrise(6)/sunset(18), 1 at noon(12)
    const x = Math.max(0, Math.sin(((h - 6) * Math.PI) / 12));
    const r = Math.round(40 + (244 - 40) * x); // ink → mustard R
    const g = Math.round(31 + (213 - 31) * x);
    const b = Math.round(21 + (141 - 21) * x);
    return { h, color: `rgb(${r},${g},${b})` };
  });
  return (
    <View style={styles.track} pointerEvents="none">
      {segments.map((s) => (
        <View key={s.h} style={[styles.trackSegment, { backgroundColor: s.color }]} />
      ))}
    </View>
  );
}

interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (h: number) => void;
}

function RangeSlider({ label, value, min, max, onCommit }: RangeSliderProps) {
  // Local mirror — updates during drag for live label feedback. Only
  // pushes to the store on drag-end via `onSlidingComplete`.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <Text style={styles.sliderValue}>{formatHour(local)}</Text>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value}
        onValueChange={setLocal}
        onSlidingComplete={onCommit}
        minimumTrackTintColor={palette.burnt}
        maximumTrackTintColor={palette.mistDeep}
        thumbTintColor={palette.peach}
      />
    </View>
  );
}

export function TimeRangeScrubber() {
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setFromHour = useTimeStore((s) => s.setFromHour);
  const setToHour = useTimeStore((s) => s.setToHour);
  const resetToNow = useTimeStore((s) => s.resetToNow);
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const weatherSummary = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (entry?.status !== 'ready') return null;
    return summarizeWindow(entry.data, fromHour, toHour);
  }, [dateOffset, fromHour, toHour, weatherByDate]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>
            Visiting{' '}
            <Text style={styles.titleStrong}>{formatHour(fromHour)}</Text>
            {' '}–{' '}
            <Text style={styles.titleStrong}>{formatHour(toHour)}</Text>
          </Text>
          {weatherSummary ? (
            <Text style={styles.summary} numberOfLines={1}>
              {weatherSummary}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={resetToNow} style={styles.nowButton} activeOpacity={0.7}>
          <Text style={styles.nowButtonText}>Now</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scrubberArea}>
        <DayNightTrack />
        <View style={styles.slidersOverlay}>
          <RangeSlider
            label="From"
            value={fromHour}
            min={0}
            max={Math.max(0, toHour)}
            onCommit={setFromHour}
          />
          <RangeSlider
            label="To"
            value={toHour}
            min={Math.min(23, fromHour)}
            max={23}
            onCommit={setToHour}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },
  titleStrong: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  summary: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  nowButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
  },
  nowButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  scrubberArea: {
    position: 'relative',
  },
  track: {
    position: 'absolute',
    top: spacing.xl + spacing.xs,
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    opacity: 0.18,
  },
  trackSegment: {
    flex: 1,
    height: '100%',
  },
  slidersOverlay: {
    gap: spacing.xs,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderLabel: {
    width: 44,
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sliderValue: {
    width: 56,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
    textAlign: 'right',
  },
  slider: {
    flex: 1,
    height: 36,
    marginLeft: spacing.sm,
  },
});
