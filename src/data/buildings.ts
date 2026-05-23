/**
 * Building data for shadow ray-casting.
 *
 * Source priority (first wins):
 *   1. `src/data/buildings.json` — REAL buildings around each terrace,
 *      pre-computed by one of:
 *        - `python scripts/fetch-3dbag-buildings.py` (preferred — Dutch
 *          government 3D BAG registry, LIDAR-derived heights, accurate
 *          to ~0.5m); or
 *        - `npm run fetch-osm-buildings -- --apply` (fallback — OSM
 *          building polygons, ~6.5% have explicit height tags so most
 *          fall back to a 9m default).
 *
 *      Schema (same for both sources):
 *
 *        { "<terraceId>": [{ lat, lng, height, width }, ...], ... }
 *
 *      Stored per-terrace (top ~30 within 200m) so the shadow engine
 *      doesn't have to scan the full city dataset on every score
 *      recompute.
 *
 *   2. Procedural fallback — used when the JSON is empty (e.g. fresh
 *      checkout before the fetcher's been run). Places one building
 *      behind each terrace based on its `facing`, plus a sparse
 *      area-clustered set. Realistic enough that scores are non-zero
 *      but not the gold standard. Real OSM data is the production
 *      path.
 *
 * Why per-terrace pre-compute: the previous flat-array approach loops
 * every nearby building per shadow check; with ~50k Amsterdam buildings
 * that's prohibitive at 60Hz. Pre-computing the top ~30 within 200m at
 * build time is bounded (886 × 30 = 26.6k entries, ~2 MB JSON) and the
 * runtime check is constant-time per terrace.
 */

import type { Building, Facing, Terrace } from '@/src/engines/types';
import { generateBuildingsForArea } from '@/src/engines/shadow';
import { AREA_CENTROIDS } from './areas';
import { TERRACES } from './terraces';

// Populated by `npm run fetch-osm-buildings -- --apply`. Keyed by
// stringified terrace id; value is the pre-computed nearby-building
// list for that terrace.
let buildingsByTerrace: Record<string, Building[]> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require('./buildings.json');
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw)) {
      // Old flat-array shape — treat as empty for this code path.
      // (Anyone updating from an older build will overwrite via the
      // fetcher script.)
      buildingsByTerrace = null;
    } else {
      buildingsByTerrace = raw as Record<string, Building[]>;
    }
  }
} catch {
  // buildings.json missing — fall through to procedural fallback.
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

const BUILDING_BEARING: Record<Facing, number | null> = {
  S: 0,
  SW: 45,
  W: 90,
  NW: 135,
  N: 180,
  NE: 225,
  E: 270,
  SE: 315,
  All: null,
};

interface NeighborhoodHints {
  density: number;
  avgHeight: number;
}

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

function generatePerTerraceBuildings(rng: () => number): Building[] {
  const buildings: Building[] = [];
  for (const t of TERRACES) {
    const bearing = BUILDING_BEARING[t.facing];
    if (bearing == null) continue;

    const hints = nearestCentroidHints(t.lat, t.lng);
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
  for (const area of AREA_CENTROIDS) {
    buildings.push(...generateBuildingsForArea(area, rng));
  }
  buildings.push(...generatePerTerraceBuildings(rng));
  return buildings;
}

// ── Public API ──────────────────────────────────────────────────────────────

let flatCache: Building[] | null = null;
let perTerraceCache: Map<number, Building[]> | null = null;

function ensureCaches(): void {
  if (flatCache && perTerraceCache) return;

  if (
    buildingsByTerrace &&
    Object.keys(buildingsByTerrace).length > 0
  ) {
    perTerraceCache = new Map();
    const allBuildings: Building[] = [];
    for (const [k, list] of Object.entries(buildingsByTerrace)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      // Filter out zero-height buildings — 3D BAG occasionally returns
      // flat structures (pavements, tiny sheds) with h=0. They can't
      // cast a shadow so there's no value in keeping them, and they
      // break the `height > 0` invariant the shadow engine relies on.
      const valid = list.filter((b) => b.height > 0 && (b.width ?? 0) > 0);
      perTerraceCache.set(id, valid);
      // Flat-cache is the union — used by tests and validator that want
      // a global view. De-duplication isn't worth the complexity here.
      allBuildings.push(...valid);
    }
    flatCache = allBuildings;
  } else {
    // Procedural fallback: build flat list, then index by nearest terrace
    // for the per-terrace API.
    flatCache = generateFallbackBuildings();
    perTerraceCache = new Map();
    for (const t of TERRACES) {
      const nearby: Building[] = [];
      for (const b of flatCache) {
        const dy = (b.lat - t.lat) * M_PER_DEG_LAT;
        const dx = (b.lng - t.lng) * M_PER_DEG_LNG;
        const d2 = dx * dx + dy * dy;
        if (d2 < 200 * 200) nearby.push(b);
      }
      perTerraceCache.set(t.id, nearby);
    }
  }
}

/**
 * All buildings the engine knows about. Useful for tooling that wants a
 * global view (validators, debug scripts). Per-frame scoring should use
 * `getBuildingsForTerrace` instead — much cheaper.
 */
export function getBuildings(): Building[] {
  ensureCaches();
  return flatCache!;
}

/**
 * Buildings nearby to a specific terrace (top ~30 within 200m when
 * data is real; all in-radius when procedural). The runtime hot path —
 * each scored hour calls this once per terrace.
 */
export function getBuildingsForTerrace(terraceId: number): Building[] {
  ensureCaches();
  return perTerraceCache!.get(terraceId) ?? [];
}

/** Returns true if real OSM data is loaded (vs the procedural fallback). */
export function isUsingRealBuildingData(): boolean {
  return (
    buildingsByTerrace != null &&
    Object.keys(buildingsByTerrace).length > 0
  );
}

/** Test-only: reset the cache. */
export function _resetBuildingsCache(): void {
  flatCache = null;
  perTerraceCache = null;
}
