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
 * Geometry:
 *   1. For each candidate building, compute distance + bearing relative
 *      to the terrace.
 *   2. Reject buildings outside MAX_DISTANCE_M or inside MIN_DISTANCE_M.
 *   3. Height check: `atan(height / distance)` gives the building's
 *      apparent angular height. If below the sun's altitude (scaled by
 *      HEIGHT_RATIO_FLOOR), the building can't block the sun.
 *   4. Angular / directional check:
 *      – Buildings WITH poly data: compute the exact angular silhouette
 *        using all convex-hull vertex bearings. No artificial width padding.
 *        A PENUMBRA_DEG (1°) soft edge models the narrow transition zone.
 *        This correctly preserves gaps between adjacent buildings.
 *      – Buildings WITHOUT poly (centroid fallback): use centroid bearing +
 *        approximate half-width from `building.width`, capped at
 *        MAX_HALF_WIDTH_DEG, with SOFT_BUFFER_DEG (5°) tolerance.
 *   5. Final coverage = heightFactor × dirFactor.  Take maximum across
 *      all buildings (shadows don't stack — the sun is either visible or not).
 */

import type { Building, Tree } from './types';

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
 * Below this ratio of (apparent building height / sun altitude), the
 * building can't physically block the sun. Above 1.0 it's a full block.
 * Between HEIGHT_RATIO_FLOOR and 1.0 we ramp linearly — covers near-edge
 * cases where the building barely peeks above the sun's path.
 */
const HEIGHT_RATIO_FLOOR = 0.8;
/**
 * Soft penumbra width (degrees) applied at each edge of a polygon
 * building's silhouette. 1° ≈ 1.1 m at 60 m distance — models the narrow
 * transition zone where the building partially occludes the sun disc.
 * Much smaller than the old SOFT_BUFFER_DEG (5°) which was needed to
 * compensate for centroid inaccuracy; polygon edges are exact.
 */
const PENUMBRA_DEG = 1;
/**
 * Angular tolerance applied OUTSIDE a centroid-based building's geometric
 * half-width before its blocking contribution falls to zero. Models penumbra
 * and seating-area spatial extent. Only used for buildings without poly data.
 */
const SOFT_BUFFER_DEG = 5;
/**
 * Cap the geometric half-width contribution of a centroid-based building.
 * Without this, a centroid 8 m away from a 14 m-wide block occupies 41° of
 * the terrace's horizon. Only used for buildings without poly data.
 */
const MAX_HALF_WIDTH_DEG = 15;

// ── Polygon silhouette helpers ────────────────────────────────────────────────

/**
 * Compute the angular span (clockwise arc) of a building's polygon footprint
 * as seen from `terrace`. Uses the maximum-gap algorithm: sort vertex bearings,
 * find the largest empty arc, the silhouette is its complement.
 *
 * Returns `null` for degenerate inputs (< 2 vertices, or observer inside the
 * building footprint where the max gap would be < 180°, or all vertices
 * collinear with observer giving a 360° gap).
 */
function polyAngularSpan(
  terrace: { lat: number; lng: number },
  poly: [number, number][],
): { start: number; end: number } | null {
  if (poly.length < 2) return null;

  // Bearing from terrace to each hull vertex (0 = N, 90 = E, clockwise).
  const bearings = poly
    .map(([lat, lng]) => {
      const dx = (lng - terrace.lng) * METRES_PER_DEG_LNG;
      const dy = (lat - terrace.lat) * METRES_PER_DEG_LAT;
      return (Math.atan2(dx, dy) * RAD + 360) % 360;
    })
    .sort((a, b) => a - b);

  // Find the maximum gap between consecutive sorted bearings (wraparound included).
  // The building's silhouette occupies the complement of the largest gap.
  let maxGap = 0;
  let maxGapAfterIdx = 0; // index of the first bearing AFTER the max gap

  for (let i = 0; i < bearings.length; i++) {
    const nextIdx = (i + 1) % bearings.length;
    const gap =
      nextIdx === 0
        ? bearings[0]! + 360 - bearings[bearings.length - 1]! // wrap-around gap
        : bearings[nextIdx]! - bearings[i]!;
    if (gap > maxGap) {
      maxGap = gap;
      maxGapAfterIdx = nextIdx;
    }
  }

  // max gap < 180° → observer is inside the building (shouldn't happen in practice).
  // max gap ≥ 359° → all vertices project to the same bearing (degenerate).
  if (maxGap < 180 || maxGap >= 359) return null;

  const start = bearings[maxGapAfterIdx]!;
  const end = bearings[(maxGapAfterIdx - 1 + bearings.length) % bearings.length]!;
  return { start, end };
}

/**
 * Signed angular margin of `azimuth` relative to the clockwise arc [start, end].
 * Negative → azimuth is INSIDE the arc (building fully covers the sun direction).
 * Positive → azimuth is OUTSIDE; magnitude = degrees to the nearest arc edge.
 */
function arcMargin(start: number, end: number, azimuth: number): number {
  const inside = arcContains(start, end, azimuth);
  const toStart = angularDiff(azimuth, start);
  const toEnd = angularDiff(azimuth, end);
  const nearEdge = Math.min(toStart, toEnd);
  return inside ? -nearEdge : nearEdge;
}

/** Minimum circular angular distance between two compass bearings (result 0–180°). */
function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Is `azimuth` within the clockwise arc from `start` to `end`? */
function arcContains(start: number, end: number, azimuth: number): boolean {
  if (start <= end) return azimuth >= start && azimuth <= end;
  return azimuth >= start || azimuth <= end; // arc crosses the 0°/360° boundary
}

// ── Public API ────────────────────────────────────────────────────────────────

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

    let dirFactor: number;

    if (building.poly && building.poly.length >= 3) {
      // ── Polygon path: exact angular silhouette from convex-hull vertices ──
      // No SOFT_BUFFER padding — polygon edges are exact. A 1° penumbra
      // models the soft transition at building edges.
      const span = polyAngularSpan(terrace, building.poly);
      if (span === null) continue;

      const margin = arcMargin(span.start, span.end, sunAzimuth);
      // margin ≤ 0: sun is inside the building silhouette → fully blocked.
      // margin in (0, PENUMBRA_DEG]: penumbra zone → linear ramp to 0.
      // margin > PENUMBRA_DEG: sun is clear of the building → skip.
      if (margin > PENUMBRA_DEG) continue;
      dirFactor = margin <= 0 ? 1 : 1 - margin / PENUMBRA_DEG;
    } else {
      // ── Centroid fallback: approximate angular half-width from building.width ──
      // Used when poly data is absent (legacy buildings.json or generated fallback).
      const angleToBuilding = (Math.atan2(dx, dy) * RAD + 360) % 360;
      const angleDiff = Math.abs(angleToBuilding - sunAzimuth);
      const normalizedDiff = Math.min(angleDiff, 360 - angleDiff);

      const buildingWidth = building.width ?? 15;
      const angularHalfWidth = Math.min(
        MAX_HALF_WIDTH_DEG,
        Math.atan2(buildingWidth / 2, distance) * RAD,
      );

      if (normalizedDiff > angularHalfWidth + SOFT_BUFFER_DEG) continue;

      dirFactor =
        normalizedDiff <= angularHalfWidth
          ? 1
          : 1 - (normalizedDiff - angularHalfWidth) / SOFT_BUFFER_DEG;
    }

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
 * Tree-canopy counterpart to `shadowCoverage`. Models each tree as a vertical
 * cylinder: the crown subtends a circular arc as seen from the terrace, and
 * blocks the sun if the sun azimuth falls inside that arc and the crown is
 * tall enough relative to the sun's altitude.
 *
 * Height check: uses (tree.height - tree.trunkHeight) as the effective
 * blocking height — the bare trunk below the crown is transparent. If
 * trunkHeight is absent, the full tree height is used (conservative).
 *
 * Angular check: half-span = atan(crownRadius / distance). Same PENUMBRA_DEG
 * soft edge as the polygon building path.
 *
 * Returns [0, 1] — same contract as `shadowCoverage`. Combine the two results
 * with `Math.max` in the scoring engine.
 */
export function treeShadowCoverage(
  terrace: { lat: number; lng: number },
  trees: Tree[],
  sunAltitude: number,
  sunAzimuth: number,
): number {
  if (sunAltitude <= 0) return 1;
  if (trees.length === 0) return 0;

  let maxCoverage = 0;

  for (const tree of trees) {
    const dx = (tree.lng - terrace.lng) * METRES_PER_DEG_LNG;
    const dy = (tree.lat - terrace.lat) * METRES_PER_DEG_LAT;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MAX_DISTANCE_M || distance < MIN_DISTANCE_M) continue;

    // Only the crown (above trunk) blocks the sun — the bare trunk is transparent.
    const effectiveHeight =
      tree.trunkHeight != null ? tree.height - tree.trunkHeight : tree.height;
    if (effectiveHeight <= 0) continue;

    const angularHeight = Math.atan2(effectiveHeight, distance) * RAD;
    const heightRatio = angularHeight / sunAltitude;
    if (heightRatio < HEIGHT_RATIO_FLOOR) continue;

    const heightFactor =
      heightRatio >= 1
        ? 1
        : (heightRatio - HEIGHT_RATIO_FLOOR) / (1 - HEIGHT_RATIO_FLOOR);

    // Circular arc silhouette: half-span = atan(crownRadius / distance).
    const bearing = (Math.atan2(dx, dy) * RAD + 360) % 360;
    const halfSpan = Math.atan2(tree.crownRadius, distance) * RAD;
    const start = (bearing - halfSpan + 360) % 360;
    const end = (bearing + halfSpan) % 360;

    const margin = arcMargin(start, end, sunAzimuth);
    if (margin > PENUMBRA_DEG) continue;
    const dirFactor = margin <= 0 ? 1 : 1 - margin / PENUMBRA_DEG;

    const coverage = heightFactor * dirFactor;
    if (coverage > maxCoverage) maxCoverage = coverage;
    if (maxCoverage >= 1) break;
  }

  return maxCoverage;
}

/** Maximum projected shadow length for map overlay rendering (metres).
 * At very low sun altitudes (< 3°) shadow lengths exceed city blocks.
 * Capping at 150 m keeps the overlay readable at neighbourhood zoom
 * without distorting the visual at higher altitudes where the cap never
 * activates (e.g. at 10°, a 10 m building casts a 57 m shadow). */
const MAX_SHADOW_OVERLAY_M = 150;

/**
 * Compute the ground-projected shadow polygon for a building with polygon
 * footprint data. Returns an array of `{latitude, longitude}` coordinate
 * objects suitable for react-native-maps `<Polygon coordinates={…} />`.
 *
 * Algorithm:
 *   1. Shadow direction  = (sunAzimuth + 180) % 360  [opposite of sun]
 *   2. Shadow length     = min(height / tan(altitude), MAX_SHADOW_OVERLAY_M)
 *   3. Offset in WGS84  = (dLng, dLat) computed from the shadow vector
 *   4. Shadow polygon   = original footprint vertices (forward) +
 *                          shadow-offset vertices (reversed)
 *      → traces the outer boundary of the shadow volume in a single
 *        closed path; react-native-maps fills the enclosed area.
 *
 * Returns `null` when the sun is below the horizon, when the building
 * has no polygon data (centroid-only fallback buildings), or when the
 * building is fewer than 3 vertices (degenerate).
 *
 * The caller is responsible for deduplication and viewport culling —
 * this function is pure and stateless.
 */
export function computeShadowPolygon(
  building: Building,
  sunAltitude: number,
  sunAzimuth: number,
): { latitude: number; longitude: number }[] | null {
  if (sunAltitude <= 0) return null;
  if (!building.poly || building.poly.length < 3) return null;

  const shadowDirRad = ((sunAzimuth + 180) % 360) * DEG;
  const rawLen = building.height / Math.tan(sunAltitude * DEG);
  const shadowLen = Math.min(rawLen, MAX_SHADOW_OVERLAY_M);

  // Convert shadow vector from metres to WGS84 degree offsets.
  const dLng = (shadowLen * Math.sin(shadowDirRad)) / METRES_PER_DEG_LNG;
  const dLat = (shadowLen * Math.cos(shadowDirRad)) / METRES_PER_DEG_LAT;

  const poly = building.poly; // [[lat, lng], …]
  const original = poly.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
  // Shadow-tip vertices = original footprint shifted in shadow direction.
  const shadow = poly.map(([lat, lng]) => ({
    latitude: lat + dLat,
    longitude: lng + dLng,
  }));

  // Union polygon: forward through original footprint + backward through the
  // shadow footprint. For a convex hull (which `poly` already is, per the 3D
  // BAG fetcher), this traces the exact outer boundary of the shadow volume.
  return [...original, ...shadow.reverse()];
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
