/**
 * Reverse-lookup: given a lat/lng (typically the map's current centre),
 * return the macro-region the user is most likely viewing.
 *
 * Used by the floating region pill on the map: as the user pans, the pill
 * updates to "Jordaan", "Centrum", etc. so they can tell which area they
 * are looking at without zooming in to read street labels.
 *
 * How:
 *   1. At module load, compute the centroid of each of the 6 macro
 *      regions by averaging lat/lng across every terrace whose
 *      `area` rolls up to that region. Done once — there are <1500
 *      terraces, so the loop is ~3ms.
 *   2. `regionForCoordinate(lat, lng)` finds the nearest region centroid
 *      using squared Euclidean distance (cheaper than haversine; over the
 *      scale of one city the small-angle approximation is well below the
 *      noise floor of "which region am I closest to").
 *
 * Centroid-based wins over polygon-based:
 *   - No need for actual region boundary geometry (we don't have it)
 *   - Stable behaviour at zoom-out (always picks SOME region)
 *   - The user-perceived centre of a region (where the terraces cluster)
 *     is more useful here than the geographic centroid would be —
 *     "I'm in Zuid" should mean "I'm near where Zuid's terraces are."
 *
 * Returns `null` only if the input is invalid (NaN), defensively.
 */

import terracesData from './terraces.json';
import { AREA_TO_REGION, REGIONS_ORDERED, type Region } from './regions';

interface Coord {
  lat: number;
  lng: number;
}

/** Per-region centroid, computed at module load from the terrace data. */
const REGION_CENTROIDS: Readonly<Record<Region, Coord>> = (() => {
  const sums: Record<string, { lat: number; lng: number; count: number }> = {};
  for (const t of terracesData as Array<{ lat: number; lng: number; area: string }>) {
    const region = AREA_TO_REGION[t.area];
    if (!region) continue;
    const bucket = (sums[region] ??= { lat: 0, lng: 0, count: 0 });
    bucket.lat += t.lat;
    bucket.lng += t.lng;
    bucket.count += 1;
  }
  const result = {} as Record<Region, Coord>;
  for (const region of REGIONS_ORDERED) {
    const bucket = sums[region];
    if (bucket && bucket.count > 0) {
      result[region] = { lat: bucket.lat / bucket.count, lng: bucket.lng / bucket.count };
    } else {
      // Fallback to Amsterdam city centre — should never hit because every
      // region has at least one terrace, but the type system can't know.
      result[region] = { lat: 52.3676, lng: 4.9041 };
    }
  }
  return result;
})();

/**
 * Find the macro-region whose centroid is nearest to the given coordinate.
 *
 * @returns the nearest region, or null if the input is invalid.
 */
export function regionForCoordinate(lat: number, lng: number): Region | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let bestRegion: Region | null = null;
  let bestDist = Infinity;
  for (const region of REGIONS_ORDERED) {
    const c = REGION_CENTROIDS[region];
    const dlat = c.lat - lat;
    const dlng = c.lng - lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < bestDist) {
      bestDist = dist;
      bestRegion = region;
    }
  }
  return bestRegion;
}

/**
 * Return the centroid of a region — used by the pill-tap interaction to
 * animate the map to that region's centre.
 */
export function centroidForRegion(region: Region): Coord {
  return REGION_CENTROIDS[region];
}
