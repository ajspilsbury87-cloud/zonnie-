/**
 * SunsOutBanner — a once-per-day celebratory "the sun's out" moment.
 *
 * Shows at the top of the landing page ONLY when today is a top-tier terrace
 * day (same forecast signal as the daily notification) AND it hasn't already
 * been shown today (persisted in sunsOutStore). Offers a one-tap "share with
 * the group" so the user drops the moment into their chat — the re-activation
 * / word-of-mouth lever from FEATURE-RESEARCH-Jun2026.md.
 *
 * Renders nothing on a normal day, before weather loads, or once dismissed/
 * shown today. Decision logic lives in the pure `shouldShowSunsOut` helper so
 * it's unit-tested without React/AsyncStorage.
 *
 * NOTE: this is a LOCAL, per-device moment — not a synchronized city-wide push
 * (the app has no push backend). A future server could fire it to everyone at
 * the same instant; today it triggers on each user's own app-open.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useWeatherStore } from '@/src/store/weatherStore';
import { useSunsOutStore } from '@/src/store/sunsOutStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { shouldShowSunsOut } from '@/src/lib/sunsOut';
import { shareSunsOut } from '@/src/lib/shareCard';
import { useStrings } from '@/src/i18n/useStrings';
import { haptics } from '@/src/lib/haptics';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function SunsOutBanner() {
  const t = useStrings();

  const weatherByDate = useWeatherStore((s) => s.byDate);
  const lastShownDate = useSunsOutStore((s) => s.lastShownDate);
  const hydrated = useSunsOutStore((s) => s.hydrated);
  const hydrate = useSunsOutStore((s) => s.hydrate);
  const markShownToday = useSunsOutStore((s) => s.markShownToday);

  // Per-session dismissal (separate from the persisted once-per-day gate).
  const [dismissed, setDismissed] = useState(false);

  // Load the persisted "last shown" date before deciding anything.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const todayStr = todayAmsterdamDateStr();
  const entry = weatherByDate[todayStr];
  const todayHourly = entry?.status === 'ready' ? entry.data : undefined;

  const show =
    hydrated && !dismissed && shouldShowSunsOut(todayHourly, lastShownDate, todayStr);

  // Mark as shown for today the moment it becomes visible, so it won't
  // reappear later today (e.g. after returning to the landing page).
  useEffect(() => {
    if (show) markShownToday(todayStr);
  }, [show, markShownToday, todayStr]);

  if (!show) return null;

  const handleShare = () => {
    haptics.light();
    shareSunsOut(t.sunsOutShareMessage).catch(() => {
      // User dismissed the share sheet — no-op.
    });
  };

  const handleDismiss = () => {
    haptics.selection();
    setDismissed(true);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headline}>{t.sunsOutHeadline}</Text>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t.sunsOutDismissA11y}
        >
          <Text style={styles.dismissGlyph}>✕</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={handleShare}
        style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={t.sunsOutShare}
      >
        <Text style={styles.shareButtonText}>{t.sunsOutShare}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.burnt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headline: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.cream,
    lineHeight: Math.round(fontSizes.md * 1.3),
  },
  dismissGlyph: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
    opacity: 0.8,
    lineHeight: 20,
  },
  shareButton: {
    alignSelf: 'flex-start',
    backgroundColor: palette.cream,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  shareButtonPressed: {
    opacity: 0.75,
  },
  shareButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.burnt,
  },
});
