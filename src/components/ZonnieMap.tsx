import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
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
        // For static-image markers there's nothing for the native side to
        // re-rasterize on every render — `tracksViewChanges={false}` skips
        // the bridge update entirely. Image prop changes still propagate.
        tracksViewChanges={false}
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
export function ZonnieMap({ onSelect }: ZonnieMapProps) {
  const mapRef = useRef<MapView>(null);
  const scored = useScoredTerraces();
  const selectedId = useSelectionStore((s) => s.selectedId);
  const panTo = useSelectionStore((s) => s.panTo);
  const clearPanTo = useSelectionStore((s) => s.clearPanTo);

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

  // Render every terrace in the active filter set. Cap removed — with the
  // memoization stack above, ~378 static image markers run smoothly on the
  // native iOS build (proven stable in earlier 378-static test).
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
      showsUserLocation={false}
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
