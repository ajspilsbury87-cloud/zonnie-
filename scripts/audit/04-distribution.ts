#!/usr/bin/env tsx
/**
 * A4 — Category + area distribution.
 *
 * Counts terraces per:
 *   - `area` field (called "neighbourhood" in the spec, but actual schema
 *     uses `Terrace.area` at src/engines/types.ts:19)
 *   - venue category, via `categoriesForTerrace(t)` which combines explicit
 *     `t.category` tags + regex inference over name + vibe.
 *
 * Plus a "complete + verified" subset count for the marketing-claim
 * comparison: terraces with valid coords (in bbox), a valid facing, and
 * `verified === true`. The marketing claim ("1,000+") does not exist
 * anywhere in this repo (Explore agent confirmed), so this script just
 * reports the numbers; the FINDINGS.md note flags it for manual cross-
 * check against the external App Store description draft / IG copy.
 *
 * Read-only. Writes audit-output/distribution.{json,md}.
 *
 * Run: npx tsx scripts/audit/04-distribution.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { categoriesForTerrace, type VenueCategory } from '../../src/data/categories';
import { AMSTERDAM_BOUNDS } from './_placesLookupReadOnly';
import type { Facing } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const VALID_FACINGS = new Set<Facing>([
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All',
]);

const total = TERRACES.length;

// ── Category counts ─────────────────────────────────────────────────────

interface CategoryCount {
  category: VenueCategory | '(none)';
  total: number;
  explicit: number; // had t.category tag
  inferred: number; // regex-inferred
}

const catTotals = new Map<string, CategoryCount>();
function bump(k: VenueCategory | '(none)', explicit: boolean): void {
  let row = catTotals.get(k);
  if (!row) {
    row = { category: k, total: 0, explicit: 0, inferred: 0 };
    catTotals.set(k, row);
  }
  row.total++;
  if (explicit) row.explicit++; else row.inferred++;
}

for (const t of TERRACES) {
  const explicit = (t.category?.length ?? 0) > 0;
  const cats = categoriesForTerrace(t);
  if (cats.size === 0) {
    bump('(none)', false);
    continue;
  }
  for (const c of cats) bump(c, explicit);
}

const categoryRows = [...catTotals.values()].sort((a, b) => b.total - a.total);

// ── Area counts ─────────────────────────────────────────────────────────

interface AreaRow {
  area: string;
  count: number;
  flagged: boolean; // < 10 terraces (per spec)
}
const areaMap = new Map<string, number>();
for (const t of TERRACES) {
  areaMap.set(t.area, (areaMap.get(t.area) ?? 0) + 1);
}
const areaRows: AreaRow[] = [...areaMap.entries()]
  .map(([area, count]) => ({ area, count, flagged: count < 10 }))
  .sort((a, b) => b.count - a.count);

// ── "Complete + verified" subset ────────────────────────────────────────

interface SubsetTally {
  total: number;
  withCoordsInBbox: number;
  withValidFacing: number;
  withCoordsAndFacing: number;
  verifiedFlag: number;
  fullyComplete: number; // coords + facing + verified === true
}

const subset: SubsetTally = {
  total,
  withCoordsInBbox: 0,
  withValidFacing: 0,
  withCoordsAndFacing: 0,
  verifiedFlag: 0,
  fullyComplete: 0,
};

for (const t of TERRACES) {
  const coordsOk =
    t.lat >= AMSTERDAM_BOUNDS.minLat &&
    t.lat <= AMSTERDAM_BOUNDS.maxLat &&
    t.lng >= AMSTERDAM_BOUNDS.minLng &&
    t.lng <= AMSTERDAM_BOUNDS.maxLng;
  const facingOk = VALID_FACINGS.has(t.facing);
  const verified = t.verified === true;
  if (coordsOk) subset.withCoordsInBbox++;
  if (facingOk) subset.withValidFacing++;
  if (coordsOk && facingOk) subset.withCoordsAndFacing++;
  if (verified) subset.verifiedFlag++;
  if (coordsOk && facingOk && verified) subset.fullyComplete++;
}

// ── Output ──────────────────────────────────────────────────────────────

writeFileSync(
  join(OUT_DIR, 'distribution.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total,
      categories: categoryRows,
      areas: areaRows,
      subset,
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# A4 — Category & area distribution');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Total terraces: **${total}**`);
md.push('');

md.push('## Counts per venue category');
md.push('');
md.push('A terrace can match multiple categories (e.g., coffee + bar), so column totals can exceed the terrace count.');
md.push('');
md.push('| Category | Total | Explicit `category` tag | Regex-inferred |');
md.push('| --- | ---: | ---: | ---: |');
for (const r of categoryRows) md.push(`| ${r.category} | ${r.total} | ${r.explicit} | ${r.inferred} |`);
md.push('');

md.push('## Counts per area');
md.push('');
md.push('Areas with **< 10 terraces** flagged for manual review (potential under-coverage).');
md.push('');
md.push('| Area | Count | Under-covered? |');
md.push('| --- | ---: | :---: |');
for (const r of areaRows) md.push(`| ${r.area} | ${r.count} | ${r.flagged ? '⚠' : ''} |`);
md.push('');

md.push('## Marketing-claim cross-check (subset tally)');
md.push('');
md.push('Per Explore Q3, no "1,000+" claim exists in the repo. The numbers below are the candidates the audit can offer if such a claim is asserted externally (App Store, IG, project docs).');
md.push('');
md.push('| Metric | Count | Note |');
md.push('| --- | ---: | --- |');
md.push(`| Total in dataset | ${subset.total} | \`TERRACES.length\` |`);
md.push(`| With coords inside Amsterdam bbox | ${subset.withCoordsInBbox} | bbox per validate-coords.ts:47–52 |`);
md.push(`| With valid \`facing\` value | ${subset.withValidFacing} | from N/NE/…/NW/All set |`);
md.push(`| With both coords + valid facing | ${subset.withCoordsAndFacing} | scoreable |`);
md.push(`| With \`verified === true\` flag | ${subset.verifiedFlag} | self-reported in data |`);
md.push(`| **Complete + verified** | **${subset.fullyComplete}** | coords + facing + \`verified === true\` |`);
md.push('');
md.push('If any external surface (App Store, IG) currently claims "1,000+" terraces, that is overstating the dataset (currently ' + total + '). If the claim is "complete + verified", the gap is even wider.');
md.push('');

writeFileSync(join(OUT_DIR, 'distribution.md'), md.join('\n'));

console.log(`distribution.md written: ${total} terraces, ${categoryRows.length} categories, ${areaRows.length} areas, ${subset.fullyComplete} fully complete.`);
