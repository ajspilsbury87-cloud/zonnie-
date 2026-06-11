#!/usr/bin/env tsx
/**
 * A1 — Field completeness census + duplicate / placeholder detection.
 *
 * For each terrace, count which fields are present, missing, or "suspicious"
 * (empty strings, placeholder values, out-of-set facing values). Also detect
 * structural problems: duplicate ids, duplicate normalised names at
 * different coords, near-coincident coords (< 5 m) on different ids.
 *
 * Read-only. Writes audit-output/completeness.{json,md}.
 *
 * Run: npx tsx scripts/audit/01-completeness.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { distanceMeters } from './_placesLookupReadOnly';
import type { Facing, Terrace } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const VALID_FACINGS = new Set<Facing>([
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All',
]);

const PLACEHOLDER_PATTERNS = [
  /^(tbd|tba|unknown|test|todo|n\/a|na)$/i,
  /^\s*$/, // empty / whitespace-only
];

const DUPLICATE_COORD_THRESHOLD_M = 5;

// ── Per-field completeness ──────────────────────────────────────────────

interface FieldStat {
  field: string;
  present: number;
  missing: number;
  suspicious: number;
  notes: string[];
}

function isPresent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function isSuspicious(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

function summariseField<K extends keyof Terrace>(
  field: K,
  notesProducer?: (t: Terrace) => string | null,
): FieldStat {
  let present = 0;
  let missing = 0;
  let suspicious = 0;
  const notes: string[] = [];
  for (const t of TERRACES) {
    const v = t[field];
    if (isPresent(v)) {
      present++;
      if (isSuspicious(v)) {
        suspicious++;
        notes.push(`id=${t.id} ${field}=${JSON.stringify(v)}`);
      }
    } else {
      missing++;
    }
    if (notesProducer) {
      const n = notesProducer(t);
      if (n) notes.push(n);
    }
  }
  return { field: String(field), present, missing, suspicious, notes: notes.slice(0, 12) };
}

const fields: FieldStat[] = [
  summariseField('id'),
  summariseField('name'),
  summariseField('lat'),
  summariseField('lng'),
  summariseField('area'),
  summariseField('facing', (t) => {
    if (!VALID_FACINGS.has(t.facing)) return `id=${t.id} invalid facing=${JSON.stringify(t.facing)}`;
    return null;
  }),
  summariseField('capacity'),
  summariseField('vibe'),
  summariseField('address'),
  summariseField('verified'),
  summariseField('placeId'),
  summariseField('category'),
  summariseField('googleRating'),
  summariseField('googleReviewCount'),
  summariseField('featured'),
  summariseField('photoUrl'),
  summariseField('outdoorScreens'),
  summariseField('verifiedAt'),
  summariseField('coordSource'),
];

// ── Duplicate ids ───────────────────────────────────────────────────────

const idCounts = new Map<number, number>();
for (const t of TERRACES) idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
const duplicateIds: number[] = [];
for (const [id, c] of idCounts) if (c > 1) duplicateIds.push(id);

// Sequential gaps. We expect IDs to be roughly dense; gaps are useful info
// for the data owner but not a red flag in themselves.
const idsSorted = [...idCounts.keys()].sort((a, b) => a - b);
const idMin = idsSorted[0] ?? 0;
const idMax = idsSorted[idsSorted.length - 1] ?? 0;
const idsExpected = idMax - idMin + 1;
const idsActual = idsSorted.length;
const idsMissingCount = idsExpected - idsActual;

// Find first 25 missing IDs in range for the report (informational).
const idSet = new Set(idsSorted);
const idGaps: number[] = [];
for (let i = idMin; i <= idMax && idGaps.length < 25; i++) {
  if (!idSet.has(i)) idGaps.push(i);
}

// ── Duplicate names at different coords ─────────────────────────────────

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const byName = new Map<string, Terrace[]>();
for (const t of TERRACES) {
  const k = normName(t.name);
  (byName.get(k) ?? byName.set(k, []).get(k)!).push(t);
}

interface DuplicateNameGroup {
  name: string;
  count: number;
  entries: { id: number; lat: number; lng: number; area: string }[];
}
const duplicateNames: DuplicateNameGroup[] = [];
for (const [k, arr] of byName) {
  if (arr.length < 2) continue;
  // Same normalised name across multiple terraces — report regardless of
  // coordinate distance; data team can decide which are legitimate
  // (e.g., chain locations) and which are dupes.
  duplicateNames.push({
    name: k,
    count: arr.length,
    entries: arr.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, area: t.area })),
  });
}
duplicateNames.sort((a, b) => b.count - a.count);

// ── Near-coincident coords on different ids ─────────────────────────────
//
// Brute-force O(n²) over 947 records — fine for an audit; finishes in <1s.

interface CoordCluster {
  ids: number[];
  names: string[];
  distanceM: number;
}
const coordClusters: CoordCluster[] = [];
for (let i = 0; i < TERRACES.length; i++) {
  for (let j = i + 1; j < TERRACES.length; j++) {
    const a = TERRACES[i]!;
    const b = TERRACES[j]!;
    if (a.id === b.id) continue;
    const d = distanceMeters(a.lat, a.lng, b.lat, b.lng);
    if (d < DUPLICATE_COORD_THRESHOLD_M) {
      coordClusters.push({ ids: [a.id, b.id], names: [a.name, b.name], distanceM: Number(d.toFixed(2)) });
    }
  }
}

// ── Output ──────────────────────────────────────────────────────────────

const total = TERRACES.length;

writeFileSync(
  join(OUT_DIR, 'completeness.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalTerraces: total,
      perField: fields,
      ids: {
        duplicates: duplicateIds,
        min: idMin,
        max: idMax,
        expectedCount: idsExpected,
        actualCount: idsActual,
        missingCount: idsMissingCount,
        sampleGaps: idGaps,
      },
      duplicateNames,
      coordClusters,
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# A1 — Field completeness census');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Total terraces: **${total}**`);
md.push('');

md.push('## Per-field census');
md.push('');
md.push('| Field | Present | Missing | % present | Suspicious |');
md.push('| --- | ---: | ---: | ---: | ---: |');
for (const f of fields) {
  const pct = ((f.present / total) * 100).toFixed(1);
  md.push(`| ${f.field} | ${f.present} | ${f.missing} | ${pct}% | ${f.suspicious} |`);
}
md.push('');

const flagged = fields.filter((f) => f.suspicious > 0 || f.notes.length > 0);
if (flagged.length > 0) {
  md.push('### Suspicious / invalid samples');
  md.push('');
  for (const f of flagged) {
    md.push(`- **${f.field}** — ${f.notes.length} notes:`);
    for (const n of f.notes.slice(0, 5)) md.push(`  - ${n}`);
  }
  md.push('');
}

md.push('## ID structure');
md.push('');
md.push(`- min=${idMin}, max=${idMax}, expected=${idsExpected}, actual=${idsActual}, gaps=${idsMissingCount}`);
md.push(`- duplicate ids: ${duplicateIds.length === 0 ? 'none ✅' : duplicateIds.join(', ') + ' ❌'}`);
if (idGaps.length > 0) {
  md.push(`- first ${idGaps.length} missing ids in range (informational): ${idGaps.join(', ')}`);
}
md.push('');

md.push('## Duplicate normalised names');
md.push('');
md.push(`${duplicateNames.length} name(s) repeated across multiple ids.`);
md.push('');
if (duplicateNames.length > 0) {
  md.push('| Normalised name | Count | First 3 ids |');
  md.push('| --- | ---: | --- |');
  for (const g of duplicateNames.slice(0, 20)) {
    const ids = g.entries.slice(0, 3).map((e) => `${e.id} (${e.area})`).join(', ');
    md.push(`| ${g.name} | ${g.count} | ${ids} |`);
  }
  if (duplicateNames.length > 20) md.push(`| _…${duplicateNames.length - 20} more_ | | |`);
}
md.push('');

md.push('## Near-coincident coords (< 5 m apart, different ids)');
md.push('');
md.push(`${coordClusters.length} pairs found.`);
md.push('');
if (coordClusters.length > 0) {
  md.push('| Distance (m) | id A | name A | id B | name B |');
  md.push('| ---: | ---: | --- | ---: | --- |');
  for (const c of coordClusters.slice(0, 30)) {
    md.push(`| ${c.distanceM} | ${c.ids[0]} | ${c.names[0]} | ${c.ids[1]} | ${c.names[1]} |`);
  }
  if (coordClusters.length > 30) md.push(`| _…${coordClusters.length - 30} more_ | | | | |`);
}
md.push('');

writeFileSync(join(OUT_DIR, 'completeness.md'), md.join('\n'));

console.log(
  `completeness.md written: ${total} terraces, ${duplicateIds.length} dup ids, ${duplicateNames.length} dup names, ${coordClusters.length} coord clusters.`,
);
