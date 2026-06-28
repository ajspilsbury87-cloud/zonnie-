/**
 * SunRouteCard — the branded, story-format (9:16) visual rendered for a
 * "Chase the Sun" crawl, captured to a PNG by react-native-view-shot and
 * shared to Instagram Stories / the group chat.
 *
 * It is NOT shown in the normal UI — ChaseTheSunSheet renders it OFF-SCREEN
 * behind a ref, then captures that ref on share. Layout is a fixed logical
 * size (CARD_W × CARD_H); the capture is scaled up to story resolution.
 *
 * Flat warm fills only (no gradient dep). Colours come from the theme tokens
 * so it matches the brand and the in-app crawl sheet.
 *
 * NOTE: this component relies on react-native-view-shot (a NATIVE module) at
 * capture time — it therefore ships in build #16+, never via OTA to an older
 * binary. The capture is wrapped in a try/catch with a text-share fallback.
 */

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';
import type { CrawlPlan } from '@/src/engines/crawl';

/** Fixed logical card size (9:16). Captured at higher pixel density for stories. */
export const CARD_W = 340;
export const CARD_H = 604;

const STOP_COLORS = [palette.burnt, palette.peach, palette.mustard] as const;
function stopColor(i: number): string {
  return STOP_COLORS[i % STOP_COLORS.length] ?? palette.burnt;
}
function textOnStop(i: number): string {
  return stopColor(i) === palette.mustard ? palette.ink : palette.cream;
}

/**
 * The off-screen capture target. `collapsable={false}` is required on Android
 * so the view keeps a backing surface for captureRef; harmless on iOS.
 */
export const SunRouteCard = forwardRef<View, { plan: CrawlPlan }>(function SunRouteCard(
  { plan },
  ref,
) {
  const stops = plan.stops;
  const neighbourhood = stops[0]?.terrace.area ?? 'Amsterdam';
  const endHour = plan.endHour + 1;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Brand row */}
      <View style={styles.brandRow}>
        <Text style={styles.wordmark}>ZONNIE</Text>
        <Text style={styles.sun}>☀️</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>Chase the Sun</Text>
      <Text style={styles.subtitle}>
        {neighbourhood} · {stops.length} stops · sun till {endHour}:00
      </Text>

      {/* Route */}
      <View style={styles.route}>
        {stops.map((stop, i) => (
          <View key={stop.terrace.id} style={styles.stopBlock}>
            <View style={styles.stopRow}>
              <View style={[styles.dot, { backgroundColor: stopColor(i) }]}>
                <Text style={[styles.dotNum, { color: textOnStop(i) }]}>{i + 1}</Text>
              </View>
              <View style={styles.stopText}>
                <Text style={styles.stopName} numberOfLines={1}>
                  {stop.terrace.name}
                  {stop.isGoldenFinish ? '  🌅' : ''}
                </Text>
                <Text style={styles.stopTime}>
                  {stop.arriveHour}:00 – {stop.sunUntilHour + 1}:00 · in the sun
                </Text>
              </View>
            </View>
            {i < stops.length - 1 ? (
              <View style={styles.connector}>
                <Text style={styles.connectorText}>
                  ↓ {stops[i + 1]?.walkMinutesFromPrev ?? 0} min walk
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerLine}>Stay in the sun all afternoon.</Text>
        <Text style={styles.footerCta}>Zonnie — free on iOS ☀️</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: palette.cream,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    letterSpacing: 2,
    color: palette.burnt,
  },
  sun: { fontSize: fontSizes.lg },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 34,
    color: palette.cocoa,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: spacing.xs,
  },
  route: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  stopBlock: {},
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotNum: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
  },
  stopText: { flex: 1, minWidth: 0 },
  stopName: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  stopTime: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 1,
  },
  connector: {
    paddingLeft: 14,
    paddingVertical: spacing.xs,
  },
  connectorText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.peach,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: palette.sandDeep,
    paddingTop: spacing.md,
  },
  footerLine: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
  },
  footerCta: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.burnt,
    marginTop: 2,
  },
});
