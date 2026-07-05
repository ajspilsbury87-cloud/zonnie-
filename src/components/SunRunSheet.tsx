/**
 * SunRunSheet — "plan a run that finishes in the sun" (SPEC-sun-run-phase0).
 *
 * Phase 0: no accounts, no backend, no routes. The user picks distance,
 * pace and a start time; we estimate the arrival hour and pick a terrace
 * that is SUNNY at that hour (sunRun.ts engine), then hand the result to
 * the native share sheet so it lands in the group chats where run plans
 * already happen. Generation + share counts go to the silent sun log so
 * Phase 1 can be a data decision.
 *
 * Gorhom BottomSheet inline, controlled by useSunRunStore — same pattern
 * as ChaseTheSunSheet. After sunset the plan pivots to TOMORROW, matching
 * the verdict card's behaviour, with a visible note.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import {
  buildSunRunShareMessage,
  planSunRun,
  RUN_DISTANCES,
  type RunDistance,
  type RunPace,
} from '@/src/engines/sunRun';
import { cachedHourScore } from '@/src/hooks/scoreCache';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { APP_STORE_URL } from '@/src/lib/shareCard';
import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { useSunLogStore } from '@/src/store/sunLogStore';
import { useSunRunStore } from '@/src/store/sunRunStore';
import {
  isPastSunsetAmsterdam,
  nowAmsterdamHourFloat,
  selectedDateStr,
  todayAmsterdamDateStr,
} from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';
import { Share } from 'react-native';

const PACES: RunPace[] = ['easy', 'steady', 'quick'];

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function SunRunSheet() {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const isOpen = useSunRunStore((s) => s.isOpen);
  const close = useSunRunStore((s) => s.close);
  const logEvent = useSunLogStore((s) => s.log);
  const { coord } = useUserLocation();
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const ensure = useWeatherStore((s) => s.ensure);

  // After sunset there's no run to finish in today's sun — plan tomorrow.
  const pastSunset = isPastSunsetAmsterdam();
  const dateStr = pastSunset ? selectedDateStr(1) : todayAmsterdamDateStr();
  useEffect(() => {
    if (isOpen) ensure(dateStr);
  }, [isOpen, ensure, dateStr]);

  // Start-time chips: today = now + the next two hours (capped at 21:00);
  // tomorrow (post-sunset) = morning / midday / evening presets.
  const startChips = useMemo(() => {
    if (pastSunset) return [9, 12, 18];
    const base = Math.min(21, Math.max(6, Math.ceil(nowAmsterdamHourFloat())));
    return [...new Set([base, Math.min(21, base + 1), Math.min(21, base + 2)])];
  }, [pastSunset]);

  const [distanceKm, setDistanceKm] = useState<RunDistance>(5);
  const [pace, setPace] = useState<RunPace>('easy');
  const [startHour, setStartHour] = useState<number | null>(null);
  const [excludeIds, setExcludeIds] = useState<ReadonlySet<number>>(new Set());
  const effectiveStart = startHour ?? startChips[0] ?? 17;

  // Any input change invalidates the shuffle history.
  const pick = useCallback(<T,>(setter: (v: T) => void) => (v: T) => {
    haptics.selection();
    setter(v);
    setExcludeIds(new Set());
  }, []);

  const plan = useMemo(() => {
    if (!isOpen) return null;
    const entry = weatherByDate[dateStr];
    const hourly = entry?.status === 'ready' ? entry.data : undefined;
    return planSunRun({
      terraces: TERRACES,
      distanceKm,
      pace,
      startHour: effectiveStart,
      origin: coord,
      scoreAt: (terrace, hour) => cachedHourScore(terrace, hour, dateStr, hourly?.[hour]),
      excludeIds,
    });
  }, [isOpen, weatherByDate, dateStr, distanceKm, pace, effectiveStart, coord, excludeIds]);

  // One log line per generated plan (deduped by finish id via excludeIds churn).
  const lastLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (plan == null) return;
    const sig = `${plan.finish.id}:${plan.distanceKm}:${plan.pace}:${plan.startHour}`;
    if (lastLoggedRef.current === sig) return;
    lastLoggedRef.current = sig;
    logEvent({ ts: Date.now(), terraceId: plan.finish.id, action: 'sunrun_generate', score: plan.score });
  }, [plan, logEvent]);

  const handleShare = useCallback(async () => {
    if (plan == null) return;
    haptics.light();
    logEvent({ ts: Date.now(), terraceId: plan.finish.id, action: 'sunrun_share', score: plan.score });
    try {
      await Share.share({ message: buildSunRunShareMessage(plan, APP_STORE_URL), url: APP_STORE_URL });
    } catch {
      // User dismissed the sheet — nothing to do.
    }
  }, [plan, logEvent]);

  const handleAnotherFinish = useCallback(() => {
    if (plan == null) return;
    haptics.selection();
    setExcludeIds((prev) => new Set([...prev, plan.finish.id]));
  }, [plan]);

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

  return (
    <BottomSheet
      ref={ref}
      index={isOpen ? 0 : -1}
      snapPoints={['80%']}
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
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable onPress={() => { haptics.light(); close(); }} style={styles.closeButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeGlyph}>✕</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{t.sunRunTitle}</Text>
            <Text style={styles.subtitle}>{pastSunset ? t.sunRunTomorrowNote : t.sunRunSubtitle}</Text>
          </View>
          <View style={styles.headerRight}><Text style={styles.runGlyph}>🏃</Text></View>
        </View>

        {/* INPUT CHIPS */}
        <ChipRow label={t.sunRunDistance}>
          {RUN_DISTANCES.map((d) => (
            <Chip key={d} label={`${d}k`} active={d === distanceKm} onPress={() => pick(setDistanceKm)(d)} />
          ))}
        </ChipRow>
        <ChipRow label={t.sunRunPace}>
          {PACES.map((p) => (
            <Chip key={p} label={t.sunRunPaceLabel(p)} active={p === pace} onPress={() => pick(setPace)(p)} />
          ))}
        </ChipRow>
        <ChipRow label={t.sunRunStart}>
          {startChips.map((h, i) => (
            <Chip
              key={h}
              label={!pastSunset && i === 0 ? t.sunRunNow : fmtHour(h)}
              active={h === effectiveStart}
              onPress={() => pick(setStartHour)(h)}
            />
          ))}
        </ChipRow>

        {/* RESULT */}
        {plan != null ? (
          <View style={[styles.resultCard, !plan.isSunny && styles.resultCardGrey]}>
            <Text style={styles.resultKicker}>
              {plan.isSunny ? t.sunRunFinishLabel : t.sunRunNoSunny}
            </Text>
            <View style={styles.resultRow}>
              <View style={styles.resultBody}>
                <Text style={styles.resultName} numberOfLines={1}>{plan.finish.name}</Text>
                <Text style={styles.resultArea} numberOfLines={1}>📍 {plan.finish.area}</Text>
              </View>
              <View style={[styles.scoreChip, { backgroundColor: scoreToColor(plan.score) }]}>
                <Text style={styles.scoreText}>{Math.round(plan.score * 100)}</Text>
              </View>
            </View>
            <Text style={styles.resultMeta}>
              {t.sunRunArriveLine(plan.runMinutes, fmtHour(plan.arriveHour))}
              {plan.isSunny && plan.sunUntilHour != null
                ? ` · ${t.sunRunSunnyTill(fmtHour(plan.sunUntilHour + 1))}`
                : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.resultCard}>
            <Text style={styles.resultMeta}>{t.sunRunNoFinish}</Text>
          </View>
        )}

        {/* ACTIONS */}
        <Pressable
          onPress={handleShare}
          disabled={plan == null}
          style={({ pressed }) => [styles.shareButton, plan == null && styles.buttonDisabled, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel={t.sunRunShare}
        >
          <Text style={styles.shareButtonText}>{t.sunRunShare}</Text>
        </Pressable>
        <Pressable
          onPress={handleAnotherFinish}
          disabled={plan == null}
          style={({ pressed }) => [styles.outlineButton, plan == null && styles.buttonDisabled, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel={t.sunRunAnother}
        >
          <Text style={styles.outlineButtonText}>{t.sunRunAnother}</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// ── Small chip primitives ─────────────────────────────────────────────────────

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  handle: { backgroundColor: palette.mistDeep },
  background: { backgroundColor: palette.sand, borderRadius: 24 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  closeButton: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.sandDeep,
    alignItems: 'center', justifyContent: 'center',
  },
  closeGlyph: { fontSize: 15, color: palette.inkSoft },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: fontSizes.xl, color: palette.ink, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.body, fontSize: fontSizes.xs, color: palette.inkSoft, marginTop: 1 },
  headerRight: { width: 32, alignItems: 'center' },
  runGlyph: { fontSize: 20 },
  chipSection: { marginBottom: spacing.md },
  chipLabel: {
    fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs, color: palette.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.mist,
  },
  chipActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, color: palette.ink },
  chipTextActive: { color: palette.cream },
  resultCard: {
    backgroundColor: palette.white, borderRadius: radii.lg, padding: spacing.md,
    marginTop: spacing.xs, marginBottom: spacing.lg,
    borderLeftWidth: 3, borderLeftColor: palette.peach,
    shadowColor: palette.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2,
  },
  resultCardGrey: { borderLeftColor: palette.mistDeep },
  resultKicker: {
    fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs, color: palette.terracotta,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultBody: { flex: 1, minWidth: 0 },
  resultName: { fontFamily: fonts.displayBold, fontSize: fontSizes.lg, color: palette.ink },
  resultArea: { fontFamily: fonts.body, fontSize: fontSizes.sm, color: palette.inkSoft, marginTop: 1 },
  scoreChip: { minWidth: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.pill, alignItems: 'center' },
  scoreText: { fontFamily: fonts.displayBold, fontSize: fontSizes.md, color: palette.white },
  resultMeta: { fontFamily: fonts.body, fontSize: fontSizes.sm, color: palette.inkSoft, marginTop: spacing.sm },
  shareButton: {
    backgroundColor: palette.ink, borderRadius: radii.pill, paddingVertical: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  shareButtonText: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, color: palette.cream },
  outlineButton: {
    borderWidth: 1.5, borderColor: palette.ink, borderRadius: radii.pill,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  outlineButtonText: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, color: palette.ink },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.4 },
});
