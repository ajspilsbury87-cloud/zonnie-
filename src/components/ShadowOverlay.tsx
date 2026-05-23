/**
 * ShadowOverlay — Pro map layer that renders building shadow polygons
 * at the current visit-window midpoint hour.
 *
 * Rendered INSIDE react-native-maps `<MapView>` as sibling(s) to the
 * terrace `<Marker>` elements. react-native-maps composites all child
 * overlays natively, so there's no extra RN view tree overhead.
 *
 * Data flow:
 *   TimeRangeScrubber  → shadowStore.shadowEnabled  (toggle)
 *   timeStore          → fromHour + toHour          (display time)
 *   ZonnieMap          → mapRegion prop             (viewport culling)
 *   buildings.ts       → getBuildings()             (footprint data)
 *
 * Performance:
 *   - Viewport bbox pre-filter rejects buildings outside the visible
 *     map tile set — typical city-zoom pass is ≤ 100 buildings.
 *   - Deduplication by rounded (lat, lng) key prevents the same
 *     3D BAG building appearing as multiple polygons (it's stored once
 *     per terrace in buildings.json, so can repeat ~30×).
 *   - Hard cap at MAX_POLYGONS = 150 so the native layer stays bounded.
 *   - Skips buildings without `poly` data (centroid-only fallback).
 *   - Only re-computes when viewport, time window, or toggle changes
 *     (useMemo + shadowEnabled guard).
 *   - Only renders when zoomed in enough (latDelta < ZOOM_THRESHOLD)
 *     — at city-zoom, individual building shadows are < 2px and
 *     create visual noise rather than insight.
 */

import { memo, useMemo } from 'react';
import { Polygon, type Region } from 'react-native-maps';

import { getBuildings } from '@/src/data/buildings';
import { computeShadowPolygon } from '@/src/engines/shadow';
import { solarPosition } from '@/src/engines/solar';
import { amsterdamLocalToUtc, AMSTERDAM_LAT, AMSTERDAM_LNG } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useShadowStore } from '@/src/store/shadowStore';
import { usePurchaseStore } from '@/src/store/purchaseStore';

/** Maximum number of shadow polygons rendered simultaneously. */
const MAX_POLYGONS = 150;

/**
 * Latitude-delta threshold below which the overlay is shown. 0.025 ≈
 * ~2.8 km vertical span — neighbourhood zoom or closer. Above this the
 * polygons are too small to be meaningful and the overlay would look
 * like mud.
 */
const ZOOM_THRESHOLD = 0.025;

/**
 * Extra degrees added to each viewport edge when filtering buildings.
 * 0.012 ≈ ~1.3 km buffer on each side. Buildings near the edge of the
 * screen cast shadows that may extend INTO the viewport even though the
 * building itself is slightly off-screen.
 */
const VIEWPORT_BUFFER_DEG = 0.012;

/**
 * Shadow polygon fill: semi-transparent ink-blue. 0.20 opacity is dark
 * enough to read clearly over map tiles but light enough that street
 * names and POI icons remain visible underneath.
 */
const SHADOW_FILL = 'rgba(10, 10, 40, 0.20)';
/** No stroke — the polygon edges on a real shadow are penumbra, not sharp lines. */
const SHADOW_STROKE = 'rgba(10, 10, 40, 0.00)';

interface ShadowOverlayProps {
  /** Current map viewport, updated after each pan/zoom settle. */
  mapRegion: Region;
}

export const ShadowOverlay = memo(function ShadowOverlay({ mapRegion }: ShadowOverlayProps) {
  const isPro = usePurchaseStore((s) => s.isPro);
  const shadowEnabled = useShadowStore((s) => s.shadowEnabled);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const dateOffset = useTimeStore((s) => s.dateOffset);

  const polygons = useMemo(() => {
    // Guard: feature off, not Pro, or zoomed out too far.
    if (!isPro || !shadowEnabled) return [];
    if (mapRegion.latitudeDelta > ZOOM_THRESHOLD) return [];

    // Use the midpoint of the visit window as the shadow-display time.
    // Both hours are Amsterdam local; we round to the nearest integer so
    // the display time matches a slot the user recognises from the chip.
    const displayHour = Math.round((fromHour + toHour) / 2);
    const dateStr = selectedDateStr(dateOffset);
    const utcDate = amsterdamLocalToUtc(dateStr, displayHour);

    // Amsterdam centroid for sun position (the variation across the city
    // is < 0.1° azimuth — not worth per-building computation).
    const sun = solarPosition(utcDate, AMSTERDAM_LAT, AMSTERDAM_LNG);
    if (sun.altitude <= 0) return [];

    // Viewport bounding box with buffer (buildings near the edge may cast
    // shadows into the viewport even if their centroid is off-screen).
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2 - VIEWPORT_BUFFER_DEG;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2 + VIEWPORT_BUFFER_DEG;
    const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2 - VIEWPORT_BUFFER_DEG;
    const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2 + VIEWPORT_BUFFER_DEG;

    const buildings = getBuildings();
    // Dedup key: rounds to ~11 m precision. Same building can appear in
    // multiple terrace lists (buildings.json stores per-terrace subsets).
    const seen = new Set<string>();
    const result: { latitude: number; longitude: number }[][] = [];

    for (const building of buildings) {
      if (result.length >= MAX_POLYGONS) break;
      if (!building.poly) continue;
      // Centroid inside buffered viewport
      if (
        building.lat < minLat || building.lat > maxLat ||
        building.lng < minLng || building.lng > maxLng
      ) continue;
      // Dedup
      const key = `${Math.round(building.lat * 1e4)},${Math.round(building.lng * 1e4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const poly = computeShadowPolygon(building, sun.altitude, sun.azimuth);
      if (poly) result.push(poly);
    }

    return result;
  }, [isPro, shadowEnabled, mapRegion, fromHour, toHour, dateOffset]);

  if (!isPro || !shadowEnabled || polygons.length === 0) return null;

  return (
    <>
      {polygons.map((coordinates, i) => (
        <Polygon
          // Index key is stable for a given polygons array — the array is
          // fully recomputed when any input changes, so stale identity
          // is never a problem here.
          key={i}
          coordinates={coordinates}
          fillColor={SHADOW_FILL}
          strokeColor={SHADOW_STROKE}
          strokeWidth={0}
        />
      ))}
    </>
  );
});
