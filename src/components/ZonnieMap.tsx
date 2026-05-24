import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region as MapRegion } from 'react-native-maps';
import * as Location from 'expo-location';

import { MapRegionPill } from '@/src/components/MapRegionPill';
import { ShadowOverlay } from '@/src/components/ShadowOverlay';
import { centroidForRegion, regionForCoordinate } from '@/src/data/regionFromCoordinate';
import type { Region } from '@/src/data/regions';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { haptics } from '@/src/lib/haptics';
import { HintBubble } from '@/src/onboarding/HintBubble';
import { useHint } from '@/src/onboarding/useHint';
import { useStrings } from '@/src/i18n/useStrings';
import { useSelectionStore } from '@/src/store/selectionStore';
import { useShadowStore } from '@/src/store/shadowStore';
import { fonts, fontSizes, palette, spacing } from '@/src/theme/tokens';

// Above this latitude delta (~5km vertical span), the map view spans
// more than one region so showing a specific region label would lie.
// Pill falls back to "Amsterdam" in that case.
const REGION_PILL_ZOOM_THRESHOLD = 0.04;

const AMSTERDAM_REGION: MapRegion = {
  latitude: 52.3676,
  longitude: 4.9041,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * Score → pin colour band. Mirrors the band thresholds in
 * `engines/scoring.ts#scoreLabel`. Five bands so the visual reads
 * the score class even at extreme map zoom-outs where the number
 * inside the pin becomes too small to read.
 */
type ScoreBand = 'full' | 'mostly' | 'partial' | 'mshade' | 'shade';

/**
 * Absolute score → colour band. Thresholds mirror scoreLabel() in
 * scoring.ts so pin colour and detail-sheet label always agree.
 *
 * Using absolute (not relative-within-range) thresholds means that a
 * terrace in genuine shadow is always dark regardless of how its
 * neighbours are scoring — which is exactly the signal the user needs
 * ("where to avoid") without any colour mapping trickery.
 *
 * With the altFactor now flat above 25° and a 40% facing spread,
 * the real-world score range (≈ 10%–90%) is wide enough that all five
 * colour bands appear naturally without needing relative normalisation.
 */
function bandForScore(score: number): ScoreBand {
  if (score > 0.7) return 'full';
  if (score > 0.5) return 'mostly';
  if (score > 0.3) return 'partial';
  if (score > 0.1) return 'mshade';
  return 'shade';
}

/** Half-width margin added to the viewport box when culling markers.
 *  Small fraction of a lat/lng degree — keeps pins at the visible edge
 *  from popping in/out as the user pans by a few pixels. */
const VIEWPORT_MARGIN = 0.003;

/** Hard cap on rendered markers per frame. react-native-maps 1.27.2
 *  handles 300 child-component markers comfortably on modern iOS/Android;
 *  city-zoom Amsterdam fits ≈ 280 terraces in the viewport already, so
 *  this cap only fires when zoomed further out than city level. */
const MAX_VIEWPORT_PINS = 300;

/**
 * Band → palette colours. The fill is the dominant pin colour;
 * `text` is the score-number colour layered on top.
 */
const BAND_COLORS: Record<ScoreBand, { fill: string; text: string }> = {
  full:    { fill: palette.terracotta, text: palette.cream },   // top — sunniest
  mostly:  { fill: palette.burnt,      text: palette.cream },
  partial: { fill: palette.peach,      text: palette.cocoa },
  mshade:  { fill: palette.mist,       text: palette.inkSoft }, // mostly shade
  shade:   { fill: palette.ink,        text: palette.cream },   // bottom — fully shaded
};

interface ZonnieMapProps {
  onSelect?: (item: ScoredTerrace) => void;
}

interface TerracePinProps {
  id: number;
  latitude: number;
  longitude: number;
  band: ScoreBand;
  score: number;
  selected: boolean;
  featured: boolean;
  title: string;
  description: string;
  onPress: () => void;
}

/**
 * Custom score-teardrop pin (concept B).
 *
 * Pure RN views — no SVG, no PNG. The pin shape is a circle "head"
 * with a rotated square "tail" peeking below; absolute positioning
 * stitches them into a teardrop silhouette. Score number is centred
 * in the head.
 *
 * Why pure RN: the previous PNG-asset path meant any change to the
 * pin design needed a new asset pipeline + a new binary. This is
 * OTA-shippable and the score (which changes with the time slider)
 * can be drawn dynamically rather than being baked into the asset.
 *
 * `featured` (paid-placement) plumbing is wired up but only adds a
 * subtle gold border when true. No terraces have it set today —
 * exists so the B1 "Featured partner" sponsored-pin variant can be
 * activated by toggling the data flag, not by shipping new code.
 *
 * Memoized — re-renders only when its band/score/selected state
 * changes. Coord changes basically never happen post-mount.
 */
const TerracePin = memo(
  function TerracePin({
    latitude,
    longitude,
    band,
    score,
    selected,
    featured,
    title,
    description,
    onPress,
  }: TerracePinProps) {
    // Selected pins get a slight size bump + amber halo so the user
    // can re-locate them on the map after opening the detail sheet.
    const size = selected ? 38 : 32;
    const tail = selected ? 13 : 11;
    const colors = BAND_COLORS[band];
    // Score on the pin is shown as 0–100 (cleaner read than a 0–1
    // decimal). Always clamp + floor so we never show 100 unless
    // it really is a perfect score.
    const display = Math.min(99, Math.max(0, Math.floor(score * 100)));

    return (
      <Marker
        coordinate={{ latitude, longitude }}
        // Anchor at the very bottom of the layout box so the tail tip
        // sits on the lat/lng coordinate. With the flow layout the wrap
        // height = size + tail/2 (negative margin pulls tail halfway
        // into the head); the rotated tail's visible point extends a
        // couple of pixels beyond layout bounds, which is fine — the
        // visual reads correctly and map markers aren't hard-clipped.
        anchor={{ x: 0.5, y: 1.0 }}
        // Crucial for child-component markers on Android: must be true
        // until the first paint so the bitmap snapshot is correct,
        // then we flip it off for perf. iOS ignores this prop for
        // child-component markers.
        tracksViewChanges={false}
        accessibilityLabel={title}
        accessibilityHint={description ?? undefined}
        onPress={onPress}
      >
        <View style={pinStyles.wrap}>
          {/* Head — drawn first so its z-order covers the tail's top half */}
          <View
            style={[
              pinStyles.head,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: colors.fill,
              },
              selected && pinStyles.headSelected,
              // Featured (paid placement) adds a thin gold ring.
              // Today no terraces have `featured: true` so this is
              // never visible — plumbing only.
              featured && pinStyles.headFeatured,
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                pinStyles.scoreText,
                {
                  color: colors.text,
                  fontSize: selected ? 16 : 14,
                  lineHeight: selected ? 18 : 16,
                },
              ]}
            >
              {display}
            </Text>
          </View>
          {/* Tail — rotated square pulled up by half its height so its
              top half merges with the head, forming the teardrop seam */}
          <View
            style={[
              pinStyles.tail,
              {
                width: tail,
                height: tail,
                backgroundColor: featured ? palette.mustard : colors.fill,
                marginTop: -(tail / 2),
              },
            ]}
          />
        </View>
      </Marker>
    );
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.band === next.band &&
    prev.score === next.score &&
    prev.selected === next.selected &&
    prev.featured === next.featured &&
    prev.latitude === next.latitude &&
    prev.longitude === next.longitude &&
    prev.title === next.title &&
    prev.description === next.description,
);

const pinStyles = StyleSheet.create({
  // Flow column: head on top, tail below with negative marginTop to form
  // the teardrop seam. alignItems: 'center' keeps the narrower tail
  // horizontally centred under the head.
  //
  // WHY no absolute positioning: the old approach used `position:'absolute'`
  // + `left:0, right:0, marginHorizontal:'auto'` on the head, which is not
  // supported in Hermes (React Native's JS engine). It stretched the head to
  // the full wrap width (always 38px) regardless of the intended `size`
  // prop — making 32px pins oval instead of circular.
  wrap: {
    alignItems: 'center',
  },
  head: {
    alignItems: 'center',
    justifyContent: 'center',
    // White outline lifts the pin off dark map tiles.
    borderWidth: 2,
    borderColor: palette.white,
    // Soft drop-shadow so the pin floats above the map.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  headSelected: {
    borderColor: palette.cream,
    borderWidth: 2.5,
  },
  headFeatured: {
    borderColor: palette.mustard,
    borderWidth: 2.5,
  },
  tail: {
    // marginTop is set inline (-(tail/2)) so the tail overlaps the head.
    transform: [{ rotate: '45deg' }],
  },
  scoreText: {
    fontFamily: fonts.displayBold,
    textAlign: 'center',
    // lineHeight set inline — differs between normal (16) and selected (18).
  },
});

/**
 * Score-themed terrace markers (Zonnie brand pins) without app-side
 * clustering.
 *
 * Stability strategy:
 *   1. Per-hour score cache (`useScoredTerraces`) makes time changes cheap.
 *   2. `TerracePin` is React.memo'd — markers whose score-band didn't cross
 *      a threshold skip re-render entirely.
 *   3. `tracksViewChanges={false}` — for image markers, native side ignores
 *      view-change tracking but still honors image-prop swaps.
 *
 * Together these keep the JS thread responsive and the native annotation
 * traffic bounded, even when re-scoring all 378 terraces per chip tap.
 *
 * "Show on Map" pan-to is driven by `selectionStore.panTo`. ZonnieMap
 * watches it and animates the map there, then clears it.
 */
// Amsterdam metro bbox — only auto-recenter to user location if they're
// inside this box. Otherwise keep the city centroid (someone testing the
// app from London shouldn't see an empty map of London).
const AMS_BBOX = { minLat: 52.27, maxLat: 52.45, minLng: 4.7, maxLng: 5.05 };

function isInAmsterdam(c: { lat: number; lng: number }): boolean {
  return (
    c.lat >= AMS_BBOX.minLat &&
    c.lat <= AMS_BBOX.maxLat &&
    c.lng >= AMS_BBOX.minLng &&
    c.lng <= AMS_BBOX.maxLng
  );
}

export function ZonnieMap({ onSelect }: ZonnieMapProps) {
  const t = useStrings();
  const mapRef = useRef<MapView>(null);
  const scored = useScoredTerraces();
  const selectedId = useSelectionStore((s) => s.selectedId);
  const shadowEnabled = useShadowStore((s) => s.shadowEnabled);
  const panTo = useSelectionStore((s) => s.panTo);
  const clearPanTo = useSelectionStore((s) => s.clearPanTo);
  const userLoc = useUserLocation();

  // Tracks which macro-region the map is currently centred on, driving
  // the floating region pill. Updates on gesture-settle (not during the
  // pan itself) so the label doesn't flap as the user drags. Null when
  // the user is zoomed out far enough that no single region dominates
  // — the pill falls back to "Amsterdam" in that case.
  const [visibleRegion, setVisibleRegion] = useState<Region | null>(null);

  // Current map viewport — passed to ShadowOverlay for viewport culling.
  // Initialised to the whole-city view; updated after every pan/zoom settle.
  // Stored separately from `visibleRegion` so shadow culling still works
  // at city-zoom even when the region pill is suppressed.
  const [mapRegion, setMapRegion] = useState<MapRegion>(AMSTERDAM_REGION);

  const handleRegionChangeComplete = useCallback((region: MapRegion) => {
    setMapRegion(region);
    if (region.latitudeDelta > REGION_PILL_ZOOM_THRESHOLD) {
      setVisibleRegion(null);
      return;
    }
    const r = regionForCoordinate(region.latitude, region.longitude);
    setVisibleRegion((prev) => (prev === r ? prev : r));
  }, []);

  // First-run hint pointing users at the primary interaction.
  // Auto-dismisses after 10s or on first pin tap below.
  const [showPinHint, dismissPinHint] = useHint('pin-tap');

  const handlePillPress = useCallback((region: Region | null) => {
    if (region == null) {
      // Zoomed-out view — recentre on the whole city.
      mapRef.current?.animateToRegion(AMSTERDAM_REGION, 500);
      return;
    }
    const c = centroidForRegion(region);
    mapRef.current?.animateToRegion(
      {
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500,
    );
  }, []);

  // Auto-recenter map on user once their location lands AND they're inside
  // the Amsterdam metro bbox. Tighter zoom (latDelta 0.02 ≈ 2km radius) so
  // they immediately see nearby pins instead of the whole city.
  const recenteredOnUserRef = useRef(false);
  useEffect(() => {
    if (recenteredOnUserRef.current) return;
    if (userLoc.status !== 'ready' || !userLoc.coord) return;
    if (!isInAmsterdam(userLoc.coord)) return;
    recenteredOnUserRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: userLoc.coord.lat,
        longitude: userLoc.coord.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      600,
    );
  }, [userLoc.status, userLoc.coord]);

  /**
   * Manual locate-me action. Tapped when the auto-recenter on cold-start
   * didn't land where the user expected — e.g., the user denied location
   * the first time and now wants to grant it, or the iOS-cached fix was
   * stale and the auto-recenter went to the wrong city.
   *
   * Asks for permission fresh, does a current-position lookup (not the
   * potentially-stale last-known), then animates the map there.
   * Bypasses the AMS_BBOX guard — if the user has explicitly asked to
   * see where they are, we trust the request even if they're not in
   * Amsterdam. (The blue dot still respects the bbox so we don't
   * accidentally show a dot floating in a remote ocean.)
   */
  const handleLocateMe = useCallback(async () => {
    haptics.light();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t.locationOff,
          t.locationOffBody,
          [
            { text: t.notNow, style: 'cancel' },
            { text: t.openSettings, onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion(
        {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500,
      );
    } catch {
      Alert.alert(t.locationError, t.locationErrorBody);
    }
  }, []);

  useEffect(() => {
    if (!panTo) return;
    mapRef.current?.animateToRegion(
      {
        latitude: panTo.lat,
        longitude: panTo.lng,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      400,
    );
    clearPanTo();
  }, [panTo, clearPanTo]);

  // ── Viewport-culled markers ────────────────────────────────────────────────
  //
  // Instead of a global top-N cap, we show EVERY scored terrace that lies
  // inside the current map region (post-filter). This means:
  //
  //   No filters:     city zoom → ~280 pins from the full dataset.
  //                   neighbourhood zoom → all 25–50 venues in the area.
  //   Category filter (e.g. "Bar"): only bars visible on screen appear.
  //                   Makes niche venues (Kiebert, Marathonweg) always show
  //                   in their neighbourhoods regardless of global rank.
  //
  // Colour uses ABSOLUTE score bands (same thresholds as scoreLabel) so a
  // dark pin genuinely means "in shadow right now" — users can see WHERE
  // to avoid, not just WHERE the top-scorers are.
  //
  // mapRegion is only updated on pan/zoom settle (onRegionChangeComplete),
  // not during the gesture — so this useMemo doesn't fire while dragging.
  const markers = useMemo(() => {
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2 - VIEWPORT_MARGIN;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2 + VIEWPORT_MARGIN;
    const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2 - VIEWPORT_MARGIN;
    const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2 + VIEWPORT_MARGIN;

    // Filter to viewport, then slice to the performance cap.
    // `scored` is already sorted best-first, so slicing keeps the highest
    // scorers when the viewport contains more than MAX_VIEWPORT_PINS.
    const visible = scored.filter(
      (s) =>
        s.terrace.lat >= minLat &&
        s.terrace.lat <= maxLat &&
        s.terrace.lng >= minLng &&
        s.terrace.lng <= maxLng,
    );
    const capped = visible.slice(0, MAX_VIEWPORT_PINS);

    // Always include the selected terrace even if it's been panned off-screen
    // (user tapped "Show on map" → pan animates but re-render fires before
    // settle, so the terrace briefly falls outside the viewport bounds).
    const need =
      selectedId != null && !capped.some((s) => s.terrace.id === selectedId);
    const list = need
      ? [
          ...capped,
          scored.find((s) => s.terrace.id === selectedId),
        ].filter((x): x is ScoredTerrace => !!x)
      : capped;

    return list.map(({ terrace, score }) => ({
      item: { terrace, score },
      band: bandForScore(score),
      selected: terrace.id === selectedId,
      // `featured` flag for paid placement — gold border, no terraces
      // have it today; wired up for the B1 sponsored-pin variant.
      featured: terrace.featured === true,
    }));
  }, [scored, selectedId, mapRegion]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={AMSTERDAM_REGION}
        // Fires after the user releases a pan/pinch gesture (not during).
        // Drives the floating region pill so it doesn't churn during pan.
        onRegionChangeComplete={handleRegionChangeComplete}
        // Show the standard blue dot only if we have permission and the
        // user is inside Amsterdam — otherwise the dot floats off-screen
        // and confuses people testing from elsewhere.
        showsUserLocation={
          userLoc.status === 'ready' &&
          userLoc.coord != null &&
          isInAmsterdam(userLoc.coord)
        }
        showsMyLocationButton={false}
        showsCompass
        showsScale
        userInterfaceStyle="light"
      >
        {/*
          Shadow overlay — Pro only, toggled from the TimeRangeFineTune
          section in the bottom sheet. Renders semi-transparent shadow
          polygons for buildings visible in the current viewport, at the
          midpoint of the selected visit window. Sits below the markers
          so pins always read over the shadows.
        */}
        <ShadowOverlay mapRegion={mapRegion} />
        {markers.map(({ item, band, selected, featured }) => (
          <TerracePin
            key={item.terrace.id}
            id={item.terrace.id}
            latitude={item.terrace.lat}
            longitude={item.terrace.lng}
            band={band}
            score={item.score}
            selected={selected}
            featured={featured}
            title={item.terrace.name}
            description={item.terrace.vibe}
            onPress={() => {
              haptics.light();
              // Tapping any pin satisfies the "pin-tap" hint — dismiss
              // it so it doesn't reappear next session.
              if (showPinHint) dismissPinHint();
              onSelect?.(item);
            }}
          />
        ))}
      </MapView>
      {/*
        Floating region pill — sits top-centre, updates after each
        pan-settle to tell the user which macro-region the map is
        currently centred on. Tappable: tap to recenter on that
        region's centroid (or on the whole city when zoomed out).
      */}
      <MapRegionPill region={visibleRegion} onPress={handlePillPress} />
      {/*
        First-run hint: anchored above the bottom-sheet peek line so
        the user sees it on the visible map area when the app opens.
        Auto-dismisses on first pin tap, or after 10s timeout.
      */}
      {showPinHint ? (
        <HintBubble onDismiss={dismissPinHint} style={styles.pinHint}>
          {t.mapHint}
        </HintBubble>
      ) : null}
      {/*
        Floating "locate me" button. We ship our own (rather than using
        MapView's `showsMyLocationButton`) because:
          (a) the platform button only appears once permission is
              granted — useless when the user wants to grant it now;
          (b) the platform button's position is fixed to bottom-right
              on Android and isn't customizable, which collides with our
              bottom sheet;
          (c) we want to provide an explicit Settings deep-link in the
              "permission denied" path.
      */}
      <Pressable
        onPress={handleLocateMe}
        style={({ pressed }) => [styles.locateButton, pressed && styles.locateButtonPressed]}
        accessibilityLabel={t.centreMap}
        hitSlop={8}
      >
        <Text style={styles.locateGlyph}>⌖</Text>
      </Pressable>
      {/*
        Shadow zoom hint — shown when the user has enabled the shadow
        overlay but hasn't zoomed in far enough to trigger it (the
        overlay kicks in below latitudeDelta 0.025, roughly a 2.5km
        vertical span). Without this, the toggle feels broken because
        nothing appears. The pill fades away once the user zooms in.
      */}
      {shadowEnabled && mapRegion.latitudeDelta > 0.025 ? (
        <View style={styles.shadowHint} pointerEvents="none">
          <Text style={styles.shadowHintText}>{t.shadowZoomHint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  locateButton: {
    position: 'absolute',
    top: spacing.xxl + spacing.lg, // clears the iOS status-bar / notch
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle shadow so the button reads as floating above the map.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  locateButtonPressed: {
    opacity: 0.7,
  },
  locateGlyph: {
    fontSize: 22,
    color: palette.ink,
    lineHeight: 24,
  },
  // Sits above the bottom-sheet peek line (the sheet peeks at ~260px
  // from the bottom of the screen). 300px from bottom puts the hint
  // comfortably in the visible map strip without colliding with the
  // sheet's handle.
  pinHint: {
    bottom: 300,
    alignSelf: 'center',
  },
  // Shadow-zoom hint pill — floats at the top of the visible map area
  // when shadows are enabled but the viewport is too wide to show them.
  // `pointerEvents="none"` so it doesn't intercept taps on pins below.
  shadowHint: {
    position: 'absolute',
    top: spacing.xxl + spacing.lg + 52, // below the locate button
    alignSelf: 'center',
    backgroundColor: palette.ink,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    opacity: 0.85,
  },
  shadowHintText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
  },
});
