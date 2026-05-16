/**
 * Branded landing page shown above the app surface on launch.
 *
 * Branded landing screen: sun-and-rays brand intro, then a scrolling
 * list of "Sunniest right now" cards GROUPED BY REGION (Jordaan,
 * Zuid, Oost, West, Centrum, Noord — six macro-regions of Amsterdam),
 * three terraces per region. The user taps a card to drill straight
 * into that terrace's detail, or "See all terraces" to enter the map.
 *
 * Restructured 2026-05-09 — was top-3-overall (which always picked
 * SW-facing Stadionbuurt venues at midday), now top-3-per-region so
 * users in any neighbourhood see a sunny option without scrolling.
 *
 * Animation sequence (Reanimated 3, all on the UI thread):
 *   0ms     overlay opaque, sun + text invisible
 *   80ms    sun core scales 0 → 1 (back-easing overshoot)
 *   120ms   8 rays fan out
 *   350ms   "Zonnie" wordmark fades + slides up
 *   600ms   tagline fades + slides up
 *   1100ms  region sections fade + slide in
 *   1700ms  "See all terraces" button fades in
 *   user taps card → select(id) + onContinue() (detail sheet animates
 *                    up after landing fades out)
 *   user taps button → onContinue() (lands on map without selection)
 *
 * Per region: featured terrace (`Terrace.featured === true` AND
 * non-zero current score) leads the section if one exists, otherwise
 * top-by-score. Featured slot is plumbing for paid bar-side bookings;
 * no terraces have it set yet.
 *
 * Scoring uses the CURRENT Amsterdam hour (single point in time, not
 * a window) so the landing answers "where's sunny right now?"
 * regardless of any in-app time-window the user has selected.
 */

import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { regionForArea, REGIONS_ORDERED, type Region } from '@/src/data/regions';
import { AMSTERDAM_TZ, computeRangeScore } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { useSelectionStore } from '@/src/store/selectionStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';
import type { Terrace } from '@/src/engines/types';

// Sun + ray geometry. Smaller than v1 to leave room for the 6 region
// sections × 3 cards each below — was 88×20×6, now compressed so the
// brand block takes ~30% of screen height instead of ~40%.
const RAY_COUNT = 8;
const SUN_DIAMETER = 64;
const RAY_LENGTH = 14;
const RAY_THICKNESS = 5;

interface LandingPageProps {
  /** Called when the user taps "Continue"; parent should unmount the landing. */
  onContinue: () => void;
}

interface TopVenue {
  terrace: Terrace;
  score: number;
  featured: boolean;
}

interface RegionSection {
  region: Region;
  venues: TopVenue[];
}

const PER_REGION = 3;

function nowAmsterdamHour(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

/**
 * Score every terrace at the current hour, group by macro-region, and
 * return the top N per region in the canonical region order
 * (Jordaan, Zuid, Oost, West, Centrum, Noord). Featured venues lead
 * their own region's section if their score is non-zero.
 *
 * Replaces the earlier "top 3 overall" picker. Per Andy's feedback:
 * one big top-3 was too coarse — most picks ended up in the same
 * SW-facing Stadionbuurt cluster. Splitting by region surfaces a
 * citywide spread so users in any neighbourhood see a sunny option
 * without scrolling past the Stadionbuurt cluster first.
 */
function pickTopByRegion(
  weatherByDate: ReturnType<typeof useWeatherStore.getState>['byDate'],
): RegionSection[] {
  const dateStr = todayAmsterdamDateStr();
  const hour = nowAmsterdamHour();
  const entry = weatherByDate[dateStr];
  const hourly = entry?.status === 'ready' ? entry.data : undefined;

  // Use a 2-hour window centred on now — identical to the main app's
  // default "Now" preset. This ensures landing page scores match what
  // the user sees when they tap "See all terraces".
  const fromHour = hour;
  const toHour = Math.min(hour + 2, 23);

  // One scoring pass for all terraces, then group by region.
  const scoredByRegion = new Map<Region, TopVenue[]>();
  for (const t of TERRACES) {
    const region = regionForArea(t.area);
    if (region == null) continue;
    const buildings = getBuildingsForTerrace(t.id);
    const score = computeRangeScore(t, buildings, fromHour, toHour, dateStr, 'sunny', hourly);
    const list = scoredByRegion.get(region) ?? [];
    list.push({ terrace: t, score, featured: false });
    scoredByRegion.set(region, list);
  }

  const sections: RegionSection[] = [];
  for (const region of REGIONS_ORDERED) {
    const list = scoredByRegion.get(region) ?? [];
    list.sort((a, b) => b.score - a.score);

    // Featured for this region: leads the section if it has a non-zero
    // current score (so a paid pick can never lead while in deep shadow).
    const featured = list.find((v) => v.terrace.featured === true && v.score > 0);

    const picks: TopVenue[] = [];
    if (featured) picks.push({ ...featured, featured: true });
    for (const v of list) {
      if (picks.length >= PER_REGION) break;
      if (picks.some((p) => p.terrace.id === v.terrace.id)) continue;
      picks.push(v);
    }

    // Skip a region with no terraces in the dataset (unlikely but
    // graceful — Jordaan is the smallest and could in principle be
    // empty for a filtered build).
    if (picks.length === 0) continue;
    sections.push({ region, venues: picks });
  }
  return sections;
}

export function LandingPage({ onContinue }: LandingPageProps) {
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const select = useSelectionStore((s) => s.select);
  // Recomputes whenever weather data loads — keeps the landing fresh
  // even if the fetch lands while the user is still reading.
  const sections = useMemo(
    () => pickTopByRegion(weatherByDate),
    [weatherByDate],
  );

  /**
   * Tapping a card on the landing page should open that terrace's
   * detail directly — set the selection BEFORE we fade out, so by
   * the time the map is visible the detail sheet has already animated
   * up. Saves the user a tap.
   */
  const handleCardPress = (terraceId: number) => {
    haptics.light();
    select(terraceId);
    // Defer onContinue by a frame so the selection has time to land
    // in the store + the detail sheet has rendered before we unmount
    // the landing.
    setTimeout(onContinue, 60);
  };

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

      {/* Top 3 per region. ScrollView in case the 6 regions × 3 cards
          overflow on smaller screens. */}
      <Animated.View style={[styles.cardStack, cardsStyle]}>
        <Text style={styles.sectionLabel}>SUNNIEST RIGHT NOW</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sections.map((section) => (
            <View key={section.region} style={styles.regionBlock}>
              <Text style={styles.regionLabel}>{section.region}</Text>
              {section.venues.map((v) => (
                <VenueCard
                  key={v.terrace.id}
                  venue={v}
                  onPress={handleCardPress}
                />
              ))}
            </View>
          ))}
        </ScrollView>
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
  venue: TopVenue;
  onPress: (terraceId: number) => void;
}

/**
 * Compact landing-page card. One row: name on the left (with optional
 * featured badge inline), area subtitle below, score chip on the right.
 * Tapping a card opens that terrace's detail directly — selection lands
 * before the landing fades, so by the time the map shows, the detail
 * sheet is already animating up.
 */
function VenueCard({ venue, onPress }: VenueCardProps) {
  const { terrace, score, featured } = venue;
  const pct = Math.round(score * 100);
  const color = scoreToColor(score);

  return (
    <Pressable
      onPress={() => onPress(terrace.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityLabel={`Open ${terrace.name}, ${pct}% sun`}
    >
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
          {terrace.area}
        </Text>
      </View>
      <View style={[styles.cardScore, { backgroundColor: color }]}>
        <Text style={styles.cardScoreText}>{pct}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.sand,
    zIndex: 1000,
    elevation: 1000,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'stretch',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
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
    marginTop: 16,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    color: palette.ink,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    letterSpacing: 0.2,
  },
  cardStack: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  regionBlock: {
    marginBottom: spacing.md,
  },
  regionLabel: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.ink,
    marginBottom: spacing.xs,
    letterSpacing: -0.2,
  },
  // Compact card — sized so 6 regions × 3 cards fit on a 6.7" screen
  // without scrolling on most phones, with scroll for smaller screens.
  // Single row layout: name + (optional) Featured badge over area
  // subtitle on the left; score chip on the right.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.xs,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
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
    fontSize: fontSizes.md,
    color: palette.ink,
  },
  featuredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
  },
  featuredBadgeText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 8,
    color: palette.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 1,
  },
  cardScore: {
    minWidth: 38,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  cardScoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.sm,
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
