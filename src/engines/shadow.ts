/**
 * Shadow engine — given a terrace, the buildings around it, and the sun's
 * position, compute how much of the terrace's view of the sun is blocked.
 *
 * The original engine returned a binary `isInShadow` (true/false). With
 * many SW/W terraces sharing identical "not in shadow" outcomes at the
 * same hour, scores collapsed onto a handful of plateau values and
 * differentiation was poor. This version returns a continuous
 * `shadowCoverage` in [0, 1]:
 *   - 0.0  → nothing blocks the sun, full direct light
 *   - 1.0  → fully blocked
 *   - in between → partially blocked (e.g. building barely tall enough,
 *     or sitting just to the side of the sun direction)
 *
 * `isInShadow` is preserved as a thin wrapper that thresholds the
 * coverage at 0.5, so existing callers and tests still work.
 *
 * Geometry, per Andy's brief:
 *   1. For each candidate building, compute distance + bearing relative
 *      to the terrace.
 *   2. Reject buildings that aren't between terrace and sun (bearing far
 *      from sun azimuth).
 *   3. The building's *apparent* height from the terrace is
 *      `atan(height / distance)`. If that's >= the sun's altitude, the
 *      building's silhouette covers the sun. Slightly-shorter buildings
 *      contribute a partial block (penumbra + adjacent obstructions).
 *   4. Take the maximum block from any candidate. Adding multiple shadows
 *      doesn't double-darken — the sun is either visible or not.
 */

import type { Building } from './types';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const AMSTERDAM_LAT = 52.3676;

const METRES_PER_DEG_LNG = 111320 * Math.cos(AMSTERDAM_LAT * DEG);
const METRES_PER_DEG_LAT = 110540;

/** Buildings further than this are ignored even if very tall. */
const MAX_DISTANCE_M = 200;
/**
 * Buildings closer than this are treated as part of the terrace's own
 * structure (its host café, an attached awning, the back wall behind
 * the seating). They shouldn't shade the seating area in front of
 * them. Empirically, OSM places per-block centroids that can land
 * <10m from a Marathonweg terrace.
 */
const MIN_DISTANCE_M = 8;
/**
 * Angular tolerance applied OUTSIDE a building's geometric half-width
 * before its blocking contribution falls to zero. Models penumbra
 * and seating-area spatial extent.
 */
const SOFT_BUFFER_DEG = 5;
/**
 * Cap the geometric half-width contribution of a single building.
 * Without this, an OSM polygon centroid 8m away from a 14m-wide block
 * occupies 41° of the terrace's horizon — wide enough to "block" the
 * sun even when the sun is well off-axis from it. Cap at 15°: a
 * single building can never be "wider than 30°" from the terrace's
 * POV regardless of its real footprint. Wider blocks are typically
 * row-house terraces where the silhouette is broken up at street
 * level anyway.
 */
const MAX_HALF_WIDTH_DEG = 15;
/**
 * Below this ratio of (apparent building height / sun altitude), the
 * building can't physically block the sun. Above 1.0 it's a full block.
 * Between 0.8 and 1.0 we ramp linearly — covers near-edge cases where
 * the building barely peeks above the sun's path.
 */
const HEIGHT_RATIO_FLOOR = 0.8;

export function shadowLength(buildingHeight: number, sunAltitude: number): number {
  if (sunAltitude <= 0) return Infinity;
  return buildingHeight / Math.tan(sunAltitude * DEG);
}

export function shadowDirection(sunAzimuth: number): number {
  return (sunAzimuth + 180) % 360;
}

/**
 * Return [0, 1] — fraction of the sun's silhouette obstructed from the
 * terrace's vantage by the most-blocking nearby building. Caller
 * multiplies the sun score by `1 - k * coverage` for whatever
 * `k` matches their dynamic-range needs (we use 0.85 in scoring.ts).
 */
export function shadowCoverage(
  terrace: { lat: number; lng: number },
  buildings: Building[],
  sunAltitude: number,
  sunAzimuth: number,
): number {
  if (sunAltitude <= 0) return 1;
  if (buildings.length === 0) return 0;

  let maxCoverage = 0;

  for (const building of buildings) {
    const dx = (building.lng - terrace.lng) * METRES_PER_DEG_LNG;
    const dy = (building.lat - terrace.lat) * METRES_PER_DEG_LAT;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MAX_DISTANCE_M || distance < MIN_DISTANCE_M) continue;

    // Apparent height of the building's roofline as seen from the terrace.
    const angularHeight = Math.atan2(building.height, distance) * RAD;
    const heightRatio = angularHeight / sunAltitude;
    if (heightRatio < HEIGHT_RATIO_FLOOR) continue;

    // Smooth ramp from 0 (at heightRatio = HEIGHT_RATIO_FLOOR) to 1 (at >= 1).
    const heightFactor =
      heightRatio >= 1
        ? 1
        : (heightRatio - HEIGHT_RATIO_FLOOR) / (1 - HEIGHT_RATIO_FLOOR);

    // Bearing FROM TERRACE TO BUILDING in compass degrees (0=N, 90=E …).
    const angleToBuilding = (Math.atan2(dx, dy) * RAD + 360) % 360;

    // The building is between the terrace and the sun when the bearing
    // matches the sun's azimuth (NOT shadowDirection — see PR 2 fix).
    const angleDiff = Math.abs(angleToBuilding - sunAzimuth);
    const normalizedDiff = Math.min(angleDiff, 360 - angleDiff);

    const buildingWidth = building.width ?? 15;
    const angularHalfWidth = Math.min(
      MAX_HALF_WIDTH_DEG,
      Math.atan2(buildingWidth / 2, distance) * RAD,
    );

    if (normalizedDiff > angularHalfWidth + SOFT_BUFFER_DEG) continue;

    // Directional block: 1 inside the building's silhouette, ramping
    // linearly to 0 across SOFT_BUFFER_DEG outside it.
    const dirFactor =
      normalizedDiff <= angularHalfWidth
        ? 1
        : 1 - (normalizedDiff - angularHalfWidth) / SOFT_BUFFER_DEG;

    const coverage = heightFactor * dirFactor;
    if (coverage > maxCoverage) maxCoverage = coverage;
    if (maxCoverage >= 1) break; // can't get more shadowed than fully shadowed
  }

  return maxCoverage;
}

/**
 * Backwards-compatible binary check. Treats >= 0.5 coverage as "in
 * shadow". Existing callers (scoring engine + tests) keep working.
 */
export function isInShadow(
  terrace: { lat: number; lng: number },
  buildings: Building[],
  sunAltitude: number,
  sunAzimuth: number,
): boolean {
  if (sunAltitude <= 2) return true;
  return shadowCoverage(terrace, buildings, sunAltitude, sunAzimuth) >= 0.5;
}

/**
 * Procedurally generate buildings around a neighbourhood centroid.
 * Used as a last-resort fallback if no real building data is available
 * AND the per-terrace data is empty.
 */
export function generateBuildingsForArea(
  area: { lat: number; lng: number; density: number; avgHeight: number; radius?: number },
  rng: () => number,
): Building[] {
  const buildings: Building[] = [];
  const count = Math.floor(20 * area.density) + 6;
  const radius = area.radius ?? 0.006;

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius;
    buildings.push({
      lat: area.lat + Math.sin(angle) * dist,
      lng: area.lng + Math.cos(angle) * dist,
      height: Math.max(5, area.avgHeight + (rng() - 0.5) * 14),
      width: 8 + rng() * 20,
    });
  }

  return buildings;
}
