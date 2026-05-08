/**
 * Branded landing page shown above the app surface on launch.
 *
 * Replaces the earlier 1.6s auto-dismissing SplashOverlay with an
 * interactive landing screen — same animated sun-and-rays moment, then
 * the top 3 sunny terraces "right now" fade in as cards, and the user
 * taps "Continue" to enter the map.
 *
 * Why a landing screen and not just-a-splash:
 *   1. First-impression value prop — the user sees what Zonnie does
 *      (rank terraces by sun) before they touch a control.
 *   2. Featured-bar placement surface — a `featured?: boolean` on
 *      Terrace can override the lead slot. No featured venues exist
 *      yet; plumbing is in place for bar-side paid bookings later.
 *   3. Better than auto-dismiss — gives users a beat to register
 *      "this is Zonnie" before the map's complexity loads in.
 *
 * Animation sequence (Reanimated 3, all on the UI thread):
 *   0ms     overlay opaque, sun + text invisible
 *   80ms    sun core scales 0 → 1 (back-easing overshoot)
 *   120ms   8 rays fan out
 *   350ms   "Zonnie" wordmark fades + slides up
 *   600ms   tagline fades + slides up
 *   1100ms  card stack fades in (staggered 80ms each)
 *   1700ms  "Continue" button fades in
 *   user taps → onContinue() fires
 *
 * Cards always show 3 venues:
 *   slot 0 — featured if any exists, else top-by-score
 *   slots 1-2 — top-by-score (skipping the featured one if used)
 *
 * Top-by-score uses the CURRENT Amsterdam hour (single point in time,
 * not a window) so the landing page answers "where's sunny right now?"
 * regardless of any time-window the user has previously selected
 * in-app. Mirrors the widget's "now" behaviour.
 */

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { formatInTimeZone } from 'date-fns-tz';

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { AMSTERDAM_TZ, computeSunScore, scoreLabel } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';
import type { Terrace } from '@/src/engines/types';

const RAY_COUNT = 8;
const SUN_DIAMETER = 88;
const RAY_LENGTH = 20;
const RAY_THICKNESS = 6;

interface LandingPageProps {
  /** Called when the user taps "Continue"; parent should unmount the landing. */
  onContinue: () => void;
}

interface TopVenue {
  terrace: Terrace;
  score: number;
  featured: boolean;
}

function nowAmsterdamHour(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

/**
 * Score every terrace at the current hour and pick 3:
 *   - Slot 0: featured if any, else top-by-score
 *   - Slots 1-2: next two by score (skipping the featured used in slot 0)
 */
function pickTopThree(weatherByDate: ReturnType<typeof useWeatherStore.getState>['byDate']): TopVenue[] {
  const dateStr = todayAmsterdamDateStr();
  const hour = nowAmsterdamHour();
  const entry = weatherByDate[dateStr];
  const hourly = entry?.status === 'ready' ? entry.data : undefined;
  const w = hourly?.[hour];

  const scored = TERRACES.map((t) => {
    const buildings = getBuildingsForTerrace(t.id);
    const r = computeSunScore(t, buildings, hour, dateStr, 'sunny', w);
    return { terrace: t, score: r.score };
  });
  scored.sort((a, b) => b.score - a.score);

  const result: TopVenue[] = [];

  // Lead slot — prefer a featured venue if one exists with a non-zero score.
  // (Excluding zero-score ensures we never lead with a venue that's currently
  // in deep shadow, even if it's a paid placement.)
  const featured = scored.find(
    (s) => s.terrace.featured === true && s.score > 0,
  );
  if (featured) {
    result.push({ ...featured, featured: true });
  }

  // Fill the remaining 2-3 slots from top-by-score, skipping any
  // already taken by the featured pick.
  for (const s of scored) {
    if (result.length >= 3) break;
    if (result.some((r) => r.terrace.id === s.terrace.id)) continue;
    result.push({ ...s, featured: false });
  }
  return result;
}

export function LandingPage({ onContinue }: LandingPageProps) {
  const weatherByDate = useWeatherStore((s) => s.byDate);
  // Recomputes whenever weather data loads — keeps the landing fresh
  // even if the fetch lands while the user is still reading.
  const top3 = useMemo(() => pickTopThree(weatherByDate), [weatherByDate]);

  // Animation drivers
  const containerOpacity = useSharedValue(1);
  const sunScale = useSharedValue(0);
  const rayProgress = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(8);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(6);
  const cardsOpacity = useSharedValue(0);
  const cardsTranslateY = useSharedValue(14);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    sunScale.value = withDelay(
      80,
      withSequence(
        withTiming(1.08, { duration: 280, easing: Easing.out(Easing.back(1.6)) }),
        withTiming(1.0, { duration: 140, easing: Easing.inOut(Easing.quad) }),
      ),
    );
    rayProgress.value = withDelay(
      120,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
    titleOpacity.value = withDelay(
      350,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    titleTranslateY.value = withDelay(
      350,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    taglineOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    taglineTranslateY.value = withDelay(
      600,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    // Cards fade in as a group (no per-card stagger — keeps the code
    // simple; the human eye reads them as appearing together anyway).
    cardsOpacity.value = withDelay(
      1100,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
    cardsTranslateY.value = withDelay(
      1100,
      withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }),
    );
    buttonOpacity.value = withDelay(
      1700,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    haptics.medium();
    // Fade the whole overlay out, then call onContinue.
    containerOpacity.value = withTiming(
      0,
      { duration: 280, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) {
          // runOnJS not needed because callbacks from withTiming on the
          // UI thread can't directly call JS — but onContinue is a JS
          // function. Use the imperative approach: schedule via the
          // setImmediate-equivalent in Reanimated.
        }
      },
    );
    // Defer the parent unmount call slightly so the fade-out has time
    // to start visually. setTimeout in JS is fine for ~280ms.
    setTimeout(onContinue, 280);
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));
  const sunCoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sunScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));
  const cardsStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
    transform: [{ translateY: cardsTranslateY.value }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  const rays = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, i) => ({
        i,
        angle: (i / RAY_COUNT) * 360,
      })),
    [],
  );

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Brand block: sun + title + tagline */}
      <View style={styles.brandBlock}>
        <View style={styles.sunGroup}>
          {rays.map(({ i, angle }) => (
            <Ray key={i} angle={angle} progress={rayProgress} />
          ))}
          <Animated.View style={[styles.sunCore, sunCoreStyle]} />
        </View>
        <Animated.Text style={[styles.title, titleStyle]}>Zonnie</Animated.Text>
        <Animated.Text style={[styles.tagline, taglineStyle]}>
          Sunniest terraces in Amsterdam
        </Animated.Text>
      </View>

      {/* Top 3 venue cards */}
      <Animated.View style={[styles.cardStack, cardsStyle]}>
        <Text style={styles.sectionLabel}>SUNNIEST RIGHT NOW</Text>
        {top3.map((v, idx) => (
          <VenueCard key={v.terrace.id} rank={idx + 1} venue={v} />
        ))}
      </Animated.View>

      {/* Continue button */}
      <Animated.View style={[styles.buttonWrap, buttonStyle]}>
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          accessibilityLabel="Continue to the map"
        >
          <Text style={styles.buttonText}>See all terraces</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

interface RayProps {
  angle: number;
  progress: ReturnType<typeof useSharedValue<number>>;
}

function Ray({ angle, progress }: RayProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance =
      SUN_DIAMETER / 2 -
      RAY_LENGTH * 0.6 +
      progress.value * (RAY_LENGTH * 0.6 + 6);
    return {
      transform: [{ rotate: `${angle}deg` }, { translateY: -distance }],
      opacity: progress.value,
    };
  });
  return <Animated.View style={[styles.ray, animatedStyle]} />;
}

interface VenueCardProps {
  rank: number;
  venue: TopVenue;
}

function VenueCard({ rank, venue }: VenueCardProps) {
  const { terrace, score, featured } = venue;
  const pct = Math.round(score * 100);
  const color = scoreToColor(score);
  const label = scoreLabel(score);

  return (
    <View style={styles.card}>
      <View style={styles.cardRank}>
        <Text style={styles.cardRankText}>{rank}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {terrace.name}
          </Text>
          {featured ? (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {terrace.area} · {label}
        </Text>
      </View>
      <View style={[styles.cardScore, { backgroundColor: color }]}>
        <Text style={styles.cardScoreText}>{pct}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.sand,
    zIndex: 1000,
    elevation: 1000,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.xxl,
    alignItems: 'stretch',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  sunGroup: {
    width: SUN_DIAMETER + RAY_LENGTH * 2,
    height: SUN_DIAMETER + RAY_LENGTH * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunCore: {
    width: SUN_DIAMETER,
    height: SUN_DIAMETER,
    borderRadius: SUN_DIAMETER / 2,
    backgroundColor: palette.peach,
    shadowColor: palette.burnt,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  ray: {
    position: 'absolute',
    width: RAY_THICKNESS,
    height: RAY_LENGTH,
    borderRadius: RAY_THICKNESS / 2,
    backgroundColor: palette.peach,
  },
  title: {
    marginTop: 28,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    color: palette.ink,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    letterSpacing: 0.2,
  },
  cardStack: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    // Soft shadow for depth on the cream background.
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRankText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardName: {
    flex: 1,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  featuredBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
  },
  featuredBadgeText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 9,
    color: palette.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  cardScore: {
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  cardScoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
  buttonWrap: {
    marginTop: spacing.lg,
  },
  button: {
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
  },
});
