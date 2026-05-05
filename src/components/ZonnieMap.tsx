import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { useSelectionStore } from '@/src/store/selectionStore';

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
  shade: require('@/assets/images/pins/shade.png'),
  selected: require('@/assets/images/pins/selected.png'),
} as const;

type PinAsset = typeof PIN_IMAGES[keyof typeof PIN_IMAGES];

/** Score → pin asset key. Mirrors the band thresholds in `engines/scoring.ts#scoreLabel`. */
function pinAssetForScore(score: number): PinAsset {
  if (score > 0.7) return PIN_IMAGES.full;
  if (score > 0.5) return PIN_IMAGES.mostly;
  if (score > 0.3) return PIN_IMAGES.partial;
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
        // Anchor x:0.5 y:1.0 — base of the T descender sits on the lat/lng,
        // matching the spec in brand-assets/docs/ASSET-SPECS.md.
        anchor={{ x: 0.5, y: 1 }}
        image={asset}
        title={title}
        description={description}
        // We previously set `tracksViewChanges={false}` here as a perf
        // optimization. That turned out to be the bug behind "pins
        // disappear when I change the time range" — for image markers,
        // tracksViewChanges=false tells iOS NOT to re-rasterize when the
        // `image` prop changes, which is exactly when a score-band
        // crossing should swap the pin asset. Markers went stale or
        // vanished. React.memo on this component already gates
        // unnecessary re-renders (via the comparator below), so leaving
        // tracksViewChanges at its default lets band crossings propagate
        // cleanly without excess bridge traffic.
        // iOS Apple Maps shows the callout on first tap; the callout itself
        // is what the user taps to drill in — that's `onCalloutPress`.
        onCalloutPress={onPress}
      />
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

  // Render every terrace in the active filter set — no top-N cap.
  //
  // The cap was tried twice and re-added each time hoping to reduce
  // "annotation churn during big time changes". It does the opposite:
  // a top-N-by-score slice makes the marker SET (which IDs render)
  // shift every time the time window changes, because terraces ranked
  // 95th–105th rotate in/out as scores rebalance. That's marker
  // mount/unmount on the iOS Apple Maps annotation bridge, which is
  // far more expensive than image-prop swaps on a stable set.
  //
  // Rendering the full filter set means the marker set only changes
  // when filters change (region/search), not when time changes. On
  // a time shift, only the ~10–30 markers that crossed a band
  // boundary swap their `image` prop — React.memo on TerracePin skips
  // the rest. This is the configuration that proved stable in the
  // earlier 378-static test (commit 29137f7 comment).
  const markers = useMemo(
    () =>
      scored.map(({ terrace, score }) => ({
        item: { terrace, score },
        asset:
          terrace.id === selectedId ? PIN_IMAGES.selected : pinAssetForScore(score),
      })),
    [scored, selectedId],
  );

  return (
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
          onPress={() => onSelect?.(item)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
