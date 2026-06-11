#!/usr/bin/env tsx
/**
 * A3 — Building-height coverage.
 *
 * Per terrace, classify nearby buildings:
 *   - Real 3D BAG buildings have a `poly` field populated by
 *     `scripts/fetch-3dbag-buildings.py` (Explore agent confirmed at
 *     types.ts:118–125 + fetch-3dbag-buildings.py:301).
 *   - Buildings without `poly` are either OSM-fallback (heights from OSM
 *     tags, 9 m default for unmarked) or procedurally generated. The
 *     data shape alone can't tell those two apart — both groups are
 *     reported as "no-poly" with a note.
 *
 * Outputs:
 *   audit-output/buildings.{json,md}
 *   audit-output/fallback-terraces.json — focussed list of terraces whose
 *     nearby-building set contains ZERO real-3D-BAG buildings. This is
 *     the input for the follow-up 3D BAG backfill PR.
 *
 * Read-only.
 *
 * Run: npx tsx scripts/audit/03-buildings.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import {
  getBuildingsForTerrace,
  getBuildings,
  isUsingRealBuildingData,
} from '../../src/data/buildings';
import type { Building, Terrace } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

// ── Global signal ───────────────────────────────────────────────────────

const dataIsReal = isUsingRealBuildingData();

const allBuildings = getBuildings();
const totalBuildings = allBuildings.length;
const totalWithPoly = allBuildings.filter((b) => b.poly && b.poly.length >= 3).length;
const totalWithoutPoly = totalBuildings - totalWithPoly;

// ── Height sanity (global) ──────────────────────────────────────────────

let zeroHeight = 0;
let negativeHeight = 0;
let veryTall = 0; // > 150 m
const heights = new Map<string, number>(); // rounded height → count
for (const b of allBuildings) {
  if (b.height <= 0) {
    if (b.height === 0) zeroHeight++;
    else negativeHeight++;
  }
  if (b.height > 150) veryTall++;
  const k = b.height.toFixed(1);
  heights.set(k, (heights.get(k) ?? 0) + 1);
}

// Fallback fingerprint: top exact-height value with very high count.
const topRepeated = [...heights.entries()]
  .map(([k, v]) => ({ height: parseFloat(k), count: v }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);

// ── Per-terrace classification ──────────────────────────────────────────

interface TerraceCoverage {
  id: number;
  name: string;
  area: string;
  total: number;
  withPoly: number;     // real 3D BAG
  withoutPoly: number;  // OSM-fallback OR procedural
  zeroPolyTerrace: boolean; // true when withPoly === 0
}

const perTerrace: TerraceCoverage[] = [];
for (const t of TERRACES) {
  const list = getBuildingsForTerrace(t.id);
  const wp = list.filter((b) => b.poly && b.poly.length >= 3).length;
  perTerrace.push({
    id: t.id,
    name: t.name,
    area: t.area,
    total: list.length,
    withPoly: wp,
    withoutPoly: list.length - wp,
    zeroPolyTerrace: wp === 0,
  });
}

const fallbackTerraces = perTerrace.filter((p) => p.zeroPolyTerrace);
const allRealTerraces = perTerrace.filter((p) => !p.zeroPolyTerrace && p.withoutPoly === 0);
const mixedTerraces = perTerrace.filter((p) => p.withPoly > 0 && p.withoutPoly > 0);

const terracesWithNoBuildings = perTerrace.filter((p) => p.total === 0);

// Average count per terrace
const meanTotal = perTerrace.reduce((s, p) => s + p.total, 0) / perTerrace.length;
const meanWithPoly = perTerrace.reduce((s, p) => s + p.withPoly, 0) / perTerrace.length;

// ── Output ──────────────────────────────────────────────────────────────

writeFileSync(
  join(OUT_DIR, 'fallback-terraces.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: fallbackTerraces.length,
      note: 'Terraces whose getBuildingsForTerrace() returns ZERO buildings with `poly` field set. These are either OSM-fallback (heights from OSM tags, 9m default for unmarked) or procedurally generated. The follow-up 3D BAG backfill PR should target this list.',
      terraces: fallbackTerraces.map((p) => ({
        id: p.id,
        name: p.name,
        area: p.area,
        nearbyBuildingsCount: p.total,
      })),
    },
    null,
    2,
  ),
);

writeFileSync(
  join(OUT_DIR, 'buildings.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      globalSignal: { isUsingRealBuildingData: dataIsReal },
      buildingsTotal: totalBuildings,
      buildingsWithPoly: totalWithPoly,
      buildingsWithoutPoly: totalWithoutPoly,
      heightSanity: { zeroHeight, negativeHeight, veryTall, topRepeatedHeights: topRepeated },
      perTerraceMeans: { meanTotal: Number(meanTotal.toFixed(2)), meanWithPoly: Number(meanWithPoly.toFixed(2)) },
      classifications: {
        terracesTotal: TERRACES.length,
        allRealCount: allRealTerraces.length,
        mixedCount: mixedTerraces.length,
        fallbackOnlyCount: fallbackTerraces.length,
        terracesWithNoBuildingsCount: terracesWithNoBuildings.length,
      },
      perTerrace,
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# A3 — Building-height coverage');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('');
md.push('## Global signal');
md.push('');
md.push(`- \`isUsingRealBuildingData()\`: **${dataIsReal ? '✅ true' : '❌ false'}** (src/data/buildings.ts:216)`);
md.push(`- Buildings dataset total: **${totalBuildings}**`);
md.push(`- With \`poly\` field (real 3D BAG): **${totalWithPoly}** (${((totalWithPoly / totalBuildings) * 100).toFixed(1)}%)`);
md.push(`- Without \`poly\` (OSM-fallback or procedural — same shape): **${totalWithoutPoly}** (${((totalWithoutPoly / totalBuildings) * 100).toFixed(1)}%)`);
md.push('');

md.push('## Per-terrace classification');
md.push('');
md.push(`Total terraces: **${TERRACES.length}**.`);
md.push('');
md.push(`- 🥇 All buildings real 3D BAG: **${allRealTerraces.length}** (${((allRealTerraces.length / TERRACES.length) * 100).toFixed(1)}%) — gold standard for shadow accuracy.`);
md.push(`- 🥈 Mixed real + non-poly: **${mixedTerraces.length}** (${((mixedTerraces.length / TERRACES.length) * 100).toFixed(1)}%) — partial.`);
md.push(`- ⚠ Fallback-only (zero buildings with \`poly\`): **${fallbackTerraces.length}** (${((fallbackTerraces.length / TERRACES.length) * 100).toFixed(1)}%) — P1 target for 3D BAG backfill.`);
md.push(`- 🚫 No nearby buildings at all: **${terracesWithNoBuildings.length}** — shadow inactive for these even if engine were wired up.`);
md.push('');
md.push(`Means per terrace: total=${meanTotal.toFixed(1)}, with-poly=${meanWithPoly.toFixed(1)}.`);
md.push('');

md.push('## Height sanity');
md.push('');
md.push(`- Buildings with height = 0 m: **${zeroHeight}** (buildings.ts:170 filters these in the global cache, but the source data may still have them)`);
md.push(`- Buildings with height < 0 m: **${negativeHeight}**`);
md.push(`- Buildings taller than 150 m: **${veryTall}**`);
md.push('');
md.push('### Most-repeated exact heights (fingerprint of procedural fallback)');
md.push('');
md.push('| Height (m) | Count |');
md.push('| ---: | ---: |');
for (const r of topRepeated) md.push(`| ${r.height.toFixed(1)} | ${r.count} |`);
md.push('');
md.push('Note: OSM\'s 9 m default for unmarked buildings will appear here as a large bar. Procedural generation jitters height by a normal-ish offset around neighbourhood means, so exact-equality counts there are typically low.');
md.push('');

md.push('## Sample fallback-only terraces (first 30)');
md.push('');
md.push('Full list of ' + fallbackTerraces.length + ' in `audit-output/fallback-terraces.json` (sidecar for the 3D BAG backfill PR).');
md.push('');
if (fallbackTerraces.length > 0) {
  md.push('| ID | Name | Area | Nearby bldgs |');
  md.push('| ---: | --- | --- | ---: |');
  for (const p of fallbackTerraces.slice(0, 30)) {
    md.push(`| ${p.id} | ${p.name} | ${p.area} | ${p.total} |`);
  }
}
md.push('');

if (terracesWithNoBuildings.length > 0) {
  md.push('## Terraces with NO nearby buildings (first 25)');
  md.push('');
  md.push('Shadow has no effect on these even if re-enabled. Likely water-front / open-square terraces, but verify.');
  md.push('');
  md.push('| ID | Name | Area |');
  md.push('| ---: | --- | --- |');
  for (const p of terracesWithNoBuildings.slice(0, 25)) {
    md.push(`| ${p.id} | ${p.name} | ${p.area} |`);
  }
}

writeFileSync(join(OUT_DIR, 'buildings.md'), md.join('\n'));

console.log(
  `buildings.md written: real=${allRealTerraces.length}, mixed=${mixedTerraces.length}, fallback=${fallbackTerraces.length}, none=${terracesWithNoBuildings.length}.`,
);
