/**
 * Building data for shadow ray-casting.
 *
 * Source priority (first wins):
 *   1. `src/data/buildings.json` — real 3D BAG footprints, when fetched
 *      (`python scripts/fetch-3dbag-buildings.py`). Currently incomplete:
 *      the OGC API returns CityJSON with relative vertex coords that need
 *      a tile transform we haven't decoded yet. Tracked separately.
 *   2. Procedural fallback below — generates a tall building immediately
 *      BEHIND each terrace based on its `facing` direction, plus a sparse
 *      set of additional area-clustered buildings for variety.
 *
 * Why per-terrace adjacent buildings: the prior fallback scattered random
 * buildings within 670m of neighborhood centroids, with zero relationship
 * to actual terrace positions. Result: 0% of terraces ever fell into a
 * building's shadow at any time of day, so the shadow engine produced no
 * variation between terraces. Score variance collapsed.
 *
 * The new model exploits the `facing` field as a hint about the urban
 * geometry: a south-facing terrace opens to the south, which means there's
 * a building behind it (to the north). Placing a building immediately
 * north of a south-facing terrace creates physically realistic shadows —
 * the building blocks the sun whenever the sun is north of due-east-west
 * (i.e., never in northern-hemisphere midsummer noon, but yes in winter
 * mornings/evenings). This produces realistic time-varying shadow
 * patterns that the engine can ray-cast against.
 */

import type { Building, Facing, Terrace } from '@/src/engines/types';
import { generateBuildingsForArea } from '@/src/engines/shadow';
import { AREA_CENTROIDS } from './areas';
import { TERRACES } from './terraces';

// Populated by fetch-3dbag-buildings.py. Empty until that script is run.
let bag3dBuildings: Building[] | null = null;
try {
  // Dynamic require so the app doesn't crash if the file doesn't exist yet.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bag3dBuildings = require('./buildings.json') as Building[];
} catch {
  // buildings.json not yet fetched — fall back to procedural generation below.
}

// ── Procedural fallback ─────────────────────────────────────────────────────

/** Lehmer (Park-Miller) LCG — deterministic seed for reproducible builds. */
function makeRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);

/**
 * Compass bearing of the building relative to the terrace (degrees from
 * north, clockwise) for each terrace facing. The building sits OPPOSITE
 * the facing — a south-facing terrace has a building to its north (0°);
 * a west-facing terrace has a building to its east (90°); etc.
 */
const BUILDING_BEARING: Record<Facing, number | null> = {
  S: 0, // building to north of S-facing terrace
  SW: 45, // NE
  W: 90, // E
  NW: 135, // SE
  N: 180, // S
  NE: 225, // SW
  E: 270, // W
  SE: 315, // NW
  All: null, // rooftop / square — no adjacent building
};

interface NeighborhoodHints {
  density: number;
  avgHeight: number;
}

/** Find the nearest centroid for height/density hints. */
function nearestCentroidHints(lat: number, lng: number): NeighborhoodHints {
  let best: (typeof AREA_CENTROIDS)[number] | null = null;
  let bestDist = Infinity;
  for (const c of AREA_CENTROIDS) {
    const dy = (c.lat - lat) * M_PER_DEG_LAT;
    const dx = (c.lng - lng) * M_PER_DEG_LNG;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best ?? { density: 0.4, avgHeight: 14 };
}

/**
 * Place a building 12m behind each terrace in its facing-opposite direction,
 * at neighborhood-typical height. Adds a smaller secondary building 25m
 * away for additional shadow variety in narrow-street terraces.
 */
function generatePerTerraceBuildings(rng: () => number): Building[] {
  const buildings: Building[] = [];
  for (const t of TERRACES) {
    const bearing = BUILDING_BEARING[t.facing];
    if (bearing == null) continue; // 'All' = no adjacent building

    const hints = nearestCentroidHints(t.lat, t.lng);
    // Primary building 8–14m behind, 4–7 stories tall.
    const primaryDist = 8 + rng() * 6;
    const bearingRad = (bearing * Math.PI) / 180;
    const dyMeters = Math.cos(bearingRad) * primaryDist;
    const dxMeters = Math.sin(bearingRad) * primaryDist;
    buildings.push({
      lat: t.lat + dyMeters / M_PER_DEG_LAT,
      lng: t.lng + dxMeters / M_PER_DEG_LNG,
      height: Math.max(8, hints.avgHeight + (rng() - 0.3) * 8),
      width: 12 + rng() * 16,
    });

    // Secondary building offset 30° from the primary, 18–30m away. Adds
    // partial shadowing at oblique sun angles (mid-morning / mid-afternoon).
    const offsetBearing = bearing + (rng() < 0.5 ? -30 : 30);
    const offRad = (offsetBearing * Math.PI) / 180;
    const secDist = 18 + rng() * 12;
    buildings.push({
      lat: t.lat + (Math.cos(offRad) * secDist) / M_PER_DEG_LAT,
      lng: t.lng + (Math.sin(offRad) * secDist) / M_PER_DEG_LNG,
      height: Math.max(6, hints.avgHeight + (rng() - 0.5) * 10),
      width: 8 + rng() * 14,
    });
  }
  return buildings;
}

function generateFallbackBuildings(): Building[] {
  const rng = makeRng(42);
  const buildings: Building[] = [];
  // Original area-clustered set kept for ambient variety.
  for (const area of AREA_CENTROIDS) {
    buildings.push(...generateBuildingsForArea(area, rng));
  }
  buildings.push(...generatePerTerraceBuildings(rng));
  return buildings;
}

// ── Public API ──────────────────────────────────────────────────────────────

let cached: Building[] | null = null;

/**
 * Returns the building set used by the shadow engine.
 *
 * Uses real 3D BAG data if buildings.json has been fetched; otherwise falls
 * back to the per-terrace procedural set above.
 */
export function getBuildings(): Building[] {
  if (cached) return cached;
  const real = bag3dBuildings && bag3dBuildings.length > 0 ? bag3dBuildings : null;
  cached = real ?? generateFallbackBuildings();
  return cached;
}

/** Returns true if real 3D BAG data is loaded (vs the procedural fallback). */
export function isUsingRealBuildingData(): boolean {
  return bag3dBuildings !== null && bag3dBuildings.length > 0;
}

/** Test-only: reset the cache. */
export function _resetBuildingsCache(): void {
  cached = null;
}
