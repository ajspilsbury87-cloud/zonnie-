/**
 * Branded landing page shown above the app surface on launch.
 *
 * Branded landing screen: sun-and-rays brand intro, then:
 *   1. FEATURED carousel — horizontal photo cards for featured terraces
 *      (paid/curated placements, always shown regardless of sun score).
 *      Only rendered when at least one terrace has `featured === true`.
 *   2. SUNNIEST NOW — a single citywide top list. (Simplified 2026-07-09
 *      from top-3-per-region after first-user feedback: six region blocks
 *      were too dense for a first launch. One sundial, one list.)
 *
 * Restructured 2026-05-09 — was top-3-overall (which always picked
 * SW-facing Stadionbuurt venues at midday), now top-3-per-region so
 * users in any neighbourhood see a sunny option without scrolling.
 *
 * Restructured 2026-06-18 — full-screen scrollable: brand header scrolls
 * away with content; "See all terraces" CTA pinned as an absolute footer.
 * Home overlay is now controlled by useLandingStore (no onContinue prop).
 * Tapping a card only selects — detail sheet opens OVER the Home overlay,
 * so closing detail returns to Home without a map flash.
 *
 * Animation sequence (Reanimated 3, all on the UI thread):
 *   0ms     overlay opaque, sun + text invisible
 *   80ms    sun core scales 0 → 1 (back-easing overshoot)
 *   120ms   8 rays fan out
 *   350ms   "Zonnie" wordmark fades + slides up
 *   600ms   tagline fades + slides up
 *   1100ms  featured cards + top list fade + slide in
 *   1700ms  "See all terraces" button fades in
 *   user taps card → select(id) (detail opens over Home)
 *   user taps button → hideLanding() (lands on map without selection)
 *
 * Scoring uses the CURRENT Amsterdam hour (single point in time, not
 * a window) so the landing answers "where's sunny right now?"
 * regardless of any in-app time-window the user has selected.
 */

import { useEffect, useState } from 'react';
import { Image, InteractionManager, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatInTimeZone } from 'date-fns-tz';

import { useStrings } from '@/src/i18n/useStrings';
import { useLanguageStore } from '@/src/store/languageStore';
import { SunsOutBanner } from './SunsOutBanner';
import { TodaysVerdict } from './TodaysVerdict';
import { TERRACES } from '@/src/data/terraces';
import { isWorldCupLive, matchForBanner } from '@/src/data/worldcup';
import { countParadeViewTerraces, isWorldPrideLive } from '@/src/data/pride';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { rangeScoreForTerrace } from '@/src/hooks/scoreCache';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useLandingStore } from '@/src/store/landingStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { useSunStatsStore } from '@/src/store/sunStatsStore';
import { isPastSunsetAmsterdam, selectedDateStr, todayAmsterdamDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';
import type { Terrace } from '@/src/engines/types';

// Brand mark on the landing — the real Zonnie app-icon artwork (the sunset),
// so the header matches the icon users see on the home screen / App Store
// instead of the old flat sun-and-rays motif.
const BRAND_ICON_SIZE = 96;

/** Width/height of each featured photo card in the carousel. */
const FEATURED_CARD_W = 180;
const FEATURED_CARD_H = 118;

// CTA footer height — used to add matching bottom padding inside the
// ScrollView so the last content row is never hidden under the button.
const CTA_FOOTER_HEIGHT = 64;

interface TopVenue {
  terrace: Terrace;
  score: number;
  featured: boolean;
}

interface FeaturedVenue {
  terrace: Terrace;
  score: number;
}

const TOP_CITYWIDE = 6;

function nowAmsterdamHour(): number {
  const h = Number(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'H'));
  return Number.isFinite(h) ? h : 12;
}

/**
 * The day + window the landing should show. After sunset there's no sun to
 * chase tonight, so we pivot to TOMORROW's afternoon (and relabel the section);
 * otherwise it's today's current 2-hour window.
 */
function effectiveDayWindow(): { dateStr: string; fromHour: number; toHour: number } {
  if (isPastSunsetAmsterdam()) {
    // Tomorrow — "now" is meaningless, so use a representative afternoon window.
    return { dateStr: selectedDateStr(1), fromHour: 13, toHour: 15 };
  }
  const hour = nowAmsterdamHour();
  return { dateStr: todayAmsterdamDateStr(), fromHour: hour, toHour: Math.min(hour + 2, 23) };
}

/**
 * Score every terrace over the effective window and return the citywide
 * top N. One flat list — the earlier top-3-per-region grouping (six blocks)
 * was too much for a first-time user; area still shows on each card.
 */
function pickTopCitywide(
  weatherByDate: ReturnType<typeof useWeatherStore.getState>['byDate'],
): TopVenue[] {
  const { dateStr, fromHour, toHour } = effectiveDayWindow();
  const entry = weatherByDate[dateStr];
  const hourly = entry?.data;

  const scored: TopVenue[] = [];
  for (const t of TERRACES) {
    // Cached range score — shares the per-hour cache with the map + list so
    // first-launch scoring is computed once across surfaces, not three times.
    const score = rangeScoreForTerrace(t, fromHour, toHour, dateStr, hourly);
    if (score > 0) scored.push({ terrace: t, score, featured: t.featured === true });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_CITYWIDE);
}

/**
 * Return all featured terraces with their current sun score.
 * Unlike the regional picks, featured terraces are shown regardless of
 * score — a paid placement always appears, even at night.
 */
function pickFeaturedTerraces(
  weatherByDate: ReturnType<typeof useWeatherStore.getState>['byDate'],
): FeaturedVenue[] {
  const { dateStr, fromHour, toHour } = effectiveDayWindow();
  const entry = weatherByDate[dateStr];
  const hourly = entry?.data;

  return TERRACES
    .filter((t) => t.featured === true)
    .map((t) => ({
      terrace: t,
      score: rangeScoreForTerrace(t, fromHour, toHour, dateStr, hourly),
    }));
}

/**
 * Number of terraces with at least one outdoor screen in the dataset.
 * Computed once at module load — TERRACES is a static import.
 */
const SCREEN_TERRACE_COUNT = TERRACES.filter((t) => (t.outdoorScreens ?? 0) > 0).length;
// Terraces within sight of the WorldPride Canal Parade route (~137). One
// pass over the dataset at module load; verdicts cached inside pride.ts.
const PARADE_TERRACE_COUNT = countParadeViewTerraces(TERRACES);

export function LandingPage() {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const ensure = useWeatherStore((s) => s.ensure);
  const select = useSelectionStore((s) => s.select);
  // After sunset the landing pivots to tomorrow (see effectiveDayWindow); used
  // to relabel the sunniest section and to fetch tomorrow's forecast on Home.
  const pastSunset = isPastSunsetAmsterdam();
  const setMatchModeOnly = useAreaStore((s) => s.setMatchModeOnly);
  // Store-driven dismiss — no prop needed.
  const hideLanding = useLandingStore((s) => s.hide);
  const introPlayed = useLandingStore((s) => s.introPlayed);
  const markIntroPlayed = useLandingStore((s) => s.markIntroPlayed);

  // Evaluate once per render — cheap string comparison, no side effects.
  const today = todayAmsterdamDateStr();
  const wcLive = isWorldCupLive(today);
  const wcMatch = wcLive ? matchForBanner(today) : null;
  // WorldPride window (25 Jul – 8 Aug 2026) — picks up right after the WC
  // layer retires on 19 Jul; the two spotlights are never visible together.
  const prideLive = isWorldPrideLive(today);

  // Scoring all ~1,028 terraces is the heaviest work on this screen. Running it
  // inside render (useMemo) blocked the first paint and the JS thread, so the
  // "See all terraces" tap didn't register for several seconds on a cold launch.
  // Instead we paint immediately with no cards, then compute the rankings AFTER
  // interactions/animations settle (so taps are handled first). Recomputes when
  // the live forecast lands (weatherByDate changes).
  const [topVenues, setTopVenues] = useState<TopVenue[]>([]);
  const [featuredTerraces, setFeaturedTerraces] = useState<FeaturedVenue[]>([]);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setTopVenues(pickTopCitywide(weatherByDate));
      setFeaturedTerraces(pickFeaturedTerraces(weatherByDate));
    });
    return () => task.cancel();
  }, [weatherByDate]);

  // Ensure the day we're showing is fetched. Today is ensured app-wide, but
  // after sunset we show tomorrow — only prefetched once the map opens — so
  // trigger it here too, or the sunniest list would have no scores on Home.
  useEffect(() => {
    ensure(pastSunset ? selectedDateStr(1) : todayAmsterdamDateStr());
  }, [ensure, pastSunset]);

  /**
   * Tapping the WC spotlight card or matchday banner activates the
   * "outdoor screens" filter and navigates straight to the map.
   */
  const handleWcPress = () => {
    haptics.medium();
    setMatchModeOnly(true);
    // Small delay so the filter state lands before Home hides and the
    // map re-renders with the active filter applied.
    setTimeout(hideLanding, 60);
  };

  /** WorldPride spotlight → parade-route filter + straight to the map. */
  const setPrideRouteOnly = useAreaStore((s) => s.setPrideRouteOnly);
  const handlePridePress = () => {
    haptics.medium();
    setPrideRouteOnly(true);
    setTimeout(hideLanding, 60);
  };

  /**
   * Tapping a card ONLY selects the terrace. The detail sheet (a later
   * sibling in index.tsx) renders ABOVE the Home overlay, so it opens
   * over Home — the user closes the detail to return to Home.
   * We intentionally do NOT call hideLanding() here.
   */
  const handleCardPress = (terraceId: number) => {
    haptics.light();
    select(terraceId);
  };

  /** Open the "My sun summer" stats sheet — renders over Home. */
  const openSunStats = useSunStatsStore((s) => s.open);
  const handleStatsPress = () => {
    haptics.light();
    openSunStats();
  };

  // Animation drivers.
  // When the intro has already played this session (introPlayed === true),
  // initialise all values at their final state so Home appears instantly
  // on return — no re-animation. On first launch they start at 0/hidden.
  const containerOpacity = useSharedValue(1);
  const sunScale = useSharedValue(introPlayed ? 1 : 0);
  const titleOpacity = useSharedValue(introPlayed ? 1 : 0);
  const titleTranslateY = useSharedValue(introPlayed ? 0 : 8);
  const taglineOpacity = useSharedValue(introPlayed ? 1 : 0);
  const taglineTranslateY = useSharedValue(introPlayed ? 0 : 6);
  const cardsOpacity = useSharedValue(introPlayed ? 1 : 0);
  const cardsTranslateY = useSharedValue(introPlayed ? 0 : 14);
  // The "See all terraces" CTA is a pinned footer that MUST be tappable the
  // instant the screen appears. We deliberately do NOT animate its opacity:
  // on iOS — especially under the New Architecture — a view at opacity 0 is
  // skipped in touch hit-testing, so fading it in from 0 left the button dead
  // until a later re-render committed a non-zero opacity. Rendering it at full
  // opacity from the first frame keeps it interactive immediately.

  // Reset opacity when returning to Home (e.g. via home button after navigating away).
  // After the intro plays, this effect keeps Home visible on re-entry.
  useEffect(() => {
    containerOpacity.value = 1;
  }, []);

  useEffect(() => {
    // If the intro has already played this session, all shared values were
    // initialised at their final state above — nothing to animate.
    if (introPlayed) return;

    sunScale.value = withDelay(
      80,
      withSequence(
        withTiming(1.08, { duration: 280, easing: Easing.out(Easing.back(1.6)) }),
        withTiming(1.0, { duration: 140, easing: Easing.inOut(Easing.quad) }),
      ),
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
    // Cards (featured + regional) fade in as a group.
    cardsOpacity.value = withDelay(
      1100,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
    cardsTranslateY.value = withDelay(
      1100,
      withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }),
    );
    // Mark intro as played after the last entrance animation fires (cards at
    // 1100ms + 480ms ≈ 1580ms). setTimeout fires on the JS thread — just needs
    // to be after the animations complete so re-opens never replay the
    // sequence. (The CTA footer is intentionally not animated — see note above.)
    const timer = setTimeout(markIntroPlayed, 2100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    haptics.medium();
    containerOpacity.value = withTiming(
      0,
      { duration: 280, easing: Easing.in(Easing.quad) },
    );
    setTimeout(hideLanding, 280);
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

  // Bottom safe-area padding so the last content row clears the home
  // indicator + the pinned CTA footer that sits above it.
  const scrollBottomPad = insets.bottom + CTA_FOOTER_HEIGHT + spacing.lg;

  return (
    // Full-screen overlay — sits above ZonnieMap + MainSheet but BELOW
    // TerraceDetailSheet (which is a later sibling in index.tsx).
    <Animated.View style={[styles.container, containerStyle]}>
      {/* ONE outer vertical ScrollView wrapping ALL content so the brand
          header scrolls away with the cards — nothing is pinned inside. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          // Top padding accounts for the status bar / notch area.
          { paddingTop: insets.top + spacing.xl, paddingBottom: scrollBottomPad },
        ]}
      >
        {/* Brand block: sun + title + tagline — scrolls with content */}
        <Animated.View style={styles.brandBlock}>
          <Animated.View style={[styles.brandIconWrap, sunCoreStyle]}>
            <Image
              source={require('../../assets/images/splash-icon.png')}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
          <Animated.Text style={[styles.title, titleStyle]}>Zonnie</Animated.Text>
          <Animated.Text style={[styles.tagline, taglineStyle]}>
            {t.tagline}
          </Animated.Text>
        </Animated.View>

        {/* Card stack: today's verdict + seasonal banner + top list.
            All fade/slide together as one group. */}
        <Animated.View style={[styles.cardStack, cardsStyle]}>
          {/* ── Sun's out moment — celebratory banner on a top terrace day,
                once per day; renders nothing otherwise. Sits above everything. ── */}
          <SunsOutBanner />

          {/* ── Today's Verdict — daily-habit anchor, always first ────────── */}
          <TodaysVerdict />

          {/* ── World Cup 2026 — date-gated; both blocks vanish after 2026-07-19 ── */}

          {/* Match-day banner: slim high-contrast strip shown only when a NL
              match is today, or when tonight is the evening before a late-night
              kickoff (Tunisia 01:00). Sits ABOVE the spotlight card. */}
          {wcMatch !== null ? (
            <Pressable
              onPress={handleWcPress}
              style={({ pressed }) => [
                styles.wcBanner,
                pressed && styles.wcBannerPressed,
              ]}
              accessibilityLabel={
                wcMatch.kickoffHour < 6
                  ? t.wcBannerLateNight(wcMatch.opponentFlag, wcMatch.opponent, wcMatch.kickoffLabel)
                  : t.wcBannerEvening(wcMatch.opponentFlag, wcMatch.opponent, wcMatch.kickoffLabel)
              }
            >
              <Text style={styles.wcBannerText} numberOfLines={2}>
                {wcMatch.kickoffHour < 6
                  ? t.wcBannerLateNight(wcMatch.opponentFlag, wcMatch.opponent, wcMatch.kickoffLabel)
                  : t.wcBannerEvening(wcMatch.opponentFlag, wcMatch.opponent, wcMatch.kickoffLabel)}
              </Text>
            </Pressable>
          ) : null}

          {/* Spotlight — one slim line during the window (was a full card;
              compressed 2026-07-09 in the first-launch simplification). */}
          {wcLive ? (
            <Pressable
              onPress={handleWcPress}
              style={({ pressed }) => [
                styles.wcBanner,
                pressed && styles.wcBannerPressed,
              ]}
              accessibilityLabel={t.wcSpotlightCta}
            >
              <Text style={styles.wcBannerText} numberOfLines={2}>
                {t.wcSpotlightTitle} · {t.wcSpotlightBody(SCREEN_TERRACE_COUNT)} →
              </Text>
            </Pressable>
          ) : null}

          {/* WorldPride spotlight — 25 Jul–8 Aug 2026, auto-retires after.
              Reuses the WC card's visual family (same styles) so seasonal
              moments read as one recurring format. */}
          {prideLive ? (
            <Pressable
              onPress={handlePridePress}
              style={({ pressed }) => [
                styles.wcBanner,
                pressed && styles.wcBannerPressed,
              ]}
              accessibilityLabel={t.prideSpotlightCta}
            >
              <Text style={styles.wcBannerText} numberOfLines={2}>
                {t.prideSpotlightTitle} · {t.prideSpotlightBody(PARADE_TERRACE_COUNT)} →
              </Text>
            </Pressable>
          ) : null}

          {/* ── Featured carousel ─────────────────────────────────────────
              Only rendered when there are featured terraces in the dataset.
              Horizontal scroll bleeds to the screen edges by using negative
              horizontal margins to escape the container's paddingHorizontal. */}
          {featuredTerraces.length > 0 && (
            <View style={styles.featuredSection}>
              <Text style={styles.sectionLabel}>{t.featuredSection}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled={true}
                style={styles.featuredScroll}
                contentContainerStyle={styles.featuredScrollContent}
              >
                {featuredTerraces.map((v) => (
                  <FeaturedCard key={v.terrace.id} venue={v} onPress={handleCardPress} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Sunniest now — one flat citywide top list ───────────────── */}
          <Text style={styles.sectionLabel}>{pastSunset ? t.sunniestTomorrow : t.sunniestNow}</Text>
          {topVenues.map((v) => (
            <VenueCard key={v.terrace.id} venue={v} onPress={handleCardPress} />
          ))}

          {/* My sun summer — personal stats sheet (Phase A community).
              Below the fold on purpose: a return-visit hook, not first-launch
              furniture. */}
          <Pressable
            onPress={handleStatsPress}
            style={({ pressed }) => [styles.statsPill, pressed && styles.statsPillPressed]}
            accessibilityRole="button"
            accessibilityLabel={t.sunStatsEntry}
          >
            <Text style={styles.statsPillText}>{t.sunStatsEntry} →</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Pinned CTA footer — always visible over the scrollable content.
          Sits at the physical bottom of the screen above the home indicator.
          Using position:absolute so it overlays the scroll area without
          shrinking the scroll viewport. */}
      <Animated.View
        style={[
          styles.buttonWrap,
          { bottom: insets.bottom + spacing.md },
        ]}
      >
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          accessibilityLabel={t.seeAllTerraces}
        >
          <Text style={styles.buttonText}>{t.seeAllTerraces}</Text>
        </Pressable>
      </Animated.View>

      {/* Settings cog — top-right, inset-aware so it clears the status bar.
          Language is the only setting for now; opens the language modal. */}
      <Pressable
        onPress={() => {
          haptics.selection();
          setLangModalVisible(true);
        }}
        style={[styles.cogButton, { top: insets.top + spacing.sm }]}
        accessibilityLabel={lang === 'nl' ? t.switchToEnglish : t.switchToDutch}
        hitSlop={12}
      >
        <Text style={styles.cogGlyph}>⚙</Text>
      </Pressable>

      {/* Language chooser modal — minimal flag-card picker, same style as
          onboarding so the interaction feels consistent. */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLangModalVisible(false)}
        >
          {/* Stop propagation so tapping the sheet doesn't dismiss it */}
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {lang === 'nl' ? 'Taal / Language' : 'Language / Taal'}
            </Text>
            <View style={styles.langPickerRow}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setLang('en');
                  setLangModalVisible(false);
                }}
                style={({ pressed }) => [
                  styles.langCard,
                  lang === 'en' && styles.langCardSelected,
                  pressed && styles.langCardPressed,
                ]}
                accessibilityLabel="English"
              >
                <Text style={styles.langFlag}>🇬🇧</Text>
                <Text style={styles.langLabel}>English</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setLang('nl');
                  setLangModalVisible(false);
                }}
                style={({ pressed }) => [
                  styles.langCard,
                  lang === 'nl' && styles.langCardSelected,
                  pressed && styles.langCardPressed,
                ]}
                accessibilityLabel="Nederlands"
              >
                <Text style={styles.langFlag}>🇳🇱</Text>
                <Text style={styles.langLabel}>Nederlands</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

// ─── FeaturedCard ─────────────────────────────────────────────────────────────

interface FeaturedCardProps {
  venue: FeaturedVenue;
  onPress: (terraceId: number) => void;
}

/**
 * Landscape photo card for the featured carousel.
 *
 * Layout (all absolutely positioned layers inside a fixed-size Pressable):
 *   1. Photo (Image, cover) — or peach placeholder when photoUrl absent
 *   2. Bottom overlay — dark semi-transparent block with name + area
 *   3. Score badge — top-right corner, scoreToColor background
 *   4. Featured pill — top-left corner, burnt background
 */
function FeaturedCard({ venue, onPress }: FeaturedCardProps) {
  const t = useStrings();
  const { terrace, score } = venue;
  const pct = Math.round(score * 100);
  const scoreColor = scoreToColor(score);

  return (
    <Pressable
      onPress={() => onPress(terrace.id)}
      style={({ pressed }) => [
        styles.featuredCard,
        pressed && styles.featuredCardPressed,
      ]}
      accessibilityLabel={`Open ${terrace.name}, ${pct}% sun`}
    >
      {/* Photo or warm placeholder */}
      {terrace.photoUrl ? (
        <Image
          source={{ uri: terrace.photoUrl }}
          style={styles.featuredCardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.featuredCardPlaceholder} />
      )}

      {/* Bottom text overlay */}
      <View style={styles.featuredCardOverlay}>
        <Text style={styles.featuredCardName} numberOfLines={1}>
          {terrace.name}
        </Text>
        <Text style={styles.featuredCardArea} numberOfLines={1}>
          {terrace.area}
        </Text>
      </View>

      {/* Score badge — top right */}
      <View style={[styles.featuredScoreBadge, { backgroundColor: scoreColor }]}>
        <Text style={styles.featuredScoreText}>{pct}</Text>
      </View>

      {/* Featured pill — top left */}
      <View style={styles.featuredLabel}>
        <Text style={styles.featuredLabelText}>{t.featured}</Text>
      </View>
    </Pressable>
  );
}

// ─── VenueCard ────────────────────────────────────────────────────────────────

interface VenueCardProps {
  venue: TopVenue;
  onPress: (terraceId: number) => void;
}

/**
 * Compact landing-page card. One row: name on the left (with optional
 * featured badge inline), area subtitle below, score chip on the right.
 */
function VenueCard({ venue, onPress }: VenueCardProps) {
  const t = useStrings();
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
              <Text style={styles.featuredBadgeText}>{t.featured}</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // Full-screen overlay sitting above map + MainSheet but below
    // TerraceDetailSheet (controlled by render order in index.tsx).
    // No zIndex/elevation here — sibling document order gives the correct
    // stack: detail sheet (later sibling) paints over Home naturally.
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.sand,
  },
  // Outer scroll's contentContainer: horizontal padding lives here so
  // the featured carousel negative-margin trick still works correctly.
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  brandIconWrap: {
    borderRadius: BRAND_ICON_SIZE * 0.2,
    // Soft shadow lifts the mark off the sand background.
    shadowColor: palette.cocoa,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  brandIcon: {
    width: BRAND_ICON_SIZE,
    height: BRAND_ICON_SIZE,
    borderRadius: BRAND_ICON_SIZE * 0.2,
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

  // ── Featured carousel ──────────────────────────────────────────────
  featuredSection: {
    marginBottom: spacing.md,
  },
  // Negative horizontal margin escapes the container's paddingHorizontal
  // so cards bleed to screen edges; paddingHorizontal restores the leading
  // indent so the first card starts flush with the rest of the UI.
  featuredScroll: {
    marginHorizontal: -spacing.lg,
  },
  featuredScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  featuredCard: {
    width: FEATURED_CARD_W,
    height: FEATURED_CARD_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: palette.peach,
    // Subtle shadow so the card lifts off the sand background
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  featuredCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  featuredCardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  // Warm peach→burnt gradient placeholder when no photoUrl is set.
  featuredCardPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.peach,
  },
  // Dark overlay at the bottom ~45% of the card.
  featuredCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  featuredCardName: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.sm,
    color: palette.cream,
    letterSpacing: -0.1,
  },
  featuredCardArea: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 1,
  },
  // Score pill — top-right corner
  featuredScoreBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  featuredScoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xs,
    color: palette.white,
  },
  // "Featured / Uitgelicht" pill — top-left corner
  featuredLabel: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
  },
  featuredLabelText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 8,
    color: palette.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // My sun summer entry — quiet pill under the top list.
  statsPill: {
    alignSelf: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.mist,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  statsPillPressed: {
    opacity: 0.7,
  },
  statsPillText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cocoa,
  },

  // ── Venue list cards ───────────────────────────────────────────────
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

  // ── CTA footer — pinned over the scroll area ───────────────────────
  buttonWrap: {
    // Absolute so it overlays the scroll without collapsing the scroll
    // viewport — the scrollContent paddingBottom accounts for its height.
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    // `bottom` is set dynamically in JSX (insets.bottom + spacing.md)
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

  // ── World Cup 2026 ─────────────────────────────────────────────────

  // Slim high-contrast matchday banner above the spotlight card.
  wcBanner: {
    backgroundColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: palette.burnt,
  },
  wcBannerPressed: {
    opacity: 0.82,
  },
  wcBannerText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
    lineHeight: 18,
  },

  // Warm terracotta/burnt spotlight card.
  wcCard: {
    backgroundColor: palette.burnt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    shadowColor: palette.cocoa,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  wcCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  wcCardTitle: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.cream,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  wcCardBody: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: 'rgba(255,229,194,0.85)',
    marginBottom: spacing.sm,
  },
  wcCardCta: {
    alignSelf: 'flex-start',
    backgroundColor: palette.cream,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  wcCardCtaText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.burnt,
  },

  // ── Settings cog button (top-right, absolute) ──────────────────────
  cogButton: {
    // `top` is set dynamically in JSX (insets.top + spacing.sm)
    position: 'absolute',
    right: spacing.lg,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cogGlyph: {
    // Monochrome text glyph — consistent with the app's glyph style.
    // inkSoft keeps it unobtrusive against the sand background.
    fontFamily: fonts.body,
    fontSize: 22,
    color: palette.inkSoft,
  },

  // ── Language chooser modal ─────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42, 31, 21, 0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    width: '100%',
    backgroundColor: palette.sand,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.ink,
    textAlign: 'center',
    marginBottom: spacing.lg,
    letterSpacing: -0.3,
  },
  langPickerRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  langCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: palette.sandDeep,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langCardSelected: {
    borderColor: palette.burnt,
    backgroundColor: palette.cream,
  },
  langCardPressed: {
    opacity: 0.8,
  },
  langFlag: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  langLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.ink,
  },
});
