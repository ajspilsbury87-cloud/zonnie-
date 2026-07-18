/**
 * BuzzRow — "☀️ 14 check-ins here this week" + a check-in button, shown on
 * the terrace detail sheet (community Phase B).
 *
 * Renders NOTHING while the buzz backend flag is off (dark launch) — the
 * whole feature lights up via one OTA when BUZZ_API_URL is set.
 *
 * Counts are cumulative on purpose: a counter that only grows never looks
 * dead, unlike "0 people here now" (see FEATURE-RESEARCH-community-Jul2026).
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isBuzzEnabled } from '@/src/lib/buzz';
import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { useBuzzStore } from '@/src/store/buzzStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function BuzzRow({ terraceId }: { terraceId: number }) {
  const t = useStrings();
  const counts = useBuzzStore((s) => s.counts[terraceId]);
  const checkedDay = useBuzzStore((s) => s.checkedDays[terraceId]);
  const hydrate = useBuzzStore((s) => s.hydrate);
  const load = useBuzzStore((s) => s.load);
  const checkIn = useBuzzStore((s) => s.checkIn);

  useEffect(() => {
    if (!isBuzzEnabled()) return;
    void hydrate();
    void load(terraceId);
  }, [terraceId, hydrate, load]);

  if (!isBuzzEnabled()) return null;

  const checkedToday = checkedDay === todayAmsterdamDateStr();
  const label =
    counts == null
      ? t.buzzFirst // no data yet (or first ever) — invite, never "0"
      : counts.week > 0
        ? t.buzzWeek(counts.week)
        : counts.total > 0
          ? t.buzzTotal(counts.total)
          : t.buzzFirst;

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Pressable
        onPress={() => {
          if (checkedToday) return;
          haptics.medium();
          void checkIn(terraceId);
        }}
        disabled={checkedToday}
        style={({ pressed }) => [
          styles.button,
          checkedToday && styles.buttonDone,
          pressed && !checkedToday && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={checkedToday ? t.buzzCheckedIn : t.buzzCheckIn}
      >
        <Text style={[styles.buttonText, checkedToday && styles.buttonTextDone]}>
          {checkedToday ? t.buzzCheckedIn : t.buzzCheckIn}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.cream,
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  label: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.cocoa,
  },
  button: {
    backgroundColor: palette.burnt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  buttonDone: {
    backgroundColor: palette.white,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
  },
  buttonTextDone: {
    color: palette.cocoa,
  },
});
