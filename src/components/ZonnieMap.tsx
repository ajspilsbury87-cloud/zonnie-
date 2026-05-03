import { useEffect, useMemo, useRef } from 'react';
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
 * Cap on how many markers we ever render at once.
 *
 * Background: re-rendering markers on every map region change crashes Apple
 * Maps + Expo Go SDK 54. So we never track region. But 378 static pins
 * overlapping at city zoom is also visually unusable. Compromise: render at
 * most the top-N by current sun score.
 *
 * 50 covers nearly every actually-good sun spot at any given hour and is
 * scannable across the full Amsterdam region.
 */
const MAX_MARKERS = 50;

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

/** Score → pin asset key. Mirrors the band thresholds in `engines/scoring.ts#scoreLabel`. */
function pinAssetForScore(score: number) {
  if (score > 0.7) return PIN_IMAGES.full;
  if (score > 0.5) return PIN_IMAGES.mostly;
  if (score > 0.3) return PIN_IMAGES.partial;
  return PIN_IMAGES.shade;
}

interface ZonnieMapProps {
  onSelect?: (item: ScoredTerrace) => void;
}

/**
 * Score-themed terrace markers (Zonnie brand pins) without app-side
 * clustering. Markers use the `image` prop with pre-rasterized PNGs —
 * Apple Maps handles bitmap annotations efficiently, unlike custom-view
 * annotations which previously crashed on iOS under churn.
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

  const markers = useMemo(() => {
    const top = scored.slice(0, MAX_MARKERS);
    if (selectedId == null) return top;
    if (top.some((s) => s.terrace.id === selectedId)) return top;
    const extra = scored.find((s) => s.terrace.id === selectedId);
    return extra ? [...top, extra] : top;
  }, [scored, selectedId]);

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
      {markers.map(({ terrace, score }) => {
        const isSelected = terrace.id === selectedId;
        return (
          <Marker
            key={terrace.id}
            coordinate={{ latitude: terrace.lat, longitude: terrace.lng }}
            // Anchor x:0.5 y:1.0 — base of the T descender sits on the lat/lng,
            // matching the spec in brand-assets/docs/ASSET-SPECS.md.
            anchor={{ x: 0.5, y: 1 }}
            image={isSelected ? PIN_IMAGES.selected : pinAssetForScore(score)}
            title={terrace.name}
            description={terrace.vibe}
            // iOS Apple Maps shows the callout on first tap (no listener fires
            // for "open detail"). The callout itself is what the user taps to
            // drill in — that's what `onCalloutPress` is for.
            onCalloutPress={() => onSelect?.({ terrace, score })}
          />
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
