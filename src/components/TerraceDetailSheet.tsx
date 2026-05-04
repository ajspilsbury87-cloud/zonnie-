/**
 * Modal bottom sheet showing the detail of a single terrace.
 *
 * Opens when `useSelectionStore.selectedId` is set. Uses Gorhom
 * `BottomSheetModal` so it overlays the main sheet without dismissing it.
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
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsViewUrl,
  priceLevelToDollars,
  type PlaceDetails,
} from '@/src/data/places';
import { SunTimeline } from '@/src/components/SunTimeline';
import { computeRangeScore, scoreLabel } from '@/src/engines/scoring';
import { getBuildings } from '@/src/data/buildings';
import { useSelectionStore } from '@/src/store/selectionStore';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { usePlacesStore } from '@/src/store/placesStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
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
  const ref = useRef<BottomSheetModal>(null);
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

  // Open / close the sheet based on store state.
  useEffect(() => {
    if (selectedId != null) ref.current?.present();
    else ref.current?.dismiss();
  }, [selectedId]);

  // Trigger Places fetch when a terrace with a placeId is opened.
  useEffect(() => {
    if (terrace?.placeId) ensurePlace(terrace.placeId);
  }, [terrace, ensurePlace]);

  const placeEntry = terrace?.placeId ? placesByPlaceId[terrace.placeId] : undefined;
  const placeDetails = placeEntry?.status === 'ready' ? placeEntry.data : undefined;

  const score = useMemo(() => {
    if (!terrace) return 0;
    const buildings = getBuildings();
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
    setPanTo({ lat: terrace.lat, lng: terrace.lng });
    clear();
  }, [terrace, setPanTo, clear]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['70%', '92%']}
      enableDynamicSizing={false}
      onDismiss={clear}
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
                onPress={() => terrace && toggleFavorite(terrace.id)}
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
    </BottomSheetModal>
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
