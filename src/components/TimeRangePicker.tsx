/**
 * Visit-window picker. Two horizontally-scrolling rows of hour chips ("From"
 * and "To"). Tap a chip to select. Tapping `From` past the current `To`
 * pulls `To` forward; tapping `To` before `From` pulls `From` back. The
 * store enforces the `from <= to` invariant so this stays sane.
 *
 * No slider, no `onValueChange` firing 60×/s — every interaction is a
 * single tap, which is the whole point of moving away from the slider that
 * was crashing the JS thread.
 */

import { memo, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CHIP_WIDTH = 52;

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

interface HourRowProps {
  selectedHour: number;
  inRange: (hour: number) => boolean;
  onSelect: (hour: number) => void;
}

const HourRow = memo(function HourRow({ selectedHour, inRange, onSelect }: HourRowProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Scroll the selected hour roughly to the middle when it changes
  // externally (e.g., "Now" button).
  useEffect(() => {
    const x = Math.max(0, selectedHour * CHIP_WIDTH - CHIP_WIDTH * 3);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [selectedHour]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {HOURS.map((h) => {
        const isSelected = h === selectedHour;
        const isInRange = inRange(h);
        return (
          <TouchableOpacity
            key={h}
            onPress={() => onSelect(h)}
            activeOpacity={0.7}
            style={[
              styles.chip,
              isInRange && styles.chipInRange,
              isSelected && styles.chipSelected,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                isInRange && styles.chipLabelInRange,
                isSelected && styles.chipLabelSelected,
              ]}
            >
              {formatHour(h)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

export function TimeRangePicker() {
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setFromHour = useTimeStore((s) => s.setFromHour);
  const setToHour = useTimeStore((s) => s.setToHour);
  const resetToNow = useTimeStore((s) => s.resetToNow);

  const inRange = (h: number) => h >= fromHour && h <= toHour;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Visiting <Text style={styles.titleStrong}>{formatHour(fromHour)}</Text> to{' '}
          <Text style={styles.titleStrong}>{formatHour(toHour)}</Text>
        </Text>
        <TouchableOpacity onPress={resetToNow} style={styles.nowButton}>
          <Text style={styles.nowButtonText}>Now</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.rowLabel}>From</Text>
      <HourRow selectedHour={fromHour} inRange={inRange} onSelect={setFromHour} />

      <Text style={styles.rowLabel}>To</Text>
      <HourRow selectedHour={toHour} inRange={inRange} onSelect={setToHour} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },
  titleStrong: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
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
  rowLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  scroll: {
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    width: CHIP_WIDTH - spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
  },
  chipInRange: {
    backgroundColor: '#FFE5C4',
  },
  chipSelected: {
    backgroundColor: palette.amber,
  },
  chipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  chipLabelInRange: {
    color: palette.amberDeep,
  },
  chipLabelSelected: {
    color: palette.white,
    fontFamily: fonts.bodySemibold,
  },
});
