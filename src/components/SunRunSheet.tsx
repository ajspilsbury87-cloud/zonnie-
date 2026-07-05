/**
 * SunRunSheet — "plan a run that finishes in the sun" (SPEC-sun-run-phase0).
 *
 * Summoned from a terrace's detail card: THAT terrace is the start point.
 * The user dials in distance (5–20k), a pace band (15-second steps of
 * min/km) and a start time (15-minute slider up to sunset); the engine
 * estimates arrival and picks a finish terrace that's sunny at that hour.
 * Share hands the plan to the native share sheet. Generation + share
 * counts go to the silent sun log so Phase 1 can be a data decision.
 *
 * After sunset the plan pivots to TOMORROW, matching the verdict card.
 * Phase 0: no accounts, no backend, no drawn routes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import { AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ } from '@/src/engines/scoring';
import { sunsetHour } from '@/src/engines/solar';
import {
  buildSunRunShareMessage,
  DEFAULT_PACE_INDEX,
  fmtClock,
  PACE_BANDS,
  planSunRun,
  RUN_DISTANCES,
  type RunDistance,
} from '@/src/engines/sunRun';
import { cachedHourScore } from '@/src/hooks/scoreCache';
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

const SLIDER_STEP_MIN = 15;

export function SunRunSheet() {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const isOpen = useSunRunStore((s) => s.isOpen);
  const originId = useSunRunStore((s) => s.originId);
  const close = useSunRunStore((s) => s.close);
  const logEvent = useSunLogStore((s) => s.log);
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const ensure = useWeatherStore((s) => s.ensure);

  const origin = useMemo(
    () => (originId != null ? TERRACES.find((x) => x.id === originId) ?? null : null),
    [originId],
  );

  // After sunset there's no run to finish in today's sun — plan tomorrow.
  const pastSunset = isPastSunsetAmsterdam();
  const dateStr = pastSunset ? selectedDateStr(1) : todayAmsterdamDateStr();
  useEffect(() => {
    if (isOpen) ensure(dateStr);
  }, [isOpen, ensure, dateStr]);

  // Start-time slider bounds (minutes from midnight, 15-min steps):
  // today = now (rounded up) → a bit before sunset; tomorrow = 07:00 → sunset.
  const sunset = sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
  const sliderMax = Math.floor((sunset * 60) / SLIDER_STEP_MIN) * SLIDER_STEP_MIN;
  const sliderMin = useMemo(() => {
    const base = pastSunset
      ? 7 * 60
      : Math.ceil((nowAmsterdamHourFloat() * 60) / SLIDER_STEP_MIN) * SLIDER_STEP_MIN;
    return Math.min(base, sliderMax - SLIDER_STEP_MIN);
  }, [pastSunset, sliderMax]);

  const [distanceKm, setDistanceKm] = useState<RunDistance>(5);
  const [paceIndex, setPaceIndex] = useState(DEFAULT_PACE_INDEX);
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  // Live label while dragging — the plan only recomputes on release.
  const [draftMinutes, setDraftMinutes] = useState<number | null>(null);
  const [excludeIds, setExcludeIds] = useState<ReadonlySet<number>>(new Set());
  const effectiveStart = Math.max(sliderMin, Math.min(startMinutes ?? sliderMin, sliderMax));

  const resetShuffle = useCallback(() => setExcludeIds(new Set()), []);

  const plan = useMemo(() => {
    if (!isOpen) return null;
    const entry = weatherByDate[dateStr];
    const hourly = entry?.status === 'ready' ? entry.data : undefined;
    const pace = PACE_BANDS[paceIndex] ?? PACE_BANDS[DEFAULT_PACE_INDEX]!;
    const exclude = new Set(excludeIds);
    if (originId != null) exclude.add(originId); // never finish where you started
    return planSunRun({
      terraces: TERRACES,
      distanceKm,
      pace,
      startMinutes: effectiveStart,
      origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
      originName: origin?.name,
      scoreAt: (terrace, hour) => cachedHourScore(terrace, hour, dateStr, hourly?.[hour]),
      excludeIds: exclude,
    });
  }, [isOpen, weatherByDate, dateStr, distanceKm, paceIndex, effectiveStart, origin, originId, excludeIds]);

  // One log line per generated plan.
  const lastLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (plan == null) return;
    const sig = `${plan.finish.id}:${plan.distanceKm}:${plan.pace.secPerKm}:${plan.startMinutes}`;
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
      // User dismissed the share sheet — nothing to do.
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

  const displayStart = draftMinutes ?? effectiveStart;

  return (
    <BottomSheet
      ref={ref}
      index={isOpen ? 0 : -1}
      snapPoints={['82%']}
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
            <Text style={styles.subtitle} numberOfLines={1}>
              {origin ? t.sunRunFrom(origin.name) : t.sunRunSubtitle}
              {pastSunset ? ` · ${t.sunRunTomorrowNote}` : ''}
            </Text>
          </View>
          <View style={styles.headerRight}><Text style={styles.runGlyph}>🏃</Text></View>
        </View>

        {/* DISTANCE */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t.sunRunDistance}</Text>
          <View style={styles.chipRow}>
            {RUN_DISTANCES.map((d) => (
              <Chip
                key={d}
                label={`${d}k`}
                active={d === distanceKm}
                grow
                onPress={() => { haptics.selection(); setDistanceKm(d); resetShuffle(); }}
              />
            ))}
          </View>
        </View>

        {/* PACE — horizontal band scroller, min/km in 15s steps */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>{t.sunRunPace}</Text>
            <Text style={styles.sectionValue}>{PACE_BANDS[paceIndex]?.label} /km</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paceScroll} contentContainerStyle={styles.paceScrollContent}>
            {PACE_BANDS.map((band, i) => (
              <Chip
                key={band.secPerKm}
                label={band.label}
                active={i === paceIndex}
                onPress={() => { haptics.selection(); setPaceIndex(i); resetShuffle(); }}
              />
            ))}
          </ScrollView>
        </View>

        {/* START TIME — 15-min slider up to sunset */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>{t.sunRunStart}</Text>
            <Text style={styles.sectionValue}>{fmtClock(displayStart)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={sliderMin}
            maximumValue={sliderMax}
            step={SLIDER_STEP_MIN}
            value={effectiveStart}
            onValueChange={setDraftMinutes}
            onSlidingComplete={(v) => {
              haptics.light();
              setDraftMinutes(null);
              setStartMinutes(v);
              resetShuffle();
            }}
            minimumTrackTintColor={palette.burnt}
            maximumTrackTintColor={palette.mistDeep}
            thumbTintColor={palette.peach}
          />
          <View style={styles.sliderBounds}>
            <Text style={styles.sliderBound}>{fmtClock(sliderMin)}</Text>
            <Text style={styles.sliderBound}>{fmtClock(sliderMax)}</Text>
          </View>
        </View>

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
              {t.sunRunArriveLine(plan.runMinutes, fmtClock(plan.arriveMinutes))}
              {plan.isSunny && plan.sunUntilHour != null
                ? ` · ${t.sunRunSunnyTill(`${String(plan.sunUntilHour + 1).padStart(2, '0')}:00`)}`
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

// ── Chip primitive ────────────────────────────────────────────────────────────

function Chip({ label, active, onPress, grow }: { label: string; active: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, grow && styles.chipGrow, active && styles.chipActive]}
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  closeButton: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.sandDeep,
    alignItems: 'center', justifyContent: 'center',
  },
  closeGlyph: { fontSize: 15, color: palette.inkSoft },
  headerCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  title: { fontFamily: fonts.displayBold, fontSize: fontSizes.xl, color: palette.ink, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.body, fontSize: fontSizes.xs, color: palette.inkSoft, marginTop: 1 },
  headerRight: { width: 32, alignItems: 'center' },
  runGlyph: { fontSize: 20 },
  section: { marginBottom: spacing.lg },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.xs },
  sectionLabel: {
    fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs, color: palette.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs,
  },
  sectionValue: { fontFamily: fonts.displayBold, fontSize: fontSizes.md, color: palette.burnt },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  // Escape the sheet's horizontal padding so pace bands scroll edge-to-edge.
  paceScroll: { marginHorizontal: -spacing.lg },
  paceScrollContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.mist,
    alignItems: 'center',
  },
  chipGrow: { flex: 1 },
  chipActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, color: palette.ink },
  chipTextActive: { color: palette.cream },
  slider: { width: '100%', height: 36 },
  sliderBounds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  sliderBound: { fontFamily: fonts.body, fontSize: fontSizes.xs, color: palette.mistDeep },
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
