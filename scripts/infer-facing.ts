#!/usr/bin/env tsx
/**
 * Infer the `facing` direction of each terrace from OpenStreetMap
 * building geometry. Replaces the default 'S' that the bulk import
 * script applied to ~660 newly imported venues.
 *
 * Heuristic:
 *   1. Fetch all `building=*` polygons in Amsterdam metro from the
 *      Overpass API (one tiled query per ~5km cell, results cached).
 *   2. Build a coarse spatial grid (100m cells) for fast nearest-
 *      neighbour lookup.
 *   3. For each terrace, find the closest building polygon centroid
 *      within 50m. (No building → leave facing as-is.)
 *   4. Bearing from BUILDING centroid → TERRACE point gives the
 *      direction the terrace *opens* (because the seating sits in
 *      front of the building, away from it). Quantise to one of
 *      N/NE/E/SE/S/SW/W/NW.
 *
 * Selection policy (--all vs --imports-only):
 *   - default `--imports-only`: only update terraces with the
 *     "default S" import marker — `coordSource: 'places_api'` AND
 *     `verifiedAt > 2026-05-04T00:00`. This preserves manually
 *     curated facings on the original 378 venues.
 *   - `--all`: update every terrace where we have a confident
 *     building match. Use this if you trust the inference more than
 *     the curated values.
 *
 * Usage (PowerShell):
 *   npm run infer-facing -- --dry-run
 *   npm run infer-facing -- --apply
 *   npm run infer-facing -- --apply --all
 *   npm run infer-facing -- --apply --refetch    # ignore OSM cache
 *
 * No API key required. Overpass is a public service — be polite,
 * we tile + cache the response so we only hit it once.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { Facing, Terrace } from '../src/engines/types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const CACHE_PATH = join(
  PROJECT_ROOT,
  'scripts',
  'competitor-research',
  'osm-buildings-amsterdam.json',
);
const LOG_PATH = join(
  PROJECT_ROOT,
  'scripts',
  'competitor-research',
  'facing-inference-log.jsonl',
);

const AMSTERDAM_BBOX = {
  minLat: 52.27,
  maxLat: 52.45,
  minLng: 4.7,
  maxLng: 5.05,
};

// Tile the bbox into ~3km cells so each Overpass query stays small enough
// to fit comfortably in the public-instance timeout (180s) and response
// size limits (~50MB). Central Amsterdam tiles can have 30k+ buildings;
// smaller tiles avoid 504 timeouts during peak load.
const TILE_LAT_STEP = 0.027; // ~3km lat
const TILE_LNG_STEP = 0.045; // ~3km lng at 52° latitude

const NEAREST_RADIUS_M = 50;
const SPATIAL_CELL_M = 100;

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);

// Imports landed at this timestamp; we treat anything with coordSource
// 'places_api' verified after this as "default-facing-S import" eligible
// for overwrite.
const IMPORT_THRESHOLD_ISO = '2026-05-04T00:00:00.000Z';

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
  centroidLat: number;
  centroidLng: number;
}

interface Args {
  apply: boolean;
  importsOnly: boolean;
  refetch: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, importsOnly: true, refetch: false };
  for (const tok of argv) {
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--all') a.importsOnly = false;
    else if (tok === '--imports-only') a.importsOnly = true;
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
): Promise<{ ways: OsmWay[]; nodes: OsmNode[] }> {
  // bbox in Overpass: south,west,north,east
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = `
    [out:json][timeout:120];
    (way["building"](${bbox}););
    (._;>;);
    out body;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Zonnie/0.1 (Amsterdam terrace finder; contact: a.j.spilsbury87@gmail.com)',
      Accept: 'application/json',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  const body = (await res.json()) as { elements?: (OsmNode | OsmWay)[] };
  const ways: OsmWay[] = [];
  const nodes: OsmNode[] = [];
  for (const e of body.elements ?? []) {
    if (e.type === 'way') ways.push(e);
    else if (e.type === 'node') nodes.push(e);
  }
  return { ways, nodes };
}

/**
 * Retry wrapper around `fetchTileOnce`. Overpass public instance returns
 * 504 / 429 under load — exponential backoff (3, 9, 27s) with three
 * attempts is normally enough to ride out a peak.
 */
async function fetchTile(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<{ ways: OsmWay[]; nodes: OsmNode[] }> {
  const delays = [3000, 9000, 27000];
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fetchTileOnce(minLat, minLng, maxLat, maxLng);
    } catch (err) {
      lastErr = err;
      const isLast = i === delays.length;
      if (isLast) break;
      const delay = delays[i]!;
      process.stdout.write(` retrying in ${delay / 1000}s… `);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function fetchAllBuildings(refetch: boolean): Promise<BuildingFootprint[]> {
  if (!refetch && existsSync(CACHE_PATH)) {
    console.log(`Reading cached buildings from ${CACHE_PATH}`);
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as BuildingFootprint[];
  }

  console.log('Fetching OSM buildings from Overpass (tiled — ~30-90s)');
  const allNodes = new Map<number, OsmNode>();
  const allWays: OsmWay[] = [];
  const failed: string[] = [];

  for (
    let lat = AMSTERDAM_BBOX.minLat;
    lat < AMSTERDAM_BBOX.maxLat;
    lat += TILE_LAT_STEP
  ) {
    for (
      let lng = AMSTERDAM_BBOX.minLng;
      lng < AMSTERDAM_BBOX.maxLng;
      lng += TILE_LNG_STEP
    ) {
      const tileMaxLat = Math.min(lat + TILE_LAT_STEP, AMSTERDAM_BBOX.maxLat);
      const tileMaxLng = Math.min(lng + TILE_LNG_STEP, AMSTERDAM_BBOX.maxLng);
      const tileLabel = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      process.stdout.write(
        `  tile ${tileLabel} → ${tileMaxLat.toFixed(3)},${tileMaxLng.toFixed(3)}  `,
      );
      try {
        const { ways, nodes } = await fetchTile(lat, lng, tileMaxLat, tileMaxLng);
        console.log(`ways=${ways.length} nodes=${nodes.length}`);
        for (const n of nodes) allNodes.set(n.id, n);
        allWays.push(...ways);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`SKIPPED (${msg})`);
        failed.push(tileLabel);
      }
      // Be polite to the public instance.
      await sleep(1500);
    }
  }

  if (failed.length > 0) {
    console.log(
      `\n⚠ ${failed.length} tile(s) failed after retries: ${failed.join(', ')}`,
    );
    console.log(
      '  Terraces in those tiles will keep their existing facing (no building match).',
    );
  }

  console.log(`Aggregated ${allWays.length} ways, ${allNodes.size} nodes`);

  const footprints: BuildingFootprint[] = [];
  for (const w of allWays) {
    const pts: [number, number][] = []; // [lat, lng]
    for (const nodeId of w.nodes) {
      const n = allNodes.get(nodeId);
      if (n) pts.push([n.lat, n.lon]);
    }
    if (pts.length < 3) continue;
    const c = polygonCentroid(pts);
    if (c) footprints.push({ centroidLat: c[0], centroidLng: c[1] });
  }

  console.log(`Computed ${footprints.length} building centroids`);

  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(footprints));
  console.log(`Cached → ${CACHE_PATH}`);
  return footprints;
}

/**
 * Polygon centroid (signed-area weighted), pts in [lat, lng]. Returns the
 * centroid as [lat, lng], or null if the polygon is degenerate.
 *
 * For tiny urban polygons (~10-50m wide), we treat lat/lng as a planar
 * coord system — perfectly fine at this scale; the lat-cosine bias is
 * sub-metre.
 */
function polygonCentroid(pts: [number, number][]): [number, number] | null {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [y0, x0] = pts[i]!;
    const [y1, x1] = pts[(i + 1) % n]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-15) {
    // Degenerate / collinear — fall back to mean of vertices.
    let mx = 0;
    let my = 0;
    for (const [y, x] of pts) {
      mx += x;
      my += y;
    }
    return [my / pts.length, mx / pts.length];
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return [cy, cx];
}

function distMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dx = (b.lng - a.lng) * M_PER_DEG_LNG;
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Bearing FROM `from` TO `to`, in degrees clockwise from north. */
function bearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dx = (to.lng - from.lng) * M_PER_DEG_LNG;
  const dy = (to.lat - from.lat) * M_PER_DEG_LAT;
  const radians = Math.atan2(dx, dy);
  return (radians * 180) / Math.PI;
}

const COMPASS_8: Facing[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function bearingToFacing(bearingDeg: number): Facing {
  // Normalise to [0, 360) and round to nearest 45°.
  const normalised = ((bearingDeg % 360) + 360) % 360;
  const idx = Math.round(normalised / 45) % 8;
  return COMPASS_8[idx]!;
}

interface SpatialIndex {
  cells: Map<string, BuildingFootprint[]>;
  cellLatStep: number;
  cellLngStep: number;
}

function buildSpatialIndex(buildings: BuildingFootprint[]): SpatialIndex {
  const cellLatStep = SPATIAL_CELL_M / M_PER_DEG_LAT;
  const cellLngStep = SPATIAL_CELL_M / M_PER_DEG_LNG;
  const cells = new Map<string, BuildingFootprint[]>();
  for (const b of buildings) {
    const key = `${Math.floor(b.centroidLat / cellLatStep)}|${Math.floor(b.centroidLng / cellLngStep)}`;
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(b);
  }
  return { cells, cellLatStep, cellLngStep };
}

function nearestBuilding(
  index: SpatialIndex,
  point: { lat: number; lng: number },
  maxDistanceM: number,
): BuildingFootprint | null {
  // Search the cell containing the point + 8 neighbours (3×3 grid).
  const baseLat = Math.floor(point.lat / index.cellLatStep);
  const baseLng = Math.floor(point.lng / index.cellLngStep);
  let best: BuildingFootprint | null = null;
  let bestD = maxDistanceM;
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const key = `${baseLat + dLat}|${baseLng + dLng}`;
      const bucket = index.cells.get(key);
      if (!bucket) continue;
      for (const b of bucket) {
        const d = distMeters(point, { lat: b.centroidLat, lng: b.centroidLng });
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
    }
  }
  return best;
}

function isImportTarget(t: Terrace): boolean {
  if (t.coordSource !== 'places_api') return false;
  if (!t.verifiedAt) return false;
  return t.verifiedAt >= IMPORT_THRESHOLD_ISO;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'} · ${args.importsOnly ? 'imports only' : 'all terraces'} · ${args.refetch ? 'refetch OSM' : 'use cache'}`,
  );

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Loaded ${terraces.length} terraces`);

  const buildings = await fetchAllBuildings(args.refetch);
  console.log(`Indexing ${buildings.length} buildings…`);
  const index = buildSpatialIndex(buildings);

  let updated = 0;
  let skippedNotTarget = 0;
  let skippedNoBuilding = 0;
  let unchanged = 0;
  const updates: { id: number; name: string; old: Facing; new: Facing; distM: number }[] = [];

  for (const t of terraces) {
    if (args.importsOnly && !isImportTarget(t)) {
      skippedNotTarget++;
      continue;
    }
    const nearest = nearestBuilding(index, { lat: t.lat, lng: t.lng }, NEAREST_RADIUS_M);
    if (!nearest) {
      skippedNoBuilding++;
      continue;
    }
    const dist = distMeters(
      { lat: t.lat, lng: t.lng },
      { lat: nearest.centroidLat, lng: nearest.centroidLng },
    );
    // Bearing FROM building TO terrace = direction the terrace opens.
    const bDeg = bearing(
      { lat: nearest.centroidLat, lng: nearest.centroidLng },
      { lat: t.lat, lng: t.lng },
    );
    const inferred = bearingToFacing(bDeg);

    if (inferred === t.facing) {
      unchanged++;
      continue;
    }

    updated++;
    updates.push({
      id: t.id,
      name: t.name,
      old: t.facing,
      new: inferred,
      distM: Math.round(dist),
    });

    if (args.apply) {
      t.facing = inferred;
    }
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Updated:                ${updated}`);
  console.log(`  Unchanged (already correct): ${unchanged}`);
  console.log(`  Skipped (not in target set): ${skippedNotTarget}`);
  console.log(`  Skipped (no nearby building): ${skippedNoBuilding}`);
  console.log('');

  console.log('Sample of changes (first 30):');
  for (const u of updates.slice(0, 30)) {
    console.log(
      `  ${u.id.toString().padStart(4)}  ${u.name.padEnd(35).slice(0, 35)}  ${u.old.padEnd(2)} → ${u.new.padEnd(2)}  (${u.distM}m to building)`,
    );
  }

  // Append per-update audit lines to a log so changes are reviewable.
  if (args.apply && updates.length > 0) {
    const ts = new Date().toISOString();
    const lines = updates.map(
      (u) =>
        JSON.stringify({
          timestamp: ts,
          ...u,
        }) + '\n',
    );
    if (!existsSync(LOG_PATH)) writeFileSync(LOG_PATH, '');
    writeFileSync(LOG_PATH, readFileSync(LOG_PATH, 'utf-8') + lines.join(''));
  }

  if (!args.apply) {
    console.log('');
    console.log('DRY-RUN — no changes written. Re-run with --apply.');
    return;
  }

  if (updated === 0) {
    console.log('No updates to write.');
    return;
  }

  writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');
  console.log(`Wrote ${updated} updated facings to ${TERRACES_PATH}.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
