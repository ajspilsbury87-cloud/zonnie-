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
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsViewUrl,
  priceLevelToDollars,
  type PlaceDetails,
} from '@/src/data/places';
import { SunTimeline } from '@/src/components/SunTimeline';
import { computeRangeScore, computeSunScore, scoreLabel } from '@/src/engines/scoring';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { useSelectionStore } from '@/src/store/selectionStore';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { usePlacesStore } from '@/src/store/placesStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { haptics } from '@/src/lib/haptics';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  scoreToColor,
  spacing,
} from '@/src/theme/tokens';

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
  const ref = useRef<BottomSheet>(null);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const clear = useSelectionStore((s) => s.clear);
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

  const terrace = useMemo(() => {
    if (selectedId == null) return null;
    return TERRACES.find((t) => t.id === selectedId) ?? null;
  }, [selectedId]);

  // Trigger Places fetch when a terrace with a placeId is opened.
  // (The sheet's open/close is now driven by conditional render
  // below — no imperative present()/dismiss() needed.)
  useEffect(() => {
    if (terrace?.placeId) ensurePlace(terrace.placeId);
  }, [terrace, ensurePlace]);

  const placeEntry = terrace?.placeId ? placesByPlaceId[terrace.placeId] : undefined;
  const placeDetails = placeEntry?.status === 'ready' ? placeEntry.data : undefined;

  const score = useMemo(() => {
    if (!terrace) return 0;
    const buildings = getBuildingsForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return computeRangeScore(
      terrace,
      buildings,
      fromHour,
      toHour,
      dateStr,
      weatherProfile,
      hourlyWeather,
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
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    const here = computeSunScore(
      terrace,
      buildings,
      fromHour,
      dateStr,
      weatherProfile,
      hourlyWeather?.[fromHour],
    ).score;
    const prevHour = Math.max(0, fromHour - 1);
    const before = computeSunScore(
      terrace,
      buildings,
      prevHour,
      dateStr,
      weatherProfile,
      hourlyWeather?.[prevHour],
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
   * Curation freshness label — "verified by Zonnie" with a relative time
   * for the most-recent verification. Surfaces our quality moat over
   * Sun Seekr / Coffee in the Sun's stale POI scrapes and Seats in the
   * Sun's crowdsourced (often-closed) listings.
   */
  const curationLabel = useMemo(() => {
    if (!terrace || !terrace.verified) return null;
    if (!terrace.verifiedAt) return 'Verified by Zonnie';
    const ms = Date.now() - new Date(terrace.verifiedAt).getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days < 1) return 'Verified today';
    if (days < 7) return `Verified ${days} day${days === 1 ? '' : 's'} ago`;
    if (days < 30) return `Verified ${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
    if (days < 365) return `Verified ${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
    return `Verified ${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`;
  }, [terrace]);

  const rangeLabel = useMemo(() => {
    const f = fromHour.toString().padStart(2, '0');
    const t = toHour.toString().padStart(2, '0');
    return fromHour === toHour ? `at ${f}:00` : `${f}:00 – ${t}:00`;
  }, [fromHour, toHour]);

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
  }, [terrace]);

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

  // Sheet is conditionally rendered based on selectedId. Mount when a
  // terrace is selected; unmount when cleared. This bypasses Gorhom v5's
  // BottomSheetModalProvider portal mechanism which silently failed to
  // present on Andy's TestFlight 1.0.0 build (the TEST DETAIL diagnostic
  // confirmed the store updated but the modal never appeared). Plain
  // <BottomSheet> renders inline, no portal involvement.
  if (selectedId == null) return null;

  return (
    <BottomSheet
      ref={ref}
      // index=0 = first snap point on mount. Default would be -1 (closed).
      index={0}
      snapPoints={['70%', '92%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={clear}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetView style={styles.content}>
        {terrace ? (
          <>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={2}>
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
                  // Success haptic when adding to favourites; lighter
                  // tick when removing.
                  if (isFavorite) haptics.selection();
                  else haptics.success();
                  toggleFavorite(terrace.id);
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

            {/* Google Places card — rating, hours, price */}
            <PlacesCard
              loading={placeEntry?.status === 'loading'}
              hasPlaceId={!!terrace.placeId}
              details={placeDetails}
            />

            <Text style={styles.sectionLabel}>Sun today</Text>
            <SunTimeline terrace={terrace} />
            <Text style={styles.scoreLabelText}>
              {rangeLabel}: <Text style={styles.scoreLabelStrong}>{scoreLabel(score)}</Text>
            </Text>

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
                      ? '↑ Rising'
                      : sunTrend === 'falling'
                        ? '↓ Falling'
                        : '→ Holding'}
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
                      ? '1 outdoor screen'
                      : `${terrace.outdoorScreens} outdoor screens`}
                  </Text>
                </View>
              ) : null}
            </View>

            {terrace.vibe ? (
              <>
                <Text style={styles.sectionLabel}>Vibe</Text>
                <Text style={styles.body}>{terrace.vibe}</Text>
              </>
            ) : null}

            {placeDetails?.address || terrace.address ? (
              <>
                <Text style={styles.sectionLabel}>Address</Text>
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
                  Show on Map
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
                  View in Maps
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleNavigate}
              style={({ pressed }) => [
                styles.actionPrimary,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={styles.actionText}>Get Directions</Text>
            </Pressable>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
}

interface PlacesCardProps {
  loading: boolean;
  hasPlaceId: boolean;
  details: PlaceDetails | undefined;
}

/**
 * Google Places summary line. Renders rating · price · today's hours
 * if details have loaded. Renders nothing if there's no placeId on the
 * terrace, or if the API key is unset (graceful degradation).
 */
function PlacesCard({ loading, hasPlaceId, details }: PlacesCardProps) {
  if (!hasPlaceId) return null;
  if (loading) {
    return (
      <View style={styles.placesCard}>
        <Text style={styles.placesPlaceholder}>Loading details from Google…</Text>
      </View>
    );
  }
  if (!details) {
    // API key missing or fetch failed — silently skip.
    return null;
  }

  const segments: string[] = [];
  if (details.rating) {
    const stars = '★'.repeat(Math.round(details.rating));
    const count = details.ratingCount ? ` (${details.ratingCount})` : '';
    segments.push(`${stars} ${details.rating.toFixed(1)}${count}`);
  }
  const price = priceLevelToDollars(details.priceLevel);
  if (price) segments.push(price);
  if (details.openNow != null) {
    segments.push(details.openNow ? 'Open now' : 'Closed now');
  }

  return (
    <View style={styles.placesCard}>
      {segments.length > 0 ? (
        <Text style={styles.placesSummary}>{segments.join('  ·  ')}</Text>
      ) : null}
      {details.todayHours ? (
        <Text style={styles.placesHours}>{details.todayHours}</Text>
      ) : null}
      {details.phone ? <Text style={styles.placesPhone}>{details.phone}</Text> : null}
    </View>
  );
}

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
});
