import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
  type MapPressEvent,
  type Region as MapRegion,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapRegionPill } from '@/src/components/MapRegionPill';
import { centroidForRegion, regionForCoordinate } from '@/src/data/regionFromCoordinate';
import { isWorldCupLive } from '@/src/data/worldcup';
import { isWorldPrideLive, PARADE_ROUTE_SEGMENTS, PRIDE_TOILETS } from '@/src/data/pride';
import type { Region } from '@/src/data/regions';
import { thinPins } from '@/src/engines/pinThinning';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { haptics } from '@/src/lib/haptics';
import { HintBubble } from '@/src/onboarding/HintBubble';
import { useHint } from '@/src/onboarding/useHint';
import { useStrings } from '@/src/i18n/useStrings';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';
import { bandForScore, type ScoreBand } from '@/src/engines/bands';

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

// ScoreBand and bandForScore are imported from src/engines/bands.ts —
// single source of truth for thresholds shared with scoring.ts and tokens.ts.

/** Half-width margin added to the viewport box when culling markers.
 *  Small fraction of a lat/lng degree — keeps pins at the visible edge
 *  from popping in/out as the user pans by a few pixels. */
const VIEWPORT_MARGIN = 0.003;

/** Zoom used when recentering on the user (≈2km radius). */
const RECENTER_ZOOM_DELTA = 0.02;
/** When recentering, aim slightly SOUTH of the user so the blue dot
 *  surfaces in the visible map strip ABOVE the bottom sheet instead of
 *  hiding behind it (the sheet covers roughly the lower half at
 *  mid-detent). Fraction of latitudeDelta: 0.22 puts the dot about a
 *  quarter of the way down from the top of the screen. */
const RECENTER_SHEET_OFFSET = 0.22;

/**
 * Zoom-aware marker cap: maps latitudeDelta → maximum number of pins to
 * render. Smaller delta = more zoomed in = more pins allowed.
 *
 * Amsterdam reference frame (latitudeDelta):
 *   ≥ 0.08  — whole city or wider (both canals + full metro)  → 30 pins
 *   0.03–0.08 — multi-neighbourhood (e.g. full Centrum+West)  → 60 pins
 *   0.01–0.03 — single neighbourhood (e.g. Jordaan)           → 100 pins
 *   0.004–0.01 — a few streets                                → 150 pins
 *   < 0.004  — very zoomed-in (street level)                  → 250 (all)
 *
 * Scored terraces are already sorted best-first, so slicing keeps the
 * sunniest pins visible even as cheaper ones get culled at city-zoom.
 * The selected pin is always kept regardless (see `markers` useMemo).
 */
function maxPinsFromZoom(latitudeDelta: number): number {
  if (latitudeDelta >= 0.08) return 30;
  if (latitudeDelta >= 0.03) return 60;
  if (latitudeDelta >= 0.01) return 100;
  if (latitudeDelta >= 0.004) return 150;
  return 250;
}

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
  /** One of the 3 sunniest pins currently in the viewport — gold crown treatment. */
  topPick: boolean;
  /**
   * When true (and isWorldCupLive today), shows a small 📺 badge at
   * the head's TOP-LEFT so screen terraces are identifiable at a glance.
   * Only passed as true during the 2026 tournament window.
   */
  screens: boolean;
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
    topPick,
    screens,
    title,
    description,
    onPress,
  }: TerracePinProps) {
    // Selected pins get a slight size bump + amber halo so the user
    // can re-locate them on the map after opening the detail sheet.
    // Top picks (3 sunniest in view) get a smaller bump + gold ring +
    // ☀ badge so "the sunniest near me" is answerable at a glance.
    const size = selected ? 38 : topPick ? 36 : 32;
    const tail = selected ? 13 : topPick ? 12 : 11;
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
              // Top-pick crown ring wins over featured (it's earned by
              // sun, not paid) but defers to selection highlight.
              topPick && !selected && pinStyles.headTopPick,
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
            {/* ☀ crown badge — only on the viewport's top picks. Sits on
                the head's top-right edge; absolute so it doesn't shift
                the centred score text. */}
            {topPick && !selected ? (
              <View style={pinStyles.topPickBadge}>
                <Text allowFontScaling={false} style={pinStyles.topPickBadgeText}>
                  ☀
                </Text>
              </View>
            ) : null}
            {/* 📺 screen badge — visible only during the WC 2026 window,
                on pins whose terrace has outdoorScreens > 0. Sits on the
                head's TOP-LEFT so it can coexist with the ☀ badge on
                the right. Subtle: ink background + cream border so it
                reads on any band colour without fighting the score number. */}
            {screens ? (
              <View style={pinStyles.screensBadge}>
                <Text allowFontScaling={false} style={pinStyles.screensBadgeText}>
                  📺
                </Text>
              </View>
            ) : null}
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
    prev.topPick === next.topPick &&
    prev.screens === next.screens &&
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
  // Top-pick crown: gold ring, slightly heavier than featured so the
  // viewport's 3 sunniest pins read as a tier above everything else.
  headTopPick: {
    borderColor: palette.mustard,
    borderWidth: 3,
  },
  topPickBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.mustard,
    alignItems: 'center',
    justifyContent: 'center',
    // Hairline ink ring so the gold dot stays visible over light tiles.
    borderWidth: 1,
    borderColor: palette.cocoa,
  },
  topPickBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    color: palette.cocoa,
  },
  // 📺 screen badge — World Cup 2026 only. Mirrors topPickBadge geometry
  // but sits TOP-LEFT so both badges can coexist on the same pin.
  // Ink background + cream border keeps it subtle against any band colour.
  screensBadge: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.cream,
  },
  screensBadgeText: {
    fontSize: 8,
    lineHeight: 10,
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
  const clearAreas = useAreaStore((s) => s.clear);
  const clearSearch = useSearchStore((s) => s.clear);
  const handleClearFilters = useCallback(() => {
    haptics.selection();
    clearAreas();
    clearSearch();
  }, [clearAreas, clearSearch]);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const panTo = useSelectionStore((s) => s.panTo);
  const clearPanTo = useSelectionStore((s) => s.clearPanTo);
  const userLoc = useUserLocation();

  // Gate the 📺 badge once per render — cheap string comparison, not per-pin.
  // We don't need this to react to a store; it only needs to be correct on
  // each fresh render (the map re-renders when scored changes anyway).
  const wcLiveToday = isWorldCupLive(todayAmsterdamDateStr());
  // WorldPride: rainbow parade-route overlay, gated to the 25 Jul–8 Aug
  // window — same evaluate-per-render idiom as wcLiveToday above.
  const prideLiveToday = isWorldPrideLive(todayAmsterdamDateStr());
  // Toilet pins only show with the parade filter ON — event-lens info, kept
  // out of the everyday map to avoid clutter.
  const prideRouteOnly = useAreaStore((s) => s.prideRouteOnly);

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

  // Safe-area insets — the locate button hangs below the filter-chip
  // ribbon, whose top is insets-derived (see FilterChips.tsx).
  const insets = useSafeAreaInsets();

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
        latitude: userLoc.coord.lat - RECENTER_ZOOM_DELTA * RECENTER_SHEET_OFFSET,
        longitude: userLoc.coord.lng,
        latitudeDelta: RECENTER_ZOOM_DELTA,
        longitudeDelta: RECENTER_ZOOM_DELTA,
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
          latitude: fix.coords.latitude - RECENTER_ZOOM_DELTA * RECENTER_SHEET_OFFSET,
          longitude: fix.coords.longitude,
          latitudeDelta: RECENTER_ZOOM_DELTA,
          longitudeDelta: RECENTER_ZOOM_DELTA,
        },
        500,
      );
    } catch {
      Alert.alert(t.locationError, t.locationErrorBody);
    }
  }, [t]);

  /**
   * Tapping the map background dismisses an open peek card (AllTrails
   * pattern — the card is a lightweight preview, so tapping "away" should
   * feel like deselecting). Reads the store via getState() so this
   * callback stays referentially stable and MapView never re-renders
   * because of it. A FULL detail sheet is never dismissed from here —
   * it has its own backdrop + pan-down-to-close.
   */
  const handleMapPress = useCallback((e: MapPressEvent) => {
    // On iOS a marker tap ALSO fires the map's onPress (with a
    // 'marker-press' action) — ignore those so tapping a pin doesn't
    // instantly dismiss the peek card it just opened.
    if ((e.nativeEvent as { action?: string }).action === 'marker-press') return;
    const s = useSelectionStore.getState();
    if (s.selectedId != null && s.stage === 'peek') s.clear();
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
    const cap = maxPinsFromZoom(mapRegion.latitudeDelta);
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2 - VIEWPORT_MARGIN;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2 + VIEWPORT_MARGIN;
    const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2 - VIEWPORT_MARGIN;
    const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2 + VIEWPORT_MARGIN;

    // Aggressive culling: collect pins in viewport until we reach the render cap,
    // then stop — no need to filter the entire dataset. This trades off the
    // global rank guarantee (scored is sorted best-first everywhere) for
    // speed: a viewport at wide zoom only processes as many terraces as it
    // will render, not all 1,986. thinPins still spreads the budget across a
    // grid so quiet neighborhoods remain visible.
    const visible: ScoredTerrace[] = [];
    for (const s of scored) {
      if (
        s.terrace.lat >= minLat &&
        s.terrace.lat <= maxLat &&
        s.terrace.lng >= minLng &&
        s.terrace.lng <= maxLng
      ) {
        visible.push(s);
        // Early exit: once we have 2.5× the render cap, thinPins has enough
        // to work with and the remaining terraces outside the viewport are
        // certainly below-screen anyway.
        if (visible.length > cap * 2.5) break;
      }
    }
    const capped = thinPins(visible, cap, mapRegion);

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

    // Top picks in view — the 3 sunniest pins currently on screen get a
    // gold crown treatment. Even with good score spread, a user scanning
    // 200 pins can't rank them by eye; this answers the app's core job
    // ("which terrace is THE sunniest near me?") at a glance. Re-sorted
    // by sun score here because in Hidden-Gems mode `scored` arrives
    // gem-ordered — the crown must always mean "sunniest", never a
    // composite. Crowns only above the 'partial' band floor: crowning
    // the least-shaded pin on an overcast evening would be misleading.
    const topPickIds = new Set(
      [...list]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((s) => s.score > 0.41)
        .map((s) => s.terrace.id),
    );

    return list.map(({ terrace, score }) => ({
      item: { terrace, score },
      band: bandForScore(score),
      selected: terrace.id === selectedId,
      // `featured` flag for paid placement — gold border, no terraces
      // have it today; wired up for the B1 sponsored-pin variant.
      featured: terrace.featured === true,
      topPick: topPickIds.has(terrace.id),
      // Show the 📺 badge only during the WC 2026 window AND when the
      // terrace actually has outdoor screens. Both conditions must be true
      // so the badge auto-retires when the tournament ends without any
      // code change.
      screens: wcLiveToday && (terrace.outdoorScreens ?? 0) > 0,
    }));
  }, [scored, selectedId, mapRegion, wcLiveToday]);

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
        // Background tap dismisses the peek card (no-op otherwise).
        onPress={handleMapPress}
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
        {/* WorldPride rainbow — the Canal Parade route drawn in the six flag
            colours along the water. Solid per-segment colours (Apple Maps has
            no gradient polylines); rendered before the pins so terraces stay
            tappable on top. Static data — no re-render cost after mount. */}
        {prideLiveToday
          ? PARADE_ROUTE_SEGMENTS.map((seg, i) => (
              <Polyline
                key={`pride-route-${i}`}
                coordinates={seg.coordinates}
                strokeColor={seg.color}
                strokeWidth={4}
              />
            ))
          : null}
        {/* Public toilets near the route (OSM data, existing city facilities
            — not official event toilets). Only with the parade filter on. */}
        {prideLiveToday && prideRouteOnly
          ? PRIDE_TOILETS.map((p, i) => (
              <Marker
                key={`pride-toilet-${i}`}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                title={t.prideToilet}
              >
                <View style={styles.toiletPin}>
                  <Text style={styles.toiletPinGlyph}>🚻</Text>
                </View>
              </Marker>
            ))
          : null}
        {markers.map(({ item, band, selected, featured, topPick, screens }) => (
          <TerracePin
            key={item.terrace.id}
            id={item.terrace.id}
            latitude={item.terrace.lat}
            longitude={item.terrace.lng}
            band={band}
            score={item.score}
            selected={selected}
            featured={featured}
            topPick={topPick}
            screens={screens}
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
        style={({ pressed }) => [
          styles.locateButton,
          // Sits BELOW the filter-chip ribbon (ribbon top = insets.top +
          // spacing.sm, height 44) so the two never overlap — the old fixed
          // top put the button underneath the scrolling chips.
          { top: insets.top + spacing.sm + 44 + spacing.sm },
          pressed && styles.locateButtonPressed,
        ]}
        accessibilityLabel={t.centreMap}
        hitSlop={8}
      >
        <Text style={styles.locateGlyph}>⌖</Text>
      </Pressable>

      {/* Empty-state notice — the list has one, but the map used to go
          SILENTLY blank when a filter combo matched zero venues (e.g. the
          favourites chip with nothing saved). Filters aren't persisted, so
          a relaunch "mysteriously" fixed it — this explains it instead. */}
      {scored.length === 0 ? (
        <View style={[styles.emptyNotice, { top: insets.top + spacing.sm + 44 + spacing.sm }]}>
          <Text style={styles.emptyNoticeText}>{t.mapNoMatches}</Text>
          <Pressable
            onPress={handleClearFilters}
            style={({ pressed }) => [styles.emptyNoticeButton, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={t.clearFiltersButton}
          >
            <Text style={styles.emptyNoticeButtonText}>{t.clearFiltersButton}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  // Small white disc so the 🚻 glyph reads against busy map tiles; kept
  // visually quieter than terrace pins (info layer, not a destination).
  toiletPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toiletPinGlyph: {
    fontSize: 13,
    lineHeight: 16,
  },
  emptyNotice: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.mist,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: 300,
  },
  emptyNoticeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    textAlign: 'center',
  },
  emptyNoticeButton: {
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  emptyNoticeButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
  },
  locateButton: {
    position: 'absolute',
    // `top` is set inline from safe-area insets (below the chip ribbon).
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    // Hairline warm border + slightly deeper shadow — matches the chip /
    // home-button surface language instead of a bare white disc.
    borderWidth: 1,
    borderColor: palette.mist,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  locateButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  locateGlyph: {
    fontSize: 22,
    color: palette.burnt,
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
});
