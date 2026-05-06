#!/usr/bin/env tsx
/**
 * Fetch real OSM building data for Amsterdam, with height information,
 * and pre-compute the nearest ~30 buildings within 200m of every terrace.
 *
 * Replaces the procedural fallback in `src/data/buildings.ts`. With one
 * synthetic building per terrace (always BEHIND it), the shadow engine
 * could only detect shadows when the sun was on the building-side of
 * the terrace — typically morning for W-facing, evening for E-facing.
 * Mid-afternoon shadows from across-the-street and side buildings were
 * invisible. That made every SW/W terrace clamp at the same top score.
 *
 * Pipeline:
 *   1. Tiled Overpass query (`way["building"]`) covering the Amsterdam
 *      bbox, in 3km cells (180s timeout, 50MB response cap on the
 *      public instance).
 *   2. For each building way, compute centroid + estimate height:
 *        - `height` tag (metres, optionally with units) → parse
 *        - `building:levels` × 3m → fallback
 *        - Neither → 12m default (4-story average for Amsterdam)
 *   3. For each terrace, find the 30 nearest buildings within 200m via
 *      a coarse spatial grid (100m cells).
 *   4. Write `src/data/buildings.json` keyed by terrace id:
 *        { "1": [{lat, lng, height, width}, ...], "2": [...], ... }
 *
 * Width is approximated as sqrt(footprint area) — good enough for the
 * angular-width tolerance the shadow engine uses, without dragging full
 * polygons into the runtime bundle.
 *
 * Usage (PowerShell):
 *   npm run fetch-osm-buildings -- --dry-run         # don't write file
 *   npm run fetch-osm-buildings -- --apply
 *   npm run fetch-osm-buildings -- --apply --refetch # ignore tile cache
 *
 * Public Overpass: be polite. Tiles are cached so subsequent runs reuse
 * the response. Total time ~5-15 min on a fresh fetch (Amsterdam has
 * ~250k buildings, but tiles trickle through fine).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { Terrace } from '../src/engines/types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const OUT_PATH = join(PROJECT_ROOT, 'src', 'data', 'buildings.json');
const CACHE_DIR = join(PROJECT_ROOT, 'scripts', 'competitor-research');
const CACHE_PATH = join(CACHE_DIR, 'osm-buildings-with-heights.json');

const AMSTERDAM_BBOX = {
  minLat: 52.27,
  maxLat: 52.45,
  minLng: 4.7,
  maxLng: 5.05,
};

const TILE_LAT_STEP = 0.027; // ~3km
const TILE_LNG_STEP = 0.045;

const NEARBY_RADIUS_M = 200; // shadow engine ignores buildings further than this anyway
const MAX_NEARBY_PER_TERRACE = 30; // cap per terrace; ample for shadow geometry
const SPATIAL_CELL_M = 50;

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);

// Defaults for missing height info. Lowered from 12 → 9 after validator
// showed Kiebêrt being over-shadowed by neighbouring residential blocks
// that defaulted to 12m. Stadionbuurt / Oud-Zuid is mostly 2-3 stories
// with a few 4-storey blocks, so 9m is closer to truth for the majority.
const DEFAULT_HEIGHT_M = 9; // ~3 stories
const FLOOR_HEIGHT_M = 3.0;

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

interface BuildingFootprint {
  lat: number; // centroid
  lng: number;
  height: number; // metres
  width: number; // metres (sqrt area approx)
}

interface Args {
  apply: boolean;
  refetch: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, refetch: false };
  for (const tok of argv) {
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--refetch') a.refetch = true;
  }
  return a;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchTileOnce(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<{ nodes: OsmNode[]; ways: OsmWay[] }> {
  // We need geometry → request `out body geom` so each way includes its
  // node coordinates inline. Saves a node-resolution pass.
  const query = `
    [out:json][timeout:180];
    way["building"](${minLat},${minLng},${maxLat},${maxLng});
    out body geom;
  `;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Zonnie/0.1 (Amsterdam terrace finder; contact: a.j.spilsbury87@gmail.com)',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) {
    throw new Error(`Overpass ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { elements: (OsmNode | OsmWay)[] };
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];
  for (const el of json.elements) {
    if (el.type === 'node') nodes.push(el);
    else if (el.type === 'way') ways.push(el);
  }
  return { nodes, ways };
}

async function fetchTileWithRetry(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<{ ways: OsmWay[] } | null> {
  const delays = [3000, 9000, 27000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      const { ways } = await fetchTileOnce(minLat, minLng, maxLat, maxLng);
      return { ways };
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) {
        const wait = delays[attempt]!;
        console.warn(`  retry in ${wait / 1000}s — ${err}`);
        await sleep(wait);
      }
    }
  }
  console.error(`  TILE FAILED — skipping ${minLat},${minLng}: ${lastErr}`);
  return null;
}

/**
 * Parse OSM `height` and `building:levels` tags into metres.
 * `height` may be "12", "12 m", "12.5m", "39'5\"" etc. We accept the
 * common metric variants and fall through to building:levels otherwise.
 */
function parseHeightTags(tags: Record<string, string> | undefined): number {
  if (!tags) return DEFAULT_HEIGHT_M;

  const heightStr = tags['height'] ?? tags['est_height'];
  if (heightStr) {
    const m = heightStr.match(/^([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const v = parseFloat(m[1]!);
      if (Number.isFinite(v) && v > 0 && v < 500) return v;
    }
  }

  const levelsStr = tags['building:levels'];
  if (levelsStr) {
    const v = parseFloat(levelsStr);
    if (Number.isFinite(v) && v > 0 && v < 100) {
      // +1 for roof + ground-floor extra, then × floor height.
      return Math.max(4, v * FLOOR_HEIGHT_M + 1);
    }
  }

  return DEFAULT_HEIGHT_M;
}

interface OsmGeometryWay extends OsmWay {
  geometry?: { lat: number; lon: number }[];
}

/**
 * Centroid + footprint diameter from way geometry. We approximate width
 * as sqrt(area-of-bounding-box-in-m) — good enough for the shadow
 * engine's angular-width tolerance.
 */
function processWay(way: OsmGeometryWay): BuildingFootprint | null {
  const geom = way.geometry;
  if (!geom || geom.length < 3) return null;

  let latSum = 0;
  let lngSum = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of geom) {
    latSum += p.lat;
    lngSum += p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLng) minLng = p.lon;
    if (p.lon > maxLng) maxLng = p.lon;
  }
  const lat = latSum / geom.length;
  const lng = lngSum / geom.length;

  const widthM = (maxLng - minLng) * M_PER_DEG_LNG;
  const heightM = (maxLat - minLat) * M_PER_DEG_LAT;
  // Conservative: take the smaller bbox dimension (avoids overestimating
  // the angular width of long thin row-house blocks).
  const width = Math.max(5, Math.min(widthM, heightM));

  const buildingHeight = parseHeightTags(way.tags);

  return { lat, lng, height: buildingHeight, width };
}

async function fetchAllBuildings(refetch: boolean): Promise<BuildingFootprint[]> {
  if (!refetch && existsSync(CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as BuildingFootprint[];
    console.log(`Loaded ${cached.length} buildings from cache.`);
    return cached;
  }

  console.log('Tiling Amsterdam bbox; fetching buildings from Overpass…');
  const buildings: BuildingFootprint[] = [];
  const seenIds = new Set<number>();
  let tileCount = 0;
  for (let lat = AMSTERDAM_BBOX.minLat; lat < AMSTERDAM_BBOX.maxLat; lat += TILE_LAT_STEP) {
    for (
      let lng = AMSTERDAM_BBOX.minLng;
      lng < AMSTERDAM_BBOX.maxLng;
      lng += TILE_LNG_STEP
    ) {
      const tLat2 = Math.min(lat + TILE_LAT_STEP, AMSTERDAM_BBOX.maxLat);
      const tLng2 = Math.min(lng + TILE_LNG_STEP, AMSTERDAM_BBOX.maxLng);
      tileCount++;
      process.stdout.write(
        `  tile ${tileCount}: ${lat.toFixed(3)},${lng.toFixed(3)}…${tLat2.toFixed(3)},${tLng2.toFixed(3)} `,
      );
      const result = await fetchTileWithRetry(lat, lng, tLat2, tLng2);
      if (result == null) {
        console.log('SKIPPED');
        continue;
      }
      let added = 0;
      for (const w of result.ways as OsmGeometryWay[]) {
        if (seenIds.has(w.id)) continue;
        seenIds.add(w.id);
        const fp = processWay(w);
        if (fp) {
          buildings.push(fp);
          added++;
        }
      }
      console.log(`+${added} buildings (total ${buildings.length})`);
      // Be polite to the public instance.
      await sleep(800);
    }
  }

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(buildings) + '\n');
  console.log(`\nCached ${buildings.length} buildings to ${CACHE_PATH}`);
  return buildings;
}

/**
 * Coarse spatial grid for fast nearest-neighbour. Each terrace looks
 * up its own cell + the 8 neighbours within radius — much cheaper than
 * scanning all 50k buildings per terrace.
 */
function buildSpatialGrid(buildings: BuildingFootprint[]): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]!;
    const cellLat = Math.round(b.lat * M_PER_DEG_LAT / SPATIAL_CELL_M);
    const cellLng = Math.round(b.lng * M_PER_DEG_LNG / SPATIAL_CELL_M);
    const k = `${cellLat},${cellLng}`;
    let arr = grid.get(k);
    if (!arr) {
      arr = [];
      grid.set(k, arr);
    }
    arr.push(i);
  }
  return grid;
}

function findNearby(
  terrace: Terrace,
  buildings: BuildingFootprint[],
  grid: Map<string, number[]>,
): BuildingFootprint[] {
  const radiusCells = Math.ceil(NEARBY_RADIUS_M / SPATIAL_CELL_M);
  const tCellLat = Math.round(terrace.lat * M_PER_DEG_LAT / SPATIAL_CELL_M);
  const tCellLng = Math.round(terrace.lng * M_PER_DEG_LNG / SPATIAL_CELL_M);

  const candidates: { fp: BuildingFootprint; dist2: number }[] = [];
  for (let dLat = -radiusCells; dLat <= radiusCells; dLat++) {
    for (let dLng = -radiusCells; dLng <= radiusCells; dLng++) {
      const k = `${tCellLat + dLat},${tCellLng + dLng}`;
      const idxs = grid.get(k);
      if (!idxs) continue;
      for (const i of idxs) {
        const b = buildings[i]!;
        const dx = (b.lng - terrace.lng) * M_PER_DEG_LNG;
        const dy = (b.lat - terrace.lat) * M_PER_DEG_LAT;
        const d2 = dx * dx + dy * dy;
        if (d2 < NEARBY_RADIUS_M * NEARBY_RADIUS_M) {
          candidates.push({ fp: b, dist2: d2 });
        }
      }
    }
  }
  candidates.sort((a, b) => a.dist2 - b.dist2);
  return candidates.slice(0, MAX_NEARBY_PER_TERRACE).map((c) => c.fp);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN');

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Loaded ${terraces.length} terraces.`);

  const buildings = await fetchAllBuildings(args.refetch);
  if (buildings.length === 0) {
    console.error('No buildings fetched — aborting.');
    process.exit(1);
  }

  console.log('Building spatial grid…');
  const grid = buildSpatialGrid(buildings);
  console.log(`Grid: ${grid.size} cells, avg ${(buildings.length / grid.size).toFixed(1)} buildings/cell`);

  console.log('Computing per-terrace nearby buildings…');
  const byTerrace: Record<string, BuildingFootprint[]> = {};
  let totalEntries = 0;
  let zeroCount = 0;
  let withHeightTagCount = 0;
  for (const t of terraces) {
    const nearby = findNearby(t, buildings, grid);
    if (nearby.length === 0) zeroCount++;
    byTerrace[String(t.id)] = nearby;
    totalEntries += nearby.length;
  }

  // Inspect height-tag coverage on the global set
  for (const b of buildings) {
    if (b.height !== DEFAULT_HEIGHT_M) withHeightTagCount++;
  }

  console.log('\nStats:');
  console.log(`  Total buildings (city):     ${buildings.length}`);
  console.log(`  With explicit height tag:   ${withHeightTagCount} (${((withHeightTagCount / buildings.length) * 100).toFixed(1)}%)`);
  console.log(`  Terraces with 0 nearby:     ${zeroCount}`);
  console.log(`  Avg nearby per terrace:     ${(totalEntries / terraces.length).toFixed(1)}`);
  console.log(`  Total entries (with dupes): ${totalEntries}`);
  console.log(`  Estimated JSON size:        ${((totalEntries * 80) / 1_000_000).toFixed(1)} MB`);

  if (!args.apply) {
    console.log('\nDry-run; not writing buildings.json.');
    return;
  }

  writeFileSync(OUT_PATH, JSON.stringify(byTerrace) + '\n');
  console.log(`\nWrote ${OUT_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
