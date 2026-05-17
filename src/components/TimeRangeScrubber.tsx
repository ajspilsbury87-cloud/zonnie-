/**
 * Time-window controls. Split into two sibling components so the
 * hourly weather strip can sit between them.
 *
 *   TimeRangeQuickPicker  ← peek-visible: WHEN card + 4 preset chips
 *   WeatherStrip          ← hourly forecast row
 *   TimeRangeFineTune     ← mid-snap+: FROM/TO sliders (Pro)
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { formatInTimeZone } from 'date-fns-tz';

import {
  AMSTERDAM_LAT,
  AMSTERDAM_LNG,
  AMSTERDAM_TZ,
} from '@/src/engines/scoring';
import { sunriseHour, sunsetHour } from '@/src/engines/solar';
import { haptics } from '@/src/lib/haptics';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { usePurchaseStore } from '@/src/store/purchaseStore';
import { useProPaywallStore } from '@/src/components/ProPaywall';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const HOURS = 24;

/**
 * Canonical chip width across the WHEN + WHAT cards. Computed from
 * the screen width minus the cards' outer + inner horizontal padding,
 * divided into 4 equal slots with `spacing.xs` gaps between.
 *
 * Why this exists: previously we used `flex: 1` (within-row equal)
 * then `flexBasis: '23.5%'`. Neither produced ACROSS-row equality —
 * yoga ignores percentage flexBasis when the parent chain has no
 * explicit width, and falls back to content-sizing. Fixed pixel
 * widths are the only reliable approach in RN flexbox.
 *
 * Both rows of WHAT (3 chips + 2 chips) use the same width, leaving
 * empty space on the right of shorter rows — the deliberate
 * trade-off for chip-size consistency across cards.
 */
export function useChipWidth(): number {
  const { width: screenWidth } = useWindowDimensions();
  // Outer padding from outerPad style (spacing.lg = 16, both sides).
  // Inner padding from card style (spacing.md = 12, both sides).
  // Gap between chips = spacing.xs (4). 4 chips, 3 gaps.
  const rowInner = screenWidth - 2 * spacing.lg - 2 * spacing.md;
  return Math.floor((rowInner - 3 * spacing.xs) / 4);
}

type PresetKey = 'now' | 'morning' | 'afternoon' | 'evening';
interface Preset {
  key: PresetKey;
  label: string;
  fixed: { from: number; to: number } | null;
}
const PRESETS: Preset[] = [
  { key: 'now',       label: 'Now',       fixed: null },
  { key: 'morning',   label: 'Morning',   fixed: { from: 9,  to: 12 } },
  { key: 'afternoon', label: 'Afternoon', fixed: { from: 13, to: 17 } },
  { key: 'evening',   label: 'Evening',   fixed: { from: 18, to: 22 } },
];

function nowHourLocal(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

function presetRange(p: Preset, sunset: number): { from: number; to: number } {
  if (p.fixed) {
    return {
      from: Math.min(p.fixed.from, sunset),
      to:   Math.min(p.fixed.to,   sunset),
    };
  }
  const h = nowHourLocal();
  return {
    from: Math.min(h,     sunset),
    to:   Math.min(h + 2, 23),
  };
}

function formatHour(h: number): string {
  return `${Math.round(h).toString().padStart(2, '0')}:00`;
}

// ─── Quick picker ─────────────────────────────────────────────────────

export function TimeRangeQuickPicker() {
  const fromHour      = useTimeStore((s) => s.fromHour);
  const toHour        = useTimeStore((s) => s.toHour);
  const setRange      = useTimeStore((s) => s.setRange);
  const setDateOffset = useTimeStore((s) => s.setDateOffset);
  const dateOffset    = useTimeStore((s) => s.dateOffset);
  const chipWidth     = useChipWidth();

  const sunset = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    return sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
  }, [dateOffset]);

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
    <View style={styles.outerPad}>
      <View style={styles.card}>
        {/* Card header row: label left, live time right */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>WHEN</Text>
          <Text style={styles.timeDisplay}>
            <Text style={styles.timeBold}>{formatHour(fromHour)}</Text>
            <Text style={styles.timeSep}> – </Text>
            <Text style={styles.timeBold}>{formatHour(toHour)}</Text>
          </Text>
        </View>

        {/* Preset chips */}
        <View style={styles.chipRow}>
          {PRESETS.map((p) => {
            const active = activePresetKey === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => applyPreset(p)}
                activeOpacity={0.7}
                style={[styles.chip, { width: chipWidth }, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Fine-tune sliders ────────────────────────────────────────────────

function DayNightTrack() {
  const segments = Array.from({ length: HOURS }, (_, h) => {
    const x = Math.max(0, Math.sin(((h - 6) * Math.PI) / 12));
    const r = Math.round(40 + (244 - 40) * x);
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
        onSlidingComplete={(h) => { haptics.light(); onCommit(h); }}
        minimumTrackTintColor={palette.burnt}
        maximumTrackTintColor={palette.mistDeep}
        thumbTintColor={palette.peach}
      />
    </View>
  );
}

export function TimeRangeFineTune() {
  const fromHour    = useTimeStore((s) => s.fromHour);
  const toHour      = useTimeStore((s) => s.toHour);
  const setFromHour = useTimeStore((s) => s.setFromHour);
  const setToHour   = useTimeStore((s) => s.setToHour);
  const dateOffset  = useTimeStore((s) => s.dateOffset);
  const isPro       = usePurchaseStore((s) => s.isPro);
  const showPaywall = useProPaywallStore((s) => s.show);

  const { sunrise, sunset } = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    return {
      sunrise: sunriseHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ),
      sunset:  sunsetHour(dateStr,  AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ),
    };
  }, [dateOffset]);

  return (
    <View style={styles.fineTuneRoot}>
      <View style={styles.scrubberArea}>
        <DayNightTrack />
        <View style={[styles.slidersOverlay, !isPro && styles.slidersLocked]}>
          <RangeSlider
            label="From"
            value={Math.max(sunrise, fromHour)}
            min={sunrise}
            max={Math.min(sunset, Math.max(sunrise, toHour))}
            onCommit={setFromHour}
          />
          <RangeSlider
            label="To"
            value={toHour}
            min={Math.min(sunset, Math.max(sunrise, fromHour))}
            max={sunset}
            onCommit={setToHour}
          />
        </View>
        {!isPro ? (
          <Pressable
            onPress={() => { haptics.light(); showPaywall('time_scrubber'); }}
            style={styles.lockOverlay}
            accessibilityLabel="Unlock custom time scrubber with Pro"
          >
            <View style={styles.lockBadge}>
              <Text style={styles.lockBadgeText}>🔒 Set exact hours — Pro</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

// Chip height: explicit so WHEN and WHAT chips are pixel-identical
const CHIP_H = 36;

const styles = StyleSheet.create({
  // ── WHEN card ─────────────────────────────────────────────────────
  outerPad: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 0,        // no gap between WHEN and WHAT cards
  },
  card: {
    backgroundColor: palette.sandDeep,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.mistDeep,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  timeDisplay: {
    // container for the nested Text nodes
  },
  timeBold: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  timeSep: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.mistDeep,
  },

  // ── Chips (shared by WHEN — WHAT uses same values) ─────────────────
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    // Width is set inline via `useChipWidth()` for pixel-perfect
    // consistency across all chip rows (WHEN + WHAT). Yoga ignores
    // percentage flexBasis when the parent chain lacks an explicit
    // width — that's why earlier `flexBasis: '23.5%'` rendered
    // chips at content-width instead. Fixed pixel widths it is.
    height: CHIP_H,
    paddingHorizontal: spacing.xs,     // breathing room — text no longer kisses the edge
    borderRadius: radii.md,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Subtle depth — chips read as raised tiles against the sandDeep
    // card background, not as flat blobs of colour.
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: palette.burnt,
    // Active state lifts slightly — clearer visual affordance for
    // "this one is selected" beyond just the colour change.
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    textAlign: 'center',
  },
  chipTextActive: {
    color: palette.cream,
  },

  // ── Fine-tune ───────────────────────────────────────────────────────
  fineTuneRoot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
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
  slidersLocked: {
    opacity: 0.35,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    backgroundColor: palette.sandDeep,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: palette.mistDeep,
  },
  lockBadgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
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
