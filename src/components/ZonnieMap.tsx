import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import * as Location from 'expo-location';

import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { haptics } from '@/src/lib/haptics';
import { useSelectionStore } from '@/src/store/selectionStore';
import { palette, radii, spacing } from '@/src/theme/tokens';

const AMSTERDAM_REGION: Region = {
  latitude: 52.3676,
  longitude: 4.9041,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * Pre-rendered pin PNGs per state (`scripts/rasterize-assets.ts`).
 * `require()` is the React Native asset bundler convention — strings won't
 * work, the bundler needs to see the literal at build time.
 */
const PIN_IMAGES = {
  full: require('@/assets/images/pins/full.png'),
  mostly: require('@/assets/images/pins/mostly.png'),
  partial: require('@/assets/images/pins/partial.png'),
  // mshade ("mostly shade") added with the v3 Aperol-spritz pin design —
  // splits the previous single shade band into two so the foam/ice
  // fade-out gradient has somewhere to land.
  mshade: require('@/assets/images/pins/mshade.png'),
  shade: require('@/assets/images/pins/shade.png'),
  selected: require('@/assets/images/pins/selected.png'),
} as const;

type PinAsset = typeof PIN_IMAGES[keyof typeof PIN_IMAGES];

/** Score → pin asset key. Mirrors the band thresholds in `engines/scoring.ts#scoreLabel`. */
function pinAssetForScore(score: number): PinAsset {
  if (score > 0.7) return PIN_IMAGES.full;
  if (score > 0.5) return PIN_IMAGES.mostly;
  if (score > 0.3) return PIN_IMAGES.partial;
  if (score > 0.1) return PIN_IMAGES.mshade;
  return PIN_IMAGES.shade;
}

interface ZonnieMapProps {
  onSelect?: (item: ScoredTerrace) => void;
}

interface TerracePinProps {
  id: number;
  latitude: number;
  longitude: number;
  asset: PinAsset;
  title: string;
  description: string;
  onPress: () => void;
}

/**
 * Memoized marker. Re-renders only when its asset (score band) or coordinates
 * change. With 378 markers on screen and a time-change rebanding maybe 10–30
 * of them, this skips ~90% of native bridge traffic on time changes.
 *
 * Custom comparator ignores `onPress` because it's a fresh closure per render
 * — comparing function identity would force a re-render every parent render.
 */
const TerracePin = memo(
  function TerracePin({ latitude, longitude, asset, title, description, onPress }: TerracePinProps) {
    return (
      <Marker
        coordinate={{ latitude, longitude }}
        // Anchor: base of the spritz glass sits on the lat/lng. The v3
        // pin SVG has glyph from y=-38 to y=9 (47 units) within a 56-tall
        // viewBox, leaving 9 units of transparent space below the glass.
        // 47 / 56 ≈ 0.84 puts the lat/lng at the glass base, not the
        // bottom of the asset's bounding box.
        anchor={{ x: 0.5, y: 0.84 }}
        image={asset}
        // Accessibility (VoiceOver) — still useful even though we
        // suppress the visual callout below.
        title={title}
        description={description}
        // Single-tap → detail sheet. Earlier wiring used onCalloutPress,
        // which required two taps (marker → callout → drill-in) and felt
        // broken on-device — Andy reported "the info card does not open"
        // after the 1.0.0 build. Now `onPress` fires on the first tap.
        onPress={onPress}
      >
        {/*
          Empty Callout suppresses Apple Maps' default title+description
          tooltip. Without this, iOS still pops the callout on tap which
          competes with our detail sheet animation. We never want it.
        */}
        <Callout tooltip>
          <View />
        </Callout>
      </Marker>
    );
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.asset === next.asset &&
    prev.latitude === next.latitude &&
    prev.longitude === next.longitude &&
    prev.title === next.title &&
    prev.description === next.description,
);

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
  const mapRef = useRef<MapView>(null);
  const scored = useScoredTerraces();
  const selectedId = useSelectionStore((s) => s.selectedId);
  const panTo = useSelectionStore((s) => s.panTo);
  const clearPanTo = useSelectionStore((s) => s.clearPanTo);
  const userLoc = useUserLocation();

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
          'Location off',
          'Zonnie needs location to centre the map on you. Enable it in iOS Settings → Privacy → Location → Zonnie.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
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
      Alert.alert('Couldn’t get location', 'Try again in a moment.');
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

  // Cap visible markers at top-N by score. After importing ~750 venues
  // from the competitor list, the dataset jumped to 1100+ terraces and
  // rendering them all at city zoom is unusable. Top 200 covers nearly
  // every actually-good sun spot at any given hour and is scannable on
  // the full-Amsterdam view; user can filter (region/category/search/
  // favorites) to narrow further. The selected terrace is always
  // included even if it falls below the top-N.
  //
  // 200 is also well below the threshold (~30+ simultaneous mount
  // transactions) where the old `react-native-maps` 1.20.1 Fabric bug
  // tripped. Now on 1.27.2 we don't need that as much, but keeping
  // markers bounded is still good for native annotation perf.
  const MAX_MARKERS = 200;
  const markers = useMemo(() => {
    const top = scored.slice(0, MAX_MARKERS);
    const need = selectedId != null && !top.some((s) => s.terrace.id === selectedId);
    const list = need
      ? [...top, scored.find((s) => s.terrace.id === selectedId)].filter(
          (x): x is ScoredTerrace => !!x,
        )
      : top;
    return list.map(({ terrace, score }) => ({
      item: { terrace, score },
      asset:
        terrace.id === selectedId ? PIN_IMAGES.selected : pinAssetForScore(score),
    }));
  }, [scored, selectedId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={AMSTERDAM_REGION}
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
      >
        {markers.map(({ item, asset }) => (
          <TerracePin
            key={item.terrace.id}
            id={item.terrace.id}
            latitude={item.terrace.lat}
            longitude={item.terrace.lng}
            asset={asset}
            title={item.terrace.name}
            description={item.terrace.vibe}
            onPress={() => {
              haptics.light();
              onSelect?.(item);
            }}
          />
        ))}
      </MapView>
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
        accessibilityLabel="Centre map on my location"
        hitSlop={8}
      >
        <Text style={styles.locateGlyph}>⌖</Text>
      </Pressable>
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
});
