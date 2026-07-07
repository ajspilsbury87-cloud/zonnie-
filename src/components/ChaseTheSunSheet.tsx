/**
 * ChaseTheSunSheet — the full-screen "Chase the Sun" crawl overlay.
 *
 * Renders as a Gorhom BottomSheet (inline, not modal — same pattern as
 * TerraceDetailSheet). Controlled by useCrawlStore.isOpen.
 *
 * Layout (top → bottom):
 *   HEADER      — title "Chase the sun", subtitle with neighbourhood/stops/end-hour
 *   SUN-BAR     — proportional hour-tick timeline with coloured stop segments
 *   LEAVE-BY    — urgency pill: "Leave stop 1 by HH:00 to stay in the sun"
 *   STOP CARDS  — one card per stop with WALK CONNECTORS between them
 *   FOOTER      — Share button, then Start + Shuffle in a row
 *
 * Key display conventions (from crawl.ts comments):
 *   - "sun till X:00" → display sunUntilHour + 1 (sunUntilHour is the LAST sunny hour)
 *   - The golden-finish stop gets a warm golden card bg + sunset glyph
 *   - Segment colours cycle: burnt → peach → mustard (loops for >3 stops)
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import { buildGoogleMapsNavigationUrl } from '@/src/data/places';
import { useCrawlStore } from '@/src/store/crawlStore';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { captureRef } from 'react-native-view-shot';

import { shareCrawl, shareCrawlInvite, shareImageFile } from '@/src/lib/shareCard';
import { SunRouteCard } from '@/src/components/SunRouteCard';
import { haptics } from '@/src/lib/haptics';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  spacing,
} from '@/src/theme/tokens';
import { useStrings } from '@/src/i18n/useStrings';
import type { CrawlStop } from '@/src/engines/crawl';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Facing → human-readable label. Mirrors FACING_LABELS in TerraceDetailSheet.
 * Defined locally so ChaseTheSunSheet has no circular import dependency.
 */
const FACING_LABELS: Record<string, string> = {
  N: 'North',
  NE: 'Northeast',
  E: 'East',
  SE: 'Southeast',
  S: 'South',
  SW: 'Southwest',
  W: 'West',
  NW: 'Northwest',
  All: 'All directions',
};

/**
 * One colour per stop position in the sun-bar and on the stop badge.
 * Cycles for >3 stops (unlikely but handled gracefully).
 * Warm gradient: burnt (first stop, most urgent) → peach → mustard (later stops).
 */
const STOP_COLORS = [palette.burnt, palette.peach, palette.mustard] as const;

function stopColor(index: number): string {
  return STOP_COLORS[index % STOP_COLORS.length] ?? palette.burnt;
}

/**
 * Text colour that contrasts on a given stop's badge/chip background.
 * Mustard (#F4D58D) is light → needs dark ink; burnt/peach are dark enough
 * for cream. Same contrast rule as SunLegend.textColorForScore.
 */
function textOnStopColor(index: number): string {
  return stopColor(index) === palette.mustard ? palette.ink : palette.cream;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Horizontal timeline bar.
 *
 * Renders hour-tick labels above the bar (just start and end hours to avoid
 * clutter) and one proportionally-sized coloured segment per stop.
 *
 * "Width proportional to that stop's sunny duration" means we compute
 * each stop's contribution as (sunUntilHour - arriveHour) in whole hours,
 * then flex accordingly.
 */
function SunBar({ stops }: { stops: CrawlStop[] }) {
  if (stops.length === 0) return null;

  const firstStop = stops[0]!;
  const lastStop = stops[stops.length - 1]!;
  const startHour = firstStop.arriveHour;
  const endHour = lastStop.sunUntilHour + 1; // display hour

  // Each segment's flex weight = its sunny duration in hours.
  // For stop i: from arriveHour to min(sunUntilHour, next.arriveHour).
  // We give at least 1 unit of flex so a very short stop is still visible.
  const segmentDurations = stops.map((stop, i) => {
    const clampEnd =
      i + 1 < stops.length
        ? Math.min(stop.sunUntilHour, stops[i + 1]!.arriveHour)
        : stop.sunUntilHour;
    return Math.max(1, clampEnd - stop.arriveHour);
  });
  const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);

  return (
    <View style={sunBarStyles.container}>
      {/* Hour labels above the bar */}
      <View style={sunBarStyles.tickRow}>
        <Text style={sunBarStyles.tick}>{startHour}:00</Text>
        <Text style={sunBarStyles.tick}>{endHour}:00</Text>
      </View>

      {/* Coloured segments */}
      <View style={sunBarStyles.bar}>
        {stops.map((stop, i) => {
          const flex = (segmentDurations[i] ?? 1) / totalDuration;
          const color = stopColor(i);
          const isFirst = i === 0;
          const isLast = i === stops.length - 1;
          return (
            <View
              key={stop.terrace.id}
              style={[
                sunBarStyles.segment,
                {
                  flex,
                  backgroundColor: color,
                  // Round left edge on first, right edge on last.
                  borderTopLeftRadius: isFirst ? radii.pill : 0,
                  borderBottomLeftRadius: isFirst ? radii.pill : 0,
                  borderTopRightRadius: isLast ? radii.pill : 0,
                  borderBottomRightRadius: isLast ? radii.pill : 0,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const sunBarStyles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  tick: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    lineHeight: Math.round(fontSizes.xs * 1.3),
  },
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  segment: {
    // flex is set dynamically
  },
});

/**
 * A single stop card.
 *
 * Visual treatment:
 *   - White/sand background with a subtle border
 *   - Circular number badge tinted with the stop colour
 *   - Terrace name in display font
 *   - Subtitle: area · facing
 *   - Sun chip showing arrive-to-until window
 *   - Golden-finish stop: cream/golden bg, sunset glyph, extra subtitle line
 */
function StopCard({
  stop,
  index,
}: {
  stop: CrawlStop;
  index: number;
}) {
  const t = useStrings();
  const color = stopColor(index);
  const fg = textOnStopColor(index);
  const isGolden = stop.isGoldenFinish;

  const facingLabel = FACING_LABELS[stop.terrace.facing] ?? stop.terrace.facing;
  const displayUntil = stop.sunUntilHour + 1; // "sun till X:00"
  const sunChip = t.crawlSunChip(stop.arriveHour, displayUntil);

  return (
    <View
      style={[
        stopCardStyles.card,
        isGolden && stopCardStyles.cardGolden,
      ]}
    >
      <View style={stopCardStyles.row}>
        {/* Circular number badge */}
        <View style={[stopCardStyles.badge, { backgroundColor: color }]}>
          <Text style={[stopCardStyles.badgeText, { color: fg }]}>{index + 1}</Text>
        </View>

        {/* Name + subtitle */}
        <View style={stopCardStyles.textBlock}>
          <View style={stopCardStyles.nameRow}>
            <Text style={stopCardStyles.name} numberOfLines={2}>
              {stop.terrace.name}
            </Text>
            {/* Sunset glyph for golden-finish stop — shown inline after the name */}
            {isGolden ? (
              <Text style={stopCardStyles.goldenGlyph}> 🌅</Text>
            ) : null}
          </View>
          <Text style={stopCardStyles.subtitle}>
            {stop.terrace.area} · {facingLabel}
          </Text>
          {isGolden ? (
            <Text style={stopCardStyles.goldenLabel}>{t.crawlGoldenFinish}</Text>
          ) : null}
        </View>
      </View>

      {/* Sun chip */}
      <View style={stopCardStyles.chipRow}>
        <View style={[stopCardStyles.sunChip, { backgroundColor: color }]}>
          <Text style={[stopCardStyles.sunChipText, { color: fg }]}>{sunChip}</Text>
        </View>
      </View>
    </View>
  );
}

const stopCardStyles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: palette.mist,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
  },
  cardGolden: {
    backgroundColor: palette.cream,
    borderColor: palette.peach,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  badgeText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.white,
    lineHeight: Math.round(fontSizes.sm * 1.3),
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
    flexShrink: 1,
  },
  goldenGlyph: {
    fontSize: fontSizes.md,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  goldenLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.burnt,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  chipRow: {
    marginTop: spacing.sm,
  },
  sunChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  sunChipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    // Cream on burnt/peach, ink on mustard — hand-checked contrast.
    color: palette.white,
    lineHeight: Math.round(fontSizes.xs * 1.3),
  },
});

/**
 * Walk-time connector shown between stop cards.
 *
 * Renders a centred row with a walk glyph and the time + distance label.
 * Styled as muted text so it visually recedes between the bolder stop cards.
 */
function WalkConnector({
  minutes,
  metres,
  t,
}: {
  minutes: number;
  metres: number;
  t: ReturnType<typeof useStrings>;
}) {
  return (
    <View style={connectorStyles.row}>
      <Text style={connectorStyles.text}>
        {'🚶 '}{t.crawlWalkConnector(minutes, metres)}
      </Text>
    </View>
  );
}

const connectorStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    lineHeight: Math.round(fontSizes.sm * 1.4),
  },
});

// ─── Main sheet ───────────────────────────────────────────────────────────────

export function ChaseTheSunSheet() {
  const t = useStrings();
  const ref = useRef<BottomSheet>(null);
  // Off-screen Sun Route card, captured to a PNG for image sharing.
  const cardRef = useRef<View>(null);
  const insets = useSafeAreaInsets();

  const plan = useCrawlStore((s) => s.plan);
  const isOpen = useCrawlStore((s) => s.isOpen);
  const close = useCrawlStore((s) => s.close);
  const shuffle = useCrawlStore((s) => s.shuffle);

  const dateOffset = useTimeStore((s) => s.dateOffset);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  // Open / close imperatively, same pattern as TerraceDetailSheet.
  useEffect(() => {
    if (isOpen) {
      ref.current?.snapToIndex(0);
    } else {
      ref.current?.close();
    }
  }, [isOpen]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
      />
    ),
    [],
  );

  const handleClose = useCallback(() => {
    haptics.light();
    close();
  }, [close]);

  const handleShare = useCallback(async () => {
    if (!plan) return;
    haptics.light();
    try {
      // Capture the off-screen branded Sun Route card to a PNG and share the
      // image (Instagram Stories / group chat). Needs the native capture
      // module — present from build #16 on.
      const uri = await captureRef(cardRef, { format: 'png', quality: 0.95 });
      await shareImageFile(uri);
    } catch {
      // Capture unavailable or failed (or the user dismissed the sheet) →
      // fall back to the text share so sharing always works.
      shareCrawl(plan).catch(() => {});
    }
  }, [plan]);

  // Invite framing (Phase 0, SPEC-sun-run-phase0 §3B): same plan, shared as
  // something to JOIN — meet time + start point up front. Text-only by
  // design; the reader needs the where/when, not the poster image.
  const handleInvite = useCallback(() => {
    if (!plan) return;
    haptics.light();
    shareCrawlInvite(plan).catch(() => {});
  }, [plan]);

  const handleStart = useCallback(() => {
    if (!plan || plan.stops.length === 0) return;
    haptics.medium();
    const firstStop = plan.stops[0]!;
    const url = buildGoogleMapsNavigationUrl({
      lat: firstStop.terrace.lat,
      lng: firstStop.terrace.lng,
      placeId: firstStop.terrace.placeId,
      name: firstStop.terrace.name,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://maps.google.com/?q=${firstStop.terrace.lat},${firstStop.terrace.lng}`,
      );
    });
  }, [plan]);

  const handleShuffle = useCallback(() => {
    if (!plan) return;
    haptics.selection();
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.data;
    shuffle(dateStr, weatherProfile, hourlyWeather);
  }, [plan, dateOffset, weatherByDate, weatherProfile, shuffle]);

  // Sheet index: 0 = open at snap point, -1 = off screen.
  const sheetIndex = isOpen ? 0 : -1;

  // Build the subtitle from the first stop's neighbourhood + stop count + end hour.
  const firstStop = plan?.stops[0];
  const neighbourhood = firstStop?.terrace.area ?? '';
  const stopCount = plan?.stops.length ?? 0;
  const displayEndHour = plan ? plan.endHour + 1 : 0;

  // "Leave by" chip: the first stop's sunUntilHour+1 is when the user should leave stop 1.
  const leaveByHour = firstStop ? firstStop.sunUntilHour + 1 : 0;

  return (
    <>
      {/* Off-screen branded Sun Route card — mounted only when a plan exists,
          positioned far off-screen so it lays out for captureRef but is never
          seen or touchable. */}
      {plan != null ? (
        <View style={styles.offscreen} pointerEvents="none">
          <SunRouteCard ref={cardRef} plan={plan} />
        </View>
      ) : null}
      <BottomSheet
        ref={ref}
        index={sheetIndex}
      snapPoints={['92%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={close}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {plan != null ? (
          <>
            {/* HEADER */}
            <View style={styles.header}>
              {/* Close button (left) */}
              <Pressable
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeGlyph}>✕</Text>
              </Pressable>

              {/* Title + subtitle (centred) */}
              <View style={styles.headerCenter}>
                <Text style={styles.title}>{t.chaseTheSun}</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {t.crawlSubtitle(neighbourhood, stopCount, displayEndHour)}
                </Text>
              </View>

              {/* Sun glyph (right) — decorative, balances the close button */}
              <View style={styles.headerRight}>
                <Text style={styles.sunGlyph}>☀️</Text>
              </View>
            </View>

            {/* SUN-BAR timeline */}
            <SunBar stops={plan.stops} />

            {/* LEAVE-BY chip */}
            {firstStop != null ? (
              <View style={styles.leaveByPill}>
                <Text style={styles.leaveByText}>
                  {'🕐 '}{t.crawlLeaveBy(leaveByHour)}
                </Text>
              </View>
            ) : null}

            {/* STOP CARDS with WALK CONNECTORS */}
            <View style={styles.stopsContainer}>
              {plan.stops.map((stop, i) => (
                <View key={stop.terrace.id}>
                  {/* Walk connector before each stop (except the first) */}
                  {i > 0 ? (
                    <WalkConnector
                      minutes={stop.walkMinutesFromPrev}
                      metres={stop.walkMetersFromPrev}
                      t={t}
                    />
                  ) : null}
                  <StopCard stop={stop} index={i} />
                </View>
              ))}
            </View>

            {/* FOOTER: Share button + Start / Shuffle row */}
            <View style={styles.footer}>
              {/* Share — primary full-width */}
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.shareButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityLabel={t.crawlShareRoute}
              >
                <Text style={styles.shareButtonText}>{t.crawlShareRoute}</Text>
              </Pressable>

              {/* Invite — full-width outline, invite-framed text share */}
              <Pressable
                onPress={handleInvite}
                style={({ pressed }) => [
                  styles.inviteButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t.crawlInvite}
              >
                <Text style={styles.outlineButtonText}>{t.crawlInvite}</Text>
              </Pressable>

              {/* Start + Shuffle — equal-width row */}
              <View style={styles.actionRow}>
                <Pressable
                  onPress={handleStart}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityLabel={t.crawlStart}
                >
                  <Text style={styles.outlineButtonText}>{t.crawlStart}</Text>
                </Pressable>
                <Pressable
                  onPress={handleShuffle}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityLabel={t.crawlShuffle}
                >
                  <Text style={styles.outlineButtonText}>{t.crawlShuffle}</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : null}
      </BottomSheetScrollView>
      </BottomSheet>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Parks the capture card far off-screen: laid out (so captureRef works) but
  // never visible or interactive.
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  background: {
    backgroundColor: palette.sand,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: palette.mistDeep,
    width: 36,
  },
  content: {
    paddingBottom: spacing.xxl,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    lineHeight: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.cocoa,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 2,
    lineHeight: Math.round(fontSizes.xs * 1.3),
  },
  headerRight: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunGlyph: {
    fontSize: fontSizes.lg,
  },

  // ── Leave-by pill ─────────────────────────────────────────────────────────
  leaveByPill: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: palette.mustard,
    borderRadius: radii.pill,
  },
  leaveByText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.ink,
    lineHeight: Math.round(fontSizes.sm * 1.3),
    textAlign: 'center',
  },

  // ── Stop cards container ──────────────────────────────────────────────────
  stopsContainer: {
    marginTop: spacing.lg,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  shareButton: {
    backgroundColor: palette.burnt,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Invite — full-width outline between Share and the Start/Shuffle row.
  inviteButton: {
    borderWidth: 1.5,
    borderColor: palette.peach,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  outlineButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: palette.peach,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  outlineButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.burnt,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
