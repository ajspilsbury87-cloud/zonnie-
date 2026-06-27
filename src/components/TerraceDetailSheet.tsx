/**
 * Bottom sheet showing the detail of a single terrace.
 *
 * Mounts when `useSelectionStore.selectedId` is set, unmounts when
 * cleared. Uses a plain Gorhom `BottomSheet` (not `BottomSheetModal`)
 * with conditional render — Gorhom v5's modal portal silently failed
 * to present on Andy's iOS TestFlight build. Inline render avoids
 * the portal entirely; the sheet visually overlays the persistent
 * MainSheet because it's rendered later in the tree (drawn on top
 * by RN's default z-order).
 *
 * Contents:
 *   - Header: name, area · facing · capacity, current sun-score chip
 *   - Google Places card (rating · price · today's hours · open/closed)
 *     when the terrace has a `placeId` and the API key is configured.
 *     Falls back gracefully when missing.
 *   - SunTimeline (24h score bars, in-range hours highlighted)
 *   - Address + vibe
 *   - Actions: Show on Map · Open in Google Maps (with directions)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsViewUrl,
  buildPhotoUrl,
  priceLevelToDollars,
  type PlaceDetails,
} from '@/src/data/places';
import { SunTimeline } from '@/src/components/SunTimeline';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { getTreesForTerrace } from '@/src/data/trees';
import { formatInTimeZone } from 'date-fns-tz';

import {
  AMSTERDAM_TZ,
  computeRangeScore,
  computeSunScore,
  findBestWindow,
} from '@/src/engines/scoring';
import { sundownerMinutes } from '@/src/engines/golden';
import { findNextSunnySpot, ORIGIN_HORIZON_MIN } from '@/src/engines/handoff';
import { bandForScore } from '@/src/engines/bands';
import { wcViewingForTerrace } from '@/src/data/worldcupVenues';
import { useSelectionStore } from '@/src/store/selectionStore';
import { selectedDateStr, todayAmsterdamDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { usePlacesStore } from '@/src/store/placesStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { usePurchaseStore } from '@/src/store/purchaseStore';
import { useProPaywallStore } from '@/src/components/ProPaywall';
import { haptics } from '@/src/lib/haptics';
import { shareTerraceCard } from '@/src/lib/shareCard';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  scoreToColor,
  spacing,
} from '@/src/theme/tokens';
import { useStrings } from '@/src/i18n/useStrings';
import { useLanguageStore } from '@/src/store/languageStore';
import { useSunLogStore } from '@/src/store/sunLogStore';

// ─── WCSection ────────────────────────────────────────────────────────────────

import type { WCViewingInfo } from '@/src/data/worldcupVenues';
import type { Strings } from '@/src/i18n/strings';

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

const CAPACITY_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

export function TerraceDetailSheet() {
  const t = useStrings();
  // Uses bandForScore (bands.ts) so thresholds are never duplicated here.
  const getScoreLabel = (s: number): string => {
    switch (bandForScore(s)) {
      case 'full':    return t.scoreFull;
      case 'mostly':  return t.scoreMostly;
      case 'partial': return t.scorePartly;
      case 'mshade':  return t.scoreMostlyShade;
      default:        return t.scoreShade;
    }
  };
  const ref = useRef<BottomSheet>(null);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const clear = useSelectionStore((s) => s.clear);
  const selectTerrace = useSelectionStore((s) => s.select);
  const isPro = usePurchaseStore((s) => s.isPro);
  const showPaywall = useProPaywallStore((s) => s.show);
  const setPanTo = useSelectionStore((s) => s.setPanTo);
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const placesByPlaceId = usePlacesStore((s) => s.byPlaceId);
  const ensurePlace = usePlacesStore((s) => s.ensure);
  const isFavorite = useFavoritesStore((s) => (selectedId != null ? s.favoriteIds.has(selectedId) : false));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const lang = useLanguageStore((s) => s.lang);

  const terrace = useMemo(() => {
    if (selectedId == null) return null;
    return TERRACES.find((t) => t.id === selectedId) ?? null;
  }, [selectedId]);

  // Trigger Places fetch whenever a terrace with a placeId is opened.
  // Previously gated on isPro, but opening hours are now free for all
  // users — so we always fetch. Photos and contact details are still
  // Pro-only at the display level; the fetch cost is bounded by the
  // 7-day per-device cache in placesStore regardless of Pro status.
  useEffect(() => {
    if (terrace?.placeId) ensurePlace(terrace.placeId);
  }, [terrace, ensurePlace]);

  // Imperative open/close. The `index` prop in Gorhom v5 only drives
  // INITIAL mount; later prop changes don't reliably animate the sheet
  // — Andy hit this when "Show on Map" called clear() but the sheet
  // stayed open. Drive the actual snap state imperatively here so
  // every selectedId change (open AND close) animates.
  useEffect(() => {
    if (selectedId != null) {
      ref.current?.snapToIndex(0);
      // Sun Log: record that the user opened this terrace's detail sheet.
      // `score` is 0 here on first render (computed below), so we read it
      // via getState() to avoid a stale-closure; it will be 0 until the
      // score memo resolves, which is fine — the terraceId is the key datum.
      useSunLogStore.getState().log({
        ts: Date.now(),
        terraceId: selectedId,
        action: 'open',
      });
    } else {
      ref.current?.close();
    }
  }, [selectedId]);

  const placeEntry = terrace?.placeId ? placesByPlaceId[terrace.placeId] : undefined;
  const placeDetails = placeEntry?.status === 'ready' ? placeEntry.data : undefined;

  const score = useMemo(() => {
    if (!terrace) return 0;
    const buildings = getBuildingsForTerrace(terrace.id);
    const trees = getTreesForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return computeRangeScore(
      terrace,
      fromHour,
      toHour,
      dateStr,
      weatherProfile,
      hourlyWeather,
      buildings,
      trees,
    );
  }, [terrace, dateOffset, fromHour, toHour, weatherProfile, weatherByDate]);

  /**
   * Trend at the start of the visit window: was sun rising, holding,
   * or falling vs an hour ago? Helps users decide between two terraces
   * with the same average — pick the rising one.
   */
  const sunTrend = useMemo(() => {
    if (!terrace) return null as 'rising' | 'holding' | 'falling' | null;
    const buildings = getBuildingsForTerrace(terrace.id);
    const trees = getTreesForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    const here = computeSunScore(
      terrace,
      fromHour,
      dateStr,
      weatherProfile,
      hourlyWeather?.[fromHour],
      buildings,
      trees,
    ).score;
    const prevHour = Math.max(0, fromHour - 1);
    const before = computeSunScore(
      terrace,
      prevHour,
      dateStr,
      weatherProfile,
      hourlyWeather?.[prevHour],
      buildings,
      trees,
    ).score;
    const delta = here - before;
    if (delta > 0.05) return 'rising';
    if (delta < -0.05) return 'falling';
    return 'holding';
  }, [terrace, dateOffset, fromHour, weatherProfile, weatherByDate]);

  /**
   * Wind summary for the visit window — speed (avg) and direction
   * label. Drives the small chip below the timeline.
   */
  const windSummary = useMemo(() => {
    if (!terrace) return null as { avgKmh: number; direction: string } | null;
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (entry?.status !== 'ready') return null;
    const data = entry.data;
    if (!data) return null;
    let speedSum = 0;
    let dirSum = 0;
    let count = 0;
    for (let h = fromHour; h <= toHour; h++) {
      const w = data[h];
      if (w?.windSpeed != null && w.windDirection != null) {
        speedSum += w.windSpeed;
        dirSum += w.windDirection;
        count++;
      }
    }
    if (count === 0) return null;
    const avgKmh = Math.round(speedSum / count);
    const avgDir = (dirSum / count) % 360;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(avgDir / 45) % 8;
    const direction = directions[idx] ?? 'N';
    return { avgKmh, direction };
  }, [terrace, dateOffset, fromHour, toHour, weatherByDate]);

  /**
   * Daytime maximum precipitation probability for the selected date.
   *
   * We scan hours 9–21 (inclusive) — the realistic window when someone
   * would be sitting outside. Taking the MAX rather than an average is
   * deliberate: if one hour in the afternoon has 70% rain probability,
   * telling the user "average 30%" would be misleading. The worst-case
   * hour is the honest signal for "might it rain on me?"
   *
   * Returns undefined when data is missing (older cache without the
   * field), so the chip is completely hidden rather than showing "0%"
   * when we simply don't know.
   */
  const precipChance = useMemo((): number | undefined => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    if (entry?.status !== 'ready') return undefined;
    const data = entry.data;
    if (!data) return undefined;
    // Check hours 9–21 for daytime coverage.
    let max: number | undefined;
    for (let h = 9; h <= 21; h++) {
      const p = data[h]?.precipProbability;
      if (p != null) {
        max = max == null ? p : Math.max(max, p);
      }
    }
    return max;
  }, [dateOffset, weatherByDate]);

  /**
   * Curation trust signal. Surfaces our quality moat over Sun Seekr /
   * Coffee in the Sun (stale POI scrapes) and Seats in the Sun (often-
   * closed crowdsourced listings).
   *
   * Earlier this rendered as "Verified N days/weeks/months ago" off
   * `terrace.verifiedAt`. Andy: that read as if we'd physically
   * inspected the venue on that date, which isn't true — `verifiedAt`
   * is just the timestamp of the last data-import or curation-script
   * pass. Replaced with a simple "Curated by Zonnie" string so the
   * trust signal lands without implying a recent on-site visit.
   */
  const curationLabel = useMemo(() => {
    if (!terrace || !terrace.verified) return null;
    return t.curatedByZonnie;
  }, [terrace, t]);

  /**
   * World Cup viewing info for this terrace (tournament window only).
   * wcViewingForTerrace is pure and cheap; wrapping in useMemo keeps renders
   * consistent with the rest of the memo pattern in this component.
   */
  const wcViewing = useMemo(() => {
    if (!terrace) return null;
    return wcViewingForTerrace(
      terrace.id,
      terrace.outdoorScreens ?? 0,
      todayAmsterdamDateStr(),
    );
  }, [terrace]);

  const rangeLabel = useMemo(() => {
    const f = fromHour.toString().padStart(2, '0');
    const toStr = toHour.toString().padStart(2, '0');
    return fromHour === toHour ? `${f}:00` : `${f}:00 – ${toStr}:00`;
  }, [fromHour, toHour]);

  /**
   * Best 2-hour sunny window for this terrace today.
   *
   * Computed from the same 24-hour hourly scores used by SunTimeline so
   * the number always matches what the chart shows. We use a 2-hour
   * window because that's a natural terrace visit duration — enough to
   * eat, have a drink, and not feel rushed. The result powers the
   * "Best time to visit" banner below the timeline.
   *
   * Returns null when no 2-hour window clears the 'partial' band floor
   * (0.41 — see findBestWindow default / bands.ts) —
   * e.g. a north-facing terrace on an overcast day. In that case the
   * banner is hidden entirely.
   */
  const hourlyScores = useMemo(() => {
    if (!terrace) return null;
    const buildings = getBuildingsForTerrace(terrace.id);
    const trees = getTreesForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    // Compute the full 24-hour score array (same as SunTimeline does internally).
    return Array.from({ length: 24 }, (_, h) =>
      computeSunScore(
        terrace,
        h,
        dateStr,
        weatherProfile,
        hourlyWeather?.[h],
        buildings,
        trees,
      ).score,
    );
  }, [terrace, dateOffset, weatherProfile, weatherByDate]);

  const bestWindow = useMemo(
    () => (hourlyScores ? findBestWindow(hourlyScores) : null),
    [hourlyScores],
  );

  /**
   * Sundowner countdown — minutes until the sun leaves this terrace,
   * shown only for TODAY and only when the drop is ≤ 90 min away.
   * "Now" is read once per render; the sheet re-renders on open and on
   * any store change, which keeps the number fresh enough for a pill
   * whose resolution is minutes.
   */
  const sundownerMin = useMemo(() => {
    if (!hourlyScores || dateOffset !== 0) return null;
    const now = new Date();
    const nowHour =
      parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'HH'), 10) +
      parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'mm'), 10) / 60;
    return sundownerMinutes(hourlyScores, nowHour);
  }, [hourlyScores, dateOffset]);

  /**
   * "Next sunny spot" hand-off suggestion.
   *
   * Conditions to show:
   *   1. Today only (dateOffset === 0) — "in N min" is only meaningful now.
   *   2. Origin terrace is currently sunny (score at current hour ≥ 0.5).
   *   3. Sun leaves within ORIGIN_HORIZON_MIN (2 hours) — enough urgency.
   *   4. findNextSunnySpot finds a qualifying candidate within 500 m.
   *
   * Keyed on terrace/date/weather exactly like the other score memos.
   * Note: this runs on today only, so it reads the real wall-clock hour
   * from inside the memo to gate condition 2 and 3 — same pattern as
   * sundownerMin above.
   */
  const handoffResult = useMemo(() => {
    // Only show for today's date — hand-off is a "right now" feature.
    if (!terrace || !hourlyScores || dateOffset !== 0) return null;

    const now = new Date();
    const nowHour =
      parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'HH'), 10) +
      parseInt(formatInTimeZone(now, AMSTERDAM_TZ, 'mm'), 10) / 60;

    // Gate 1: origin must currently have sun (score ≥ 0.5 at current hour).
    const currentScore = hourlyScores[Math.floor(nowHour)] ?? 0;
    if (currentScore < 0.5) return null;

    // Gate 2: sun must be leaving within ORIGIN_HORIZON_MIN.
    // We find the last hour the origin is sunny and compute minutes until
    // it goes dark.
    let lastSunnyHour = -1;
    for (let h = Math.floor(nowHour); h <= 23; h++) {
      if ((hourlyScores[h] ?? 0) >= 0.5) lastSunnyHour = h;
      else break;
    }
    if (lastSunnyHour < 0) return null;
    // handoffHour is the first "dark" hour: lastSunnyHour+1.
    // Minutes until it goes dark = ((lastSunnyHour + 1) - nowHour) * 60.
    const minutesUntilDark = ((lastSunnyHour + 1) - nowHour) * 60;
    if (minutesUntilDark > ORIGIN_HORIZON_MIN) return null;

    // Gate 3: ask the engine for the best nearby still-sunny terrace.
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;

    return findNextSunnySpot(terrace, dateStr, weatherProfile, hourlyWeather);
  }, [terrace, hourlyScores, dateOffset, weatherProfile, weatherByDate]);

  const setRange = useTimeStore((s) => s.setRange);

  /** Tapping the best-window banner focuses the timeline on those hours. */
  const handleJumpToBestWindow = useCallback(() => {
    if (!bestWindow) return;
    haptics.selection();
    setRange(bestWindow.fromHour, bestWindow.toHour);
  }, [bestWindow, setRange]);

  /**
   * Share button handler — fires the native share sheet with a pre-composed
   * message. Prefers the best window time (most impressive / most useful to
   * the recipient); falls back to the current visit window.
   */
  const handleShare = useCallback(() => {
    if (!terrace) return;
    haptics.light();
    const shareFrom = bestWindow?.fromHour ?? fromHour;
    const shareTo   = bestWindow?.toHour   ?? toHour;
    const shareScore = bestWindow?.avgScore ?? score;
    // Sun Log: record the share before the async sheet opens so we don't
    // lose it if the user dismisses without picking a destination.
    useSunLogStore.getState().log({
      ts: Date.now(),
      terraceId: terrace.id,
      action: 'share',
      score: shareScore,
    });
    shareTerraceCard({
      name:     terrace.name,
      area:     terrace.area,
      score:    shareScore,
      fromHour: shareFrom,
      toHour:   shareTo,
    }).catch(() => {
      // Share.share rejects if the user dismisses without choosing a
      // destination on some Android versions — swallow silently.
    });
  }, [terrace, bestWindow, fromHour, toHour, score]);

  /**
   * Tapping the hand-off suggestion opens that terrace in the detail sheet.
   * We use `selectTerrace` (from useSelectionStore) which replaces the
   * current selectedId — Gorhom will snap to the new terrace's sheet.
   */
  const handleHandoffPress = useCallback(() => {
    if (!handoffResult) return;
    haptics.selection();
    selectTerrace(handoffResult.terrace.id);
  }, [handoffResult, selectTerrace]);

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

  /** Open Google Maps with turn-by-turn directions to this terrace. */
  const handleNavigate = useCallback(() => {
    if (!terrace) return;
    haptics.medium();
    // Sun Log: directions is a strong intent signal — user is actually going.
    useSunLogStore.getState().log({
      ts: Date.now(),
      terraceId: terrace.id,
      action: 'directions',
      score,
    });
    const url = buildGoogleMapsNavigationUrl({
      lat: terrace.lat,
      lng: terrace.lng,
      placeId: terrace.placeId,
      name: terrace.name,
    });
    Linking.openURL(url).catch(() => {
      // Universal-link fallback — Google Maps' web URL deep-links into the
      // native app on iOS/Android when installed.
      Linking.openURL(`https://maps.google.com/?q=${terrace.lat},${terrace.lng}`);
    });
  }, [terrace, score]);

  /** Open the place's Google Maps page (no navigation — for browsing reviews/photos). */
  const handleViewInGoogleMaps = useCallback(() => {
    if (!terrace) return;
    haptics.light();
    const url =
      placeDetails?.googleMapsUrl ??
      buildGoogleMapsViewUrl({
        lat: terrace.lat,
        lng: terrace.lng,
        placeId: terrace.placeId,
        name: terrace.name,
      });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${terrace.lat},${terrace.lng}`);
    });
  }, [terrace, placeDetails]);

  const handleShowOnMap = useCallback(() => {
    if (!terrace) return;
    haptics.light();
    setPanTo({ lat: terrace.lat, lng: terrace.lng });
    clear();
  }, [terrace, setPanTo, clear]);

  /**
   * Open the venue's table-reservation page. Premium feature: free users
   * hit the paywall instead (same gate as favourites). While Pro is
   * unlocked (FEATURES_UNLOCKED) isPro is always true, so this opens the
   * link for everyone today and re-gates with the one-line lever later.
   * Only ever called when `terrace.reservationUrl` is set (the button
   * that calls it is conditionally rendered on the same field).
   */
  const handleReserve = useCallback(() => {
    if (!terrace?.reservationUrl) return;
    if (!isPro) {
      showPaywall('reservations');
      return;
    }
    haptics.medium();
    Linking.openURL(terrace.reservationUrl).catch(() => {
      // Swallow — an unopenable URL shouldn't crash the sheet. Same
      // posture as the WC source link and ProPaywall legal links.
    });
  }, [terrace, isPro, showPaywall]);

  // Drive open/close via the controlled `index` prop, not by mounting/
  // unmounting the BottomSheet. Conditionally mounting (return null when
  // no selection) didn't trigger Gorhom v5's initial layout pass on
  // iOS — the sheet rendered but never animated in. Always-mounted +
  // index swap is the canonical Gorhom pattern, and it matches what
  // MainSheet does (which works fine).
  //   index = -1 → closed (sheet off-screen below)
  //   index =  0 → open at first snap point (70%)
  const sheetIndex = selectedId != null ? 0 : -1;

  // Bottom inset so the last detail section clears the home indicator when
  // the content scrolls (the sheet content was previously not scrollable).
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet
      ref={ref}
      index={sheetIndex}
      snapPoints={['70%', '92%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={clear}
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
        {terrace ? (
          <>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={3}>
                  {terrace.name}
                </Text>
                <Text style={styles.subtitle}>
                  {terrace.area} · {FACING_LABELS[terrace.facing] ?? terrace.facing} ·{' '}
                  {CAPACITY_LABELS[terrace.capacity] ?? terrace.capacity}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!terrace) return;
                  const result = toggleFavorite(terrace.id);
                  if (result === 'paywall') {
                    // Free-tier limit reached — open paywall instead of
                    // adding. No haptic: the tap failed silently before
                    // the sheet animates up, which feels natural.
                    showPaywall('favourites');
                    return;
                  }
                  // Success haptic when adding; lighter tick when removing.
                  if (result === 'removed') haptics.selection();
                  else {
                    haptics.success();
                    // Sun Log: record the add (not the remove — we only want
                    // positive signals for future "favourite" insights).
                    useSunLogStore.getState().log({
                      ts: Date.now(),
                      terraceId: terrace.id,
                      action: 'favorite',
                      score,
                    });
                  }
                }}
                style={({ pressed }) => [
                  styles.favoriteButton,
                  isFavorite && styles.favoriteButtonActive,
                  pressed && styles.favoriteButtonPressed,
                ]}
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.favoriteIcon,
                    isFavorite && styles.favoriteIconActive,
                  ]}
                >
                  {isFavorite ? '♥' : '♡'}
                </Text>
              </Pressable>
              <View style={[styles.scoreChip, { backgroundColor: scoreToColor(score) }]}>
                <Text style={styles.scorePct}>{Math.round(score * 100)}</Text>
                <Text style={styles.scoreUnit}>%</Text>
              </View>
            </View>

            {/* Google Places card — rating + reviews are now FREE
                (pre-imported into terraces.json so no runtime API cost).
                The card's Pro lock has shifted from rating to:
                photos, today's hours, phone, website. */}
            <PlacesCard
              loading={placeEntry?.status === 'loading'}
              hasPlaceId={!!terrace.placeId}
              details={placeDetails}
              isPro={isPro}
              staticRating={terrace.googleRating}
              staticReviewCount={terrace.googleReviewCount}
              onProLockPress={() => showPaywall('ratings')}
            />

            {/* Photo strip — for Pro users with photos loaded, shows
                the carousel. For free users, shows a locked teaser
                placeholder so the feature is discoverable. */}
            <PhotoStrip
              photoNames={placeDetails?.photoNames ?? []}
              loading={placeEntry?.status === 'loading'}
              isPro={isPro}
              hasPlaceId={!!terrace.placeId}
              onProLockPress={() => showPaywall('photos')}
            />

            <Text style={styles.sectionLabel}>{t.sunToday}</Text>
            <SunTimeline terrace={terrace} />
            <Text style={styles.scoreLabelText}>
              {rangeLabel}: <Text style={styles.scoreLabelStrong}>{getScoreLabel(score)}</Text>
            </Text>

            {/* Best-window banner — the single most actionable insight
                in the detail sheet. Answers "when should I go?" with a
                tappable card that also jumps the timeline to those hours.
                Hidden when no qualifying window exists (overcast / shaded). */}
            {bestWindow ? (
              <Pressable
                onPress={handleJumpToBestWindow}
                style={({ pressed }) => [
                  styles.bestWindowCard,
                  pressed && styles.bestWindowCardPressed,
                ]}
                accessibilityLabel={`${t.bestVisitTime}: ${bestWindow.fromHour.toString().padStart(2, '0')}:00 – ${bestWindow.toHour.toString().padStart(2, '0')}:00`}
              >
                <View style={styles.bestWindowLeft}>
                  <Text style={styles.bestWindowLabel}>{t.bestVisitTime}</Text>
                  <Text style={styles.bestWindowTime}>
                    {bestWindow.fromHour.toString().padStart(2, '0')}:00
                    {' – '}
                    {bestWindow.toHour.toString().padStart(2, '0')}:00
                  </Text>
                </View>
                <View style={[
                  styles.bestWindowScore,
                  { backgroundColor: scoreToColor(bestWindow.avgScore) },
                ]}>
                  <Text style={styles.bestWindowScoreText}>
                    {Math.round(bestWindow.avgScore * 100)}
                  </Text>
                  <Text style={styles.bestWindowScoreUnit}>%</Text>
                </View>
              </Pressable>
            ) : null}

            {/* Sundowner countdown — urgency pill when the sun leaves this
                terrace within 90 minutes (today only). The fact someone
                announces to the table. */}
            {sundownerMin != null ? (
              <View style={styles.sundownerPill}>
                <Text style={styles.sundownerText}>
                  {t.sundownerLeaves(sundownerMin)}
                </Text>
              </View>
            ) : null}

            {/* Next sunny spot hand-off — shown directly below the sundowner
                pill when: we're on today's date, the origin has sun now, sun
                leaves within 2 hours, and there's a nearby still-sunny
                terrace. Tapping selects that terrace. Hidden otherwise. */}
            {handoffResult != null ? (
              <Pressable
                onPress={handleHandoffPress}
                style={({ pressed }) => [
                  styles.handoffRow,
                  pressed && styles.handoffRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t.nextSunnySpot(
                  handoffResult.terrace.name,
                  `${handoffResult.sunnyUntilHour.toString().padStart(2, '0')}:00`,
                  handoffResult.walkMinutes,
                )}
              >
                <Text style={styles.handoffText}>
                  {t.nextSunnySpot(
                    handoffResult.terrace.name,
                    `${handoffResult.sunnyUntilHour.toString().padStart(2, '0')}:00`,
                    handoffResult.walkMinutes,
                  )}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.infoChipRow}>
              {sunTrend ? (
                <View
                  style={[
                    styles.infoChip,
                    sunTrend === 'rising' && styles.infoChipPositive,
                    sunTrend === 'falling' && styles.infoChipNegative,
                  ]}
                >
                  <Text style={styles.infoChipText}>
                    {sunTrend === 'rising'
                      ? t.sunBuilding
                      : sunTrend === 'falling'
                        ? t.sunFading
                        : t.sunHolding}
                  </Text>
                </View>
              ) : null}
              {windSummary ? (
                <View style={styles.infoChip}>
                  <Text style={styles.infoChipText}>
                    {windSummary.avgKmh >= 25
                      ? '🌬️ '
                      : windSummary.avgKmh >= 12
                        ? '💨 '
                        : ''}
                    {windSummary.avgKmh} km/h {windSummary.direction}
                  </Text>
                </View>
              ) : null}
              {/* Rain chip — hidden when precipProbability data is absent (older
                  cache). Shows 0% when genuinely zero so users know we have the
                  data; hidden only when undefined (field didn't exist in cache). */}
              {precipChance != null ? (
                <View style={styles.infoChip}>
                  <Text style={styles.infoChipText}>
                    {t.chanceOfRain(precipChance)}
                  </Text>
                </View>
              ) : null}
              {curationLabel ? (
                <View style={[styles.infoChip, styles.infoChipBrand]}>
                  <Text style={[styles.infoChipText, styles.infoChipTextBrand]}>
                    ✓ {curationLabel}
                  </Text>
                </View>
              ) : null}
              {terrace.outdoorScreens && terrace.outdoorScreens > 0 ? (
                <View style={[styles.infoChip, styles.infoChipMatch]}>
                  <Text style={[styles.infoChipText, styles.infoChipTextMatch]}>
                    📺 {terrace.outdoorScreens === 1
                      ? t.outdoorScreen
                      : t.outdoorScreens(terrace.outdoorScreens)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* World Cup section — auto-gated by isWorldCupLive inside
                wcViewingForTerrace, so it disappears after 2026-07-19
                without any follow-up release. */}
            {wcViewing !== null ? (
              <WCSection viewing={wcViewing} lang={lang} t={t} />
            ) : null}

            {terrace.vibe ? (
              <>
                <Text style={styles.sectionLabel}>{t.vibe}</Text>
                <Text style={styles.body}>{terrace.vibe}</Text>
              </>
            ) : null}

            {placeDetails?.address || terrace.address ? (
              <>
                <Text style={styles.sectionLabel}>{t.address}</Text>
                <Text style={styles.body}>
                  {placeDetails?.address ?? terrace.address}
                </Text>
              </>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleShowOnMap}
                style={({ pressed }) => [
                  styles.action,
                  styles.actionSecondary,
                  pressed && styles.actionPressed,
                ]}
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>
                  {t.showOnMap}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleViewInGoogleMaps}
                style={({ pressed }) => [
                  styles.action,
                  styles.actionSecondary,
                  pressed && styles.actionPressed,
                ]}
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>
                  {t.viewInMaps}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionShare,
                pressed && styles.actionPressed,
              ]}
              accessibilityLabel={t.share}
            >
              <Text style={styles.actionShareText}>{t.share}</Text>
            </Pressable>

            {/* Reserve-a-table CTA — only when this terrace has a verified
                reservationUrl. Burnt fill so it reads as a strong booking
                intent, distinct from the amber Get Directions primary below it. */}
            {terrace.reservationUrl ? (
              <Pressable
                onPress={handleReserve}
                style={({ pressed }) => [
                  styles.actionReserve,
                  pressed && styles.actionPressed,
                ]}
                accessibilityRole="link"
                accessibilityLabel={t.reserveTable}
              >
                <Text style={styles.actionReserveText}>🍽  {t.reserveTable}</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleNavigate}
              style={({ pressed }) => [
                styles.actionPrimary,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={styles.actionText}>{t.getDirections}</Text>
            </Pressable>
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

interface PlacesCardProps {
  loading: boolean;
  hasPlaceId: boolean;
  details: PlaceDetails | undefined;
  isPro: boolean;
  /**
   * Static rating from terraces.json (pre-imported via
   * `import-google-ratings.ts`). Shown to all users when present —
   * decouples the rating display from the Pro-gated Places fetch.
   */
  staticRating?: number;
  staticReviewCount?: number;
  /**
   * Tapped when a free user clicks a locked Pro feature (hours,
   * phone, website). Caller opens the paywall.
   */
  onProLockPress: () => void;
}

/**
 * Horizontally scrollable strip of up to 3 terrace photos from Google Places.
 *
 * Each tile is 160×120 dp — wide enough to see the terrace ambience but short
 * enough to not dominate the sheet. The strip bleeds edge-to-edge (negative
 * horizontal margin) to escape the sheet's 16 dp padding, giving images room
 * to breathe. `expo-image` handles caching, progressive decode, and the
 * loading shimmer automatically.
 *
 * Renders nothing when:
 *   - The Places fetch hasn't landed yet (loading=true)
 *   - No photos came back (photoNames is empty)
 *   - The API key is not configured (buildPhotoUrl returns null)
 */
interface PhotoStripProps {
  photoNames: string[];
  loading: boolean;
  isPro: boolean;
  hasPlaceId: boolean;
  onProLockPress: () => void;
}

function PhotoStrip({
  photoNames,
  loading,
  isPro,
  hasPlaceId,
  onProLockPress,
}: PhotoStripProps) {
  // Hook must come before any early returns — React rules of hooks.
  const t = useStrings();
  if (!hasPlaceId) return null;

  // Free user: always show the locked teaser regardless of loading state.
  // (We now fetch Places data for all users for hours, but photos stay
  // Pro-only. Show the teaser immediately — don't wait for the fetch.)
  if (!isPro) {
    return (
      <Pressable
        onPress={onProLockPress}
        style={({ pressed }) => [
          styles.photoStripLock,
          pressed && styles.photoStripLockPressed,
        ]}
        accessibilityLabel={t.photosLocked}
      >
        <Text style={styles.photoStripLockGlyph}>📷</Text>
        <Text style={styles.photoStripLockText}>{t.photosLocked}</Text>
        <Text style={styles.photoStripLockHint}>🔒</Text>
      </Pressable>
    );
  }

  // Pro user — show loading placeholder while the Places fetch is in flight.
  // Previously returned null here, leaving a blank gap after subscribing.
  if (loading) {
    return (
      <View style={styles.photoStripLoadingRow}>
        <Text style={styles.photoStripLoadingText}>📷  {t.loadingPhotos}</Text>
      </View>
    );
  }

  // Pro user but no photos available from Places — render nothing.
  if (photoNames.length === 0) return null;

  const urls = photoNames
    .map((name) => buildPhotoUrl(name))
    .filter((url): url is string => url !== null);

  if (urls.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.photoStrip}
      contentContainerStyle={styles.photoStripContent}
    >
      {urls.map((url, i) => (
        <Image
          key={i}
          source={{ uri: url }}
          style={styles.photoTile}
          contentFit="cover"
          transition={200}
          accessibilityLabel="Terrace photo"
        />
      ))}
    </ScrollView>
  );
}

/**
 * Google Places summary card.
 *
 * v1.2 paywall discovery model:
 *   - **Rating + review count: FREE for everyone.** Pulled from
 *     `terraces.json` (pre-imported via `scripts/import-google-
 *     ratings.ts`). No runtime API call, so no per-open cost.
 *     Decision-useful for everyone; the most "asked-for" signal.
 *   - **Today's hours: Pro.** Live from Places API, requires the
 *     fetch. Free users see a locked teaser "🕐 Hours · Pro".
 *   - **Phone + website: Pro.** Same reason. Free users see a
 *     locked teaser "📞 Contact · Pro".
 *
 * Price-level + open/now indicators come from the live Places fetch
 * too, so they're effectively Pro-only — shown only when `details`
 * is present (which only happens for Pro).
 */
function PlacesCard({
  loading,
  hasPlaceId,
  details,
  isPro,
  staticRating,
  staticReviewCount,
  onProLockPress,
}: PlacesCardProps) {
  // Hook must come before any early returns — React rules of hooks.
  const t = useStrings();
  if (!hasPlaceId) return null;

  // Rating: prefer live (Pro fetched it) over static, but always show
  // SOMETHING if we have either source. Free users get the static
  // rating directly — no lock here in the v1.2 model.
  const rating = details?.rating ?? staticRating;
  const reviewCount = details?.ratingCount ?? staticReviewCount;

  // Pro-only segments: price + open/now status. We now fetch for all
  // users (hours are free), but keep price/openNow behind Pro so the
  // paywall still has visible value beyond photos.
  const proSegments: string[] = [];
  if (details && isPro) {
    const price = priceLevelToDollars(details.priceLevel);
    if (price) proSegments.push(price);
    if (details.openNow != null) {
      proSegments.push(details.openNow ? t.openNow : t.closedNow);
    }
  }

  return (
    <View style={styles.placesCard}>
      {/* Top row: rating (always visible if known) + Pro-only segments */}
      <View style={styles.placesRow}>
        {rating != null ? (
          <Text style={styles.placesSummary}>
            {'★ '}{rating.toFixed(1)}
            {reviewCount ? `  (${reviewCount})` : ''}
          </Text>
        ) : null}
        {proSegments.length > 0 ? (
          <Text
            style={[
              styles.placesSummary,
              rating != null && styles.placesSummaryAfterRating,
            ]}
          >
            {(rating != null ? '  ·  ' : '') + proSegments.join('  ·  ')}
          </Text>
        ) : null}
      </View>

      {/* Hours: free for everyone — fetched for all users now. */}
      {loading ? (
        <Text style={styles.placesPlaceholder}>{t.loadingHours}</Text>
      ) : details?.todayHours ? (
        <Text style={styles.placesHours}>🕐  {details.todayHours}</Text>
      ) : (
        <Text style={styles.placesPlaceholder}>{t.hoursUnavailable}</Text>
      )}

      {/* Contact row: Pro shows phone (if present), free shows locked teaser */}
      {isPro ? (
        loading ? null : details?.phone ? (
          <Text style={styles.placesPhone}>📞  {details.phone}</Text>
        ) : null
      ) : (
        <Pressable
          onPress={onProLockPress}
          style={({ pressed }) => [
            styles.proLockRow,
            pressed && styles.proLockRowPressed,
          ]}
          accessibilityLabel={`${t.phone} · ${t.website}`}
        >
          <Text style={styles.proLockGlyph}>📞</Text>
          <Text style={styles.proLockText}>{t.phone} · {t.website}</Text>
          <Text style={styles.proLockTag}>Pro 🔒</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Short date formatter ─────────────────────────────────────────────────────

/**
 * Formats a YYYY-MM-DD string as a short weekday + day + month label,
 * localized to the current app language.
 *
 * Why manual rather than Intl.DateTimeFormat: we parse the ISO date parts
 * directly to avoid any timezone ambiguity — the dateStr is already
 * Amsterdam-local, so we treat it as a pure calendar string.
 *
 * NL example: "za 14 jun"
 * EN example: "Sat 14 Jun"
 */
function formatMatchDate(dateStr: string, lang: 'nl' | 'en'): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  // Use UTC to avoid local-TZ shift when constructing from year/month/day.
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const month = date.toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${weekday} ${d} ${month}`;
}

interface WCSectionProps {
  viewing: WCViewingInfo;
  lang: 'nl' | 'en';
  t: Strings;
}

/**
 * The "📺 World Cup" card shown in TerraceDetailSheet when the venue has
 * outdoor screens and the tournament is live.
 *
 * Design goal: matches the warm cream/peach treatment of the bestWindowCard
 * so it reads as a seasonal highlight, not a generic info block. The tier
 * drives the headline so 'likely'/'fallback' always reads as a probability,
 * never a venue-confirmed promise.
 */
function WCSection({ viewing, lang, t }: WCSectionProps) {
  // Pick the section header by certainty tier.
  const header =
    viewing.tier === 'confirmed'
      ? t.wcShowingHere
      : viewing.tier === 'likely'
        ? t.wcLikelyListed
        : t.wcBigScreen;

  // Pick the coverage body line.
  const coverageBody =
    viewing.tier === 'fallback'
      ? t.wcFallbackBody
      : viewing.coverageLabel === 'all'
        ? t.wcAllMatches
        : t.wcOranjeMatches;

  return (
    <View style={wcStyles.card}>
      {/* Section header — same uppercase label style as the rest of the sheet */}
      <Text style={wcStyles.header}>{header}</Text>

      {/* Coverage description */}
      <Text style={wcStyles.coverageLine}>{coverageBody}</Text>

      {/* extra — e.g. "incl. semi-finals & the Final (19 Jul)" */}
      {viewing.extra ? (
        <Text style={wcStyles.extraLine}>{viewing.extra}</Text>
      ) : null}

      {/* Fixture list */}
      {viewing.fixtures.map((match) => (
        <Text key={match.dateStr} style={wcStyles.fixtureLine}>
          {t.wcFixture(
            match.opponentFlag,
            match.opponent,
            formatMatchDate(match.dateStr, lang),
            match.kickoffLabel,
          )}
        </Text>
      ))}

      {/* Venue-specific note */}
      {viewing.note ? (
        <Text style={wcStyles.noteLine}>{viewing.note}</Text>
      ) : null}

      {/* Source link — tappable, opens the URL. Same pattern as
          ProPaywall legal links: openURL().catch(()=>{}) */}
      {viewing.source ? (
        <Pressable
          onPress={() => {
            // Non-null assertion is safe: the condition above guards it.
            Linking.openURL(viewing.source!).catch(() => {});
          }}
          hitSlop={8}
          accessibilityRole="link"
          style={({ pressed }) => pressed && wcStyles.sourceLinkPressed}
        >
          <Text style={wcStyles.sourceLink}>{t.wcSource} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const wcStyles = StyleSheet.create({
  // Warm cream card, matching bestWindowCard treatment.
  card: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: palette.cream,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.peach,
  },
  header: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  coverageLine: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: palette.ink,
  },
  // "incl. semi-finals & the Final" — small emphasis below the coverage line.
  extraLine: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.burnt,
    marginTop: 2,
  },
  fixtureLine: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.ink,
    marginTop: spacing.xs,
    lineHeight: fontSizes.sm * 1.4,
  },
  // Venue note — muted detail (price, ticket info, screens count).
  noteLine: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    fontStyle: 'italic',
    marginTop: spacing.xs,
    lineHeight: fontSizes.sm * 1.4,
  },
  // Source citation — subtle link in the brand colour.
  sourceLink: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: palette.burnt,
    marginTop: spacing.sm,
  },
  sourceLinkPressed: {
    opacity: 0.6,
  },
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: palette.mistDeep,
    width: 36,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: spacing.xs,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButtonActive: {
    backgroundColor: palette.burnt,
  },
  favoriteButtonPressed: {
    opacity: 0.65,
  },
  favoriteIcon: {
    fontSize: 22,
    color: palette.inkSoft,
    lineHeight: 24,
  },
  favoriteIconActive: {
    color: palette.cream,
  },
  scoreChip: {
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  scorePct: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.white,
  },
  scoreUnit: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.white,
    marginLeft: 1,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  scoreLabelText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    paddingHorizontal: spacing.lg,
  },
  scoreLabelStrong: {
    fontFamily: fonts.bodySemibold,
    color: palette.ink,
  },
  infoChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  infoChip: {
    // flexDirection + alignItems centers the text within the chip.
    // Without these, iOS's asymmetric font metrics (descent > ascent)
    // push the glyph above geometric center, which Andy reported as
    // "text near the top of the label button".
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
  },
  infoChipPositive: {
    backgroundColor: palette.cream,
  },
  infoChipNegative: {
    backgroundColor: palette.mist,
  },
  infoChipBrand: {
    backgroundColor: palette.burnt,
  },
  // Match-mode badge: distinct from the cream "verified by Zonnie" brand
  // chip so the user instantly recognises an outdoor-screen venue at a
  // glance — important for World Cup match-day scanning.
  infoChipMatch: {
    backgroundColor: palette.ink,
  },
  infoChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    // Explicit lineHeight matched ~1.3× to font size gives RN consistent
    // glyph placement across iOS/Android — without it, iOS leaves the
    // text above center (descent > ascent in the font metrics).
    lineHeight: Math.round(fontSizes.xs * 1.3),
    color: palette.inkSoft,
  },
  infoChipTextBrand: {
    color: palette.cream,
  },
  infoChipTextMatch: {
    color: palette.cream,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.ink,
    lineHeight: fontSizes.md * 1.4,
  },
  placesCard: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.sandDeep,
    borderRadius: radii.md,
  },
  placesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  placesPlaceholder: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    fontStyle: 'italic',
  },
  placesSummary: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
  },
  placesSummaryAfterRating: {
    // When shown after the rating chip the separator "  ·  " is part of
    // the string so no extra margin is needed — this style is a no-op
    // intentionally kept as a named slot for future tweaks.
  },
  // Locked rating chip — tappable, opens the paywall.
  ratingLock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.mist,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  ratingLockPressed: {
    opacity: 0.7,
  },
  ratingLockText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    lineHeight: Math.round(fontSizes.xs * 1.3),
  },
  placesHours: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  placesPhone: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  action: {
    flex: 1,
    backgroundColor: palette.amber,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  actionPrimary: {
    backgroundColor: palette.amber,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  actionSecondary: {
    backgroundColor: palette.sandDeep,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
  actionTextSecondary: {
    color: palette.ink,
  },
  // Best-window card — tappable, jumps the timeline to the best hours.
  bestWindowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.cream,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.peach,
  },
  bestWindowCardPressed: {
    opacity: 0.75,
  },
  bestWindowLeft: {
    flex: 1,
    minWidth: 0,
  },
  bestWindowLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  bestWindowTime: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  bestWindowScore: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    marginLeft: spacing.md,
  },
  bestWindowScoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.white,
  },
  bestWindowScoreUnit: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.white,
    marginLeft: 1,
    marginBottom: 2,
  },
  // Sundowner countdown — amber urgency pill. Mustard ground + ink text
  // so it reads as "warm warning", distinct from the cream best-window
  // card above it and the neutral info chips below.
  sundownerPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.mustard,
  },
  sundownerText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    lineHeight: Math.round(fontSizes.sm * 1.3),
    color: palette.ink,
  },
  // Share button — full-width secondary, sits between the two-up row and
  // the primary "Get Directions" CTA. Peach border + ink text so it reads
  // as brand-adjacent without competing with the amber primary.
  actionShare: {
    borderWidth: 1.5,
    borderColor: palette.peach,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  actionShareText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.burnt,
  },
  // Reserve-a-table CTA — burnt (deep brand red) fill so it reads as the
  // strongest booking intent when present. Only rendered for terraces that
  // have a verified reservationUrl, so it doesn't always compete with the
  // amber Get Directions primary below it.
  actionReserve: {
    backgroundColor: palette.burnt,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  actionReserveText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
  },
  // Photo strip — bleeds edge-to-edge by negating the sheet's horizontal
  // padding. paddingHorizontal on the content container adds a small
  // leading inset so the first tile doesn't sit hard against the edge.
  photoStrip: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.md,
  },
  photoStripContent: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  photoTile: {
    width: 160,
    height: 120,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep, // placeholder while loading
  },

  // ── Pro discovery teaser rows (v1.2) ───────────────────────────
  // Free users see these in place of the photo strip + the
  // hours/contact rows. Each row clearly shows what Pro unlocks
  // without pretending the user has the data, and tap-to-paywall.
  photoStripLoadingRow: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sandDeep,
    borderRadius: 0,
  },
  photoStripLoadingText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },
  photoStripLock: {
    marginHorizontal: -spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: palette.sandDeep,
    borderRadius: 0, // edge-to-edge to match the photo strip's layout
  },
  photoStripLockPressed: {
    opacity: 0.7,
  },
  photoStripLockGlyph: {
    fontSize: fontSizes.xl,
  },
  photoStripLockText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.ink,
  },
  photoStripLockHint: {
    fontSize: fontSizes.md,
    color: palette.burnt,
    marginLeft: spacing.xs,
  },
  // Hours / phone / website locked rows inside the PlacesCard
  proLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep,
  },
  proLockRowPressed: {
    opacity: 0.7,
  },
  proLockGlyph: {
    fontSize: fontSizes.md,
  },
  proLockText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
  },
  proLockTag: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.burnt,
    letterSpacing: 0.4,
  },
  // "Next sunny spot" hand-off row — tappable, appears just below the
  // sundowner pill. Warm mustard-adjacent treatment so it reads as a
  // natural continuation of the urgency signal above it ("sun leaving
  // soon AND here's where to go"). The chevron "→" is baked into the
  // i18n string (nextSunnySpot) so no separate icon element is needed.
  handoffRow: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.cream,
    borderWidth: 1,
    borderColor: palette.peach,
  },
  handoffRowPressed: {
    opacity: 0.75,
  },
  handoffText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
    lineHeight: Math.round(fontSizes.sm * 1.4),
  },
});
