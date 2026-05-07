/**
 * Time-window controls. Split into two sibling components so the
 * hourly weather strip can sit between them — visually the layout is:
 *
 *   ┌──── TimeRangeQuickPicker ────┐  ← peek-visible
 *   │ Visiting HH:00 – HH:00       │
 *   │ [Now][Afternoon][Evening][All day]│
 *   └──────────────────────────────┘
 *   ┌──── WeatherStrip (hourly) ───┐  ← peek-visible
 *   └──────────────────────────────┘
 *   ┌──── TimeRangeFineTune ───────┐  ← mid-snap+
 *   │ FROM ●─── 14:00              │
 *   │ TO   ──●── 16:00             │
 *   └──────────────────────────────┘
 *
 * Why split: when the scrubber was a single component, the hourly
 * weather strip was forced below it — invisible at the peek snap.
 * Splitting lets us reorder the elements in TerraceList's header so
 * the hourly read sits within the peek window.
 *
 * Both halves pull from `timeStore` independently. Dragging a slider
 * commits on `onSlidingComplete` only (one store write per gesture)
 * to avoid cascading score recomputes during the drag.
 *
 * Sunset cap: the `To` end of every preset and the `To` slider's max
 * are capped at sunset hour for the selected date. Past sunset every
 * terrace scores zero, so letting users pick e.g. 23:00 in December
 * (when sunset is 16:30) wastes everyone's time.
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { formatInTimeZone } from 'date-fns-tz';

import {
  AMSTERDAM_LAT,
  AMSTERDAM_LNG,
  AMSTERDAM_TZ,
} from '@/src/engines/scoring';
import { sunsetHour } from '@/src/engines/solar';
import { haptics } from '@/src/lib/haptics';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const HOURS = 24;

/**
 * Preset definitions. "now" computes its range relative to the current
 * Amsterdam hour at apply-time, so it always means "right now → 2h from
 * now". The others are fixed time windows. Both fixed and computed
 * ranges are clamped at sunset by the caller.
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

function nowHourLocal(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

function presetRange(p: Preset, sunset: number): { from: number; to: number } {
  if (p.fixed) {
    return {
      from: Math.min(p.fixed.from, sunset),
      to: Math.min(p.fixed.to, sunset),
    };
  }
  const h = nowHourLocal();
  return {
    from: Math.min(h, sunset),
    to: Math.min(h + 2, sunset),
  };
}

function formatHour(h: number): string {
  const i = Math.round(h);
  return `${i.toString().padStart(2, '0')}:00`;
}

// ─── Quick picker (peek-visible) ──────────────────────────────────────

export function TimeRangeQuickPicker() {
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setRange = useTimeStore((s) => s.setRange);
  const setDateOffset = useTimeStore((s) => s.setDateOffset);
  const dateOffset = useTimeStore((s) => s.dateOffset);

  const sunset = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    return sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
  }, [dateOffset]);

  /**
   * Which preset (if any) matches the current store state? "Now" only
   * counts when we're on today AND the from/to is exactly now → now+2.
   * Drift away from any preset (e.g., user drags a slider) leaves all
   * pills inactive — the right signal that the user has gone custom.
   */
  const activePresetKey = useMemo<PresetKey | null>(() => {
    for (const p of PRESETS) {
      const { from, to } = presetRange(p, sunset);
      if (p.key === 'now' && dateOffset !== 0) continue;
      if (fromHour === from && toHour === to) return p.key;
    }
    return null;
  }, [fromHour, toHour, dateOffset, sunset]);

  const applyPreset = (p: Preset) => {
    haptics.selection();
    if (p.key === 'now' && dateOffset !== 0) setDateOffset(0);
    const { from, to } = presetRange(p, sunset);
    setRange(from, to);
  };

  return (
    <View style={styles.quickRoot}>
      <Text style={styles.title}>
        Visiting{' '}
        <Text style={styles.titleStrong}>{formatHour(fromHour)}</Text>
        {' '}–{' '}
        <Text style={styles.titleStrong}>{formatHour(toHour)}</Text>
      </Text>

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
    </View>
  );
}

// ─── Fine-tune sliders (mid-snap+) ────────────────────────────────────

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
        onSlidingComplete={(h) => {
          haptics.light();
          onCommit(h);
        }}
        minimumTrackTintColor={palette.burnt}
        maximumTrackTintColor={palette.mistDeep}
        thumbTintColor={palette.peach}
      />
    </View>
  );
}

export function TimeRangeFineTune() {
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setFromHour = useTimeStore((s) => s.setFromHour);
  const setToHour = useTimeStore((s) => s.setToHour);
  const dateOffset = useTimeStore((s) => s.dateOffset);

  const sunset = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    return sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
  }, [dateOffset]);

  return (
    <View style={styles.fineTuneRoot}>
      <View style={styles.scrubberArea}>
        <DayNightTrack />
        <View style={styles.slidersOverlay}>
          <RangeSlider
            label="From"
            value={fromHour}
            min={0}
            max={Math.min(sunset, Math.max(0, toHour))}
            onCommit={setFromHour}
          />
          <RangeSlider
            label="To"
            value={toHour}
            min={Math.min(sunset, fromHour)}
            max={sunset}
            onCommit={setToHour}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quickRoot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  fineTuneRoot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    marginBottom: spacing.sm,
  },
  titleStrong: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
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
