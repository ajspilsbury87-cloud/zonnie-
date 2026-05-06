#!/usr/bin/env tsx
/**
 * Post-process the 3D BAG fetcher output:
 *   1. Drop buildings with height < 1m — these are 3D BAG entries with
 *      missing or sentinel height values (basements, planning records,
 *      construction sites). They contribute nothing to shadow geometry.
 *   2. Fill terraces that came back with 0 nearby buildings by
 *      generating procedural buildings (same logic as the runtime
 *      fallback in `src/data/buildings.ts`). 3D BAG omits a handful of
 *      port/industrial venues — typically NDSM Wharf, IJburg edges,
 *      strand venues. Without a fallback they'd score with NO shadow
 *      data, which produces unrealistic perfect-sun results.
 *
 * Run via: npm run patch-3dbag-buildings
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Facing, Terrace } from '../src/engines/types';

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const BUILDINGS_PATH = join(ROOT, 'src', 'data', 'buildings.json');

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);

interface Building {
  lat: number;
  lng: number;
  height: number;
  width?: number;
}

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

/** Lehmer LCG; deterministic so re-runs produce the same buildings. */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateProceduralFor(terrace: Terrace): Building[] {
  const bearing = BUILDING_BEARING[terrace.facing];
  if (bearing == null) return []; // 'All' = no adjacent building

  // Seed by terrace id so this terrace's buildings stay stable across runs.
  const rng = makeRng(terrace.id * 31 + 17);
  const out: Building[] = [];

  // Primary "back wall" 8-14m behind the terrace, 4-5 stories.
  const primaryDist = 8 + rng() * 6;
  const primaryRad = (bearing * Math.PI) / 180;
  out.push({
    lat: terrace.lat + (Math.cos(primaryRad) * primaryDist) / M_PER_DEG_LAT,
    lng: terrace.lng + (Math.sin(primaryRad) * primaryDist) / M_PER_DEG_LNG,
    height: 12 + Math.round(rng() * 6),
    width: 12 + Math.round(rng() * 16),
  });

  // Secondary at ±30°, 18-30m away — gives some oblique-angle shading.
  const offBearing = bearing + (rng() < 0.5 ? -30 : 30);
  const offRad = (offBearing * Math.PI) / 180;
  const secDist = 18 + rng() * 12;
  out.push({
    lat: terrace.lat + (Math.cos(offRad) * secDist) / M_PER_DEG_LAT,
    lng: terrace.lng + (Math.sin(offRad) * secDist) / M_PER_DEG_LNG,
    height: 9 + Math.round(rng() * 6),
    width: 8 + Math.round(rng() * 14),
  });

  return out;
}

function main(): void {
  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  const data = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf-8')) as Record<
    string,
    Building[]
  >;

  let totalBefore = 0;
  let totalAfter = 0;
  let zeroHeightDropped = 0;
  let proceduralAdded = 0;
  let terracesPatched = 0;

  for (const t of terraces) {
    const key = String(t.id);
    const list = data[key] ?? [];
    totalBefore += list.length;

    // Drop buildings with implausible heights.
    const cleaned = list.filter((b) => {
      if (b.height < 1) {
        zeroHeightDropped++;
        return false;
      }
      return true;
    });

    if (cleaned.length === 0) {
      const fallback = generateProceduralFor(t);
      data[key] = fallback;
      totalAfter += fallback.length;
      proceduralAdded += fallback.length;
      terracesPatched++;
      console.log(
        `  [patched] id=${t.id.toString().padStart(4)} ${t.name.slice(0, 35).padEnd(35)} ${t.facing.padEnd(3)} → ${fallback.length} procedural`,
      );
    } else {
      data[key] = cleaned;
      totalAfter += cleaned.length;
    }
  }

  writeFileSync(BUILDINGS_PATH, JSON.stringify(data) + '\n');

  console.log('');
  console.log('Summary:');
  console.log(`  Entries before:           ${totalBefore}`);
  console.log(`  Entries after:            ${totalAfter}`);
  console.log(`  Zero-height dropped:      ${zeroHeightDropped}`);
  console.log(`  Procedural added:         ${proceduralAdded}`);
  console.log(`  Terraces with fallback:   ${terracesPatched}`);
  console.log(`  Wrote ${BUILDINGS_PATH}`);
}

main();
