/**
 * Time-window scrubber.
 *
 * Three layers, top to bottom:
 *   1. Title "Visiting HH:00 – HH:00" + overall weather summary.
 *   2. Preset pills [Now] [Afternoon] [Evening] [All day] — covers the
 *      dominant decisions ("where for the next two hours", "where this
 *      evening") in one tap. "Now" means "current hour → +2h, today";
 *      tapping it from another date jumps back to today.
 *   3. Two stacked sliders for fine-tuning a custom From/To. The
 *      day/night gradient track behind them gives a visual cue of where
 *      you're scrubbing relative to peak sun.
 *
 * The pills are the headline interaction; the sliders are the escape
 * hatch. Tapping a pill bypasses both sliders. Dragging a slider drops
 * the user out of any preset (active state recomputes from store).
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
import { formatInTimeZone } from 'date-fns-tz';

import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const HOURS = 24;

/**
 * Preset definitions. "now" computes its range relative to the current
 * Amsterdam hour at apply-time, so it always means "right now → 2h from
 * now". The others are fixed time windows.
 */
type PresetKey = 'now' | 'afternoon' | 'evening' | 'allday';
interface Preset {
  key: PresetKey;
  label: string;
  /** Fixed window, or null for "compute from current hour". */
  fixed: { from: number; to: number } | null;
}
const PRESETS: Preset[] = [
  { key: 'now', label: 'Now', fixed: null },
  { key: 'afternoon', label: 'Afternoon', fixed: { from: 13, to: 17 } },
  { key: 'evening', label: 'Evening', fixed: { from: 18, to: 22 } },
  { key: 'allday', label: 'All day', fixed: { from: 10, to: 20 } },
];

function nowHour(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

function presetRange(p: Preset): { from: number; to: number } {
  if (p.fixed) return p.fixed;
  const h = nowHour();
  return { from: h, to: Math.min(23, h + 2) };
}

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
  const setRange = useTimeStore((s) => s.setRange);
  const setDateOffset = useTimeStore((s) => s.setDateOffset);
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const weatherSummary = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (entry?.status !== 'ready') return null;
    return summarizeWindow(entry.data, fromHour, toHour);
  }, [dateOffset, fromHour, toHour, weatherByDate]);

  /**
   * Which preset (if any) matches the current store state? "Now" only
   * counts when we're on today AND the from/to is exactly now → now+2.
   * Drift away from any preset (e.g., user drags a slider) leaves all
   * pills inactive, which is the right signal — the user has gone
   * custom.
   */
  const activePresetKey = useMemo<PresetKey | null>(() => {
    for (const p of PRESETS) {
      const { from, to } = presetRange(p);
      if (p.key === 'now' && dateOffset !== 0) continue;
      if (fromHour === from && toHour === to) return p.key;
    }
    return null;
  }, [fromHour, toHour, dateOffset]);

  const applyPreset = (p: Preset) => {
    if (p.key === 'now' && dateOffset !== 0) setDateOffset(0);
    const { from, to } = presetRange(p);
    setRange(from, to);
  };

  return (
    <View style={styles.root}>
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

      <View style={styles.presetRow}>
        {PRESETS.map((p) => {
          const active = activePresetKey === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p)}
              activeOpacity={0.7}
              style={[styles.presetChip, active && styles.presetChipActive]}
            >
              <Text
                style={[
                  styles.presetChipText,
                  active && styles.presetChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  titleColumn: {
    minWidth: 0,
    marginBottom: spacing.sm,
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
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  presetChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
  },
  presetChipActive: {
    backgroundColor: palette.amber,
  },
  presetChipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  presetChipTextActive: {
    color: palette.white,
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
