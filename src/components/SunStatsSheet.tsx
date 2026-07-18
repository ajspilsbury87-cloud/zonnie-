/**
 * SunStatsSheet — "My sun summer": personal, shareable stats from the
 * on-device sun log (Phase A of the community plan,
 * FEATURE-RESEARCH-community-Jul2026.md).
 *
 * Zero backend: everything is computed from sunLogStore's local history at
 * open time. The share button is the experiment — its wrapped_share events
 * are the gate metric for whether users share personal sun moments at all
 * (which decides Phase B). Copy says "explored", never "visited": the log
 * records in-app interactions, not physical presence.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatInTimeZone } from 'date-fns-tz';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { computeSunStats } from '@/src/engines/sunStats';
import { APP_STORE_URL } from '@/src/lib/shareCard';
import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { useLanguageStore } from '@/src/store/languageStore';
import { useSunLogStore } from '@/src/store/sunLogStore';
import { useSunStatsStore } from '@/src/store/sunStatsStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const dayOf = (ts: number) => formatInTimeZone(new Date(ts), AMSTERDAM_TZ, 'yyyy-MM-dd');

export function SunStatsSheet() {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const isOpen = useSunStatsStore((s) => s.isOpen);
  const close = useSunStatsStore((s) => s.close);
  const events = useSunLogStore((s) => s.events);
  const hydrate = useSunLogStore((s) => s.hydrate);
  const logEvent = useSunLogStore((s) => s.log);

  // Full history lives in AsyncStorage; hydrate on open (self-guarding, and
  // `events` updates reactively when it lands).
  useEffect(() => {
    if (isOpen) void hydrate();
  }, [isOpen, hydrate]);

  const stats = useMemo(
    () => computeSunStats(events, todayAmsterdamDateStr(), dayOf),
    [events],
  );
  const sunniestName = useMemo(
    () =>
      stats.sunniestTerraceId != null
        ? TERRACES.find((x) => x.id === stats.sunniestTerraceId)?.name ?? null
        : null,
    [stats.sunniestTerraceId],
  );

  const handleShare = useCallback(async () => {
    haptics.light();
    // The gate metric for Phase B: do people share personal sun moments?
    logEvent({ ts: Date.now(), terraceId: -1, action: 'wrapped_share' });
    const nl = useLanguageStore.getState().lang === 'nl';
    const lines = nl
      ? [
          `☀️ Mijn zonzomer met Zonnie`,
          `${stats.distinctTerraces} terrassen ontdekt · ${stats.activeDays} actieve dagen`,
          stats.sunniestPct != null && sunniestName != null
            ? `Zonnigste moment: ${stats.sunniestPct} ☀ bij ${sunniestName}`
            : null,
          '',
          `Vind jouw plek in de zon → ${APP_STORE_URL}`,
        ]
      : [
          `☀️ My sun summer with Zonnie`,
          `${stats.distinctTerraces} terraces explored · ${stats.activeDays} active days`,
          stats.sunniestPct != null && sunniestName != null
            ? `Sunniest moment: ${stats.sunniestPct} ☀ at ${sunniestName}`
            : null,
          '',
          `Find your place in the sun → ${APP_STORE_URL}`,
        ];
    try {
      await Share.share({ message: lines.filter((l) => l != null).join('\n'), url: APP_STORE_URL });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }, [stats, sunniestName, logEvent]);

  const ref = useRef<BottomSheet>(null);
  useEffect(() => {
    if (isOpen) ref.current?.snapToIndex(0);
    else ref.current?.close();
  }, [isOpen]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const hasHistory = stats.totalActions >= 3;

  return (
    <BottomSheet
      ref={ref}
      index={isOpen ? 0 : -1}
      snapPoints={['62%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={close}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t.sunStatsTitle}</Text>

        {hasHistory ? (
          <>
            <View style={styles.tileRow}>
              <StatTile value={String(stats.distinctTerraces)} label={t.statTerraces} />
              <StatTile value={String(stats.activeDays)} label={t.statActiveDays} />
            </View>
            <View style={styles.tileRow}>
              <StatTile
                value={stats.currentStreak > 0 ? `🔥 ${stats.currentStreak}` : String(stats.bestStreak)}
                label={stats.currentStreak > 0 ? t.statStreak : t.statBestStreak}
              />
              <StatTile value={String(stats.sunRuns)} label={t.statRuns} />
            </View>

            {stats.sunniestPct != null && sunniestName != null ? (
              <View style={styles.sunniestCard}>
                <Text style={styles.sunniestText}>
                  {t.sunStatsSunniest(sunniestName, stats.sunniestPct)}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t.sunStatsShare}
            >
              <Text style={styles.shareButtonText}>{t.sunStatsShare}</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t.sunStatsEmpty}</Text>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { backgroundColor: palette.mistDeep },
  background: { backgroundColor: palette.sand, borderRadius: 24 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.ink,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  tileRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  tileValue: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    color: palette.burnt,
    letterSpacing: -0.5,
  },
  tileLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  sunniestCard: {
    backgroundColor: palette.cream,
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sunniestText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: palette.cocoa },
  shareButton: {
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  shareButtonText: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, color: palette.cream },
  pressed: { opacity: 0.75 },
  emptyCard: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: fontSizes.md * 1.5,
  },
});
