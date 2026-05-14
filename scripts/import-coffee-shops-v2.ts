#!/usr/bin/env tsx
/**
 * Bulk-import the v2 coffee dataset
 * (`scripts/competitor-research/coffee-shops-v2.json`).
 *
 * Differs from the earlier `import-coffee-shops.ts` in two important
 * ways:
 *
 *   1. NO Places API queries needed. The v2 JSON already carries each
 *      venue's lat/lng, address, rating, and review count from an
 *      external Places run. We trust that data; this script just
 *      writes it into `terraces.json` in the right shape.
 *
 *   2. Handles dedupe by (name-overlap + 60m proximity) against the
 *      live dataset. For an existing match we ONLY annotate the
 *      `category` field with 'coffee' (preserving any human edits to
 *      vibe / facing / capacity) and fill in `googleRating` /
 *      `googleReviewCount` if they were absent. For new entries we
 *      create a fresh Terrace.
 *
 * Usage (PowerShell):
 *   npm run import-coffee-v2 -- --dry-run    # preview
 *   npm run import-coffee-v2 -- --apply      # write
 *
 * No API key needed — purely local data transformation.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Capacity, Facing, Terrace } from '../src/engines/types';

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const SOURCE_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'coffee-shops-v2.json',
);
const LOG_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'coffee-import-v2-log.jsonl',
);

interface SourceVenue {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviews: number;
  type: string;
  neighbourhood: string;
  rank: number;
}

interface SourceFile {
  metadata: Record<string, unknown>;
  venues: SourceVenue[];
}

/** Same-building proximity threshold for dedupe. */
const DEDUPE_DISTANCE_M = 60;
const DEDUPE_NAME_OVERLAP_THRESHOLD = 0.6;

interface Args {
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false };
  for (const tok of argv) {
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
  }
  return a;
}

function distMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
  const dx = (b.lng - a.lng) * M_PER_DEG_LNG;
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameOverlap(a: string, b: string): number {
  const aTokens = normName(a).split(' ').filter((t) => t.length >= 3);
  if (aTokens.length === 0) return 0;
  const nb = normName(b);
  const hits = aTokens.filter((t) => nb.includes(t)).length;
  return hits / aTokens.length;
}

/**
 * Map the source neighbourhood string to one of our existing area names.
 * Most match directly; a couple need translation:
 *   - "Oud-South" → "Oud-Zuid" (the source uses an English spelling)
 *   - everything else: passed through and assumed valid in regions.ts
 */
function mapArea(neighbourhood: string): string {
  if (neighbourhood === 'Oud-South') return 'Oud-Zuid';
  return neighbourhood;
}

/** Convert the source `type` string to our `vibe` field — short, lower-cased. */
function deriveVibe(type: string): string {
  // Strip slashes / extra parens / collapse — these come through as
  // "Brunch/Coffee", "Coffee/Cafe", "Specialty Coffee/Matcha" etc.
  const cleaned = type.replace(/\//g, ' + ').trim();
  return cleaned || 'Specialty coffee';
}

function findExistingMatch(
  src: SourceVenue,
  existing: readonly Terrace[],
): Terrace | null {
  let best: { t: Terrace; d: number } | null = null;
  for (const t of existing) {
    const d = distMeters(src, t);
    if (d > DEDUPE_DISTANCE_M) continue;
    const sim = Math.max(
      nameOverlap(src.name, t.name),
      nameOverlap(t.name, src.name),
    );
    if (sim < DEDUPE_NAME_OVERLAP_THRESHOLD) continue;
    if (!best || d < best.d) best = { t, d };
  }
  return best?.t ?? null;
}

interface Outcome {
  rank: number;
  name: string;
  kind: 'annotated_existing' | 'imported';
  existingId?: number;
  newId?: number;
  notes?: string;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Mode: ${args.apply ? 'APPLY (writes terraces.json)' : 'DRY-RUN'}`);
  console.log();

  const source = JSON.parse(readFileSync(SOURCE_PATH, 'utf-8')) as SourceFile;
  console.log(
    `Source: ${source.venues.length} venues from ${SOURCE_PATH.replace(ROOT, '.')}`,
  );

  const original = JSON.parse(
    readFileSync(TERRACES_PATH, 'utf-8'),
  ) as Terrace[];
  console.log(`Existing terraces: ${original.length}`);

  // Working copy for in-loop dedupe.
  const terraces: Terrace[] = original.map((t) => ({ ...t }));
  const newEntries: Terrace[] = [];
  const annotated = new Map<number, Set<string>>();
  const ratingAdded = new Map<number, { rating: number; reviews: number }>();
  const outcomes: Outcome[] = [];
  let nextId = terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;

  for (const v of source.venues) {
    const match = findExistingMatch(v, terraces);
    if (match) {
      const cats = new Set<string>(match.category ?? []);
      if (!cats.has('coffee')) cats.add('coffee');
      annotated.set(match.id, cats);
      // If the existing entry doesn't have rating data, fill it in
      // from this source. We don't overwrite — first-write-wins so
      // multiple-location entries don't clobber each other with the
      // wrong location's rating.
      if (match.googleRating == null && match.googleReviewCount == null) {
        ratingAdded.set(match.id, { rating: v.rating, reviews: v.reviews });
      }
      outcomes.push({
        rank: v.rank,
        name: v.name,
        kind: 'annotated_existing',
        existingId: match.id,
        notes: `matched "${match.name}" (dist ${distMeters(v, match).toFixed(0)}m)`,
      });
      continue;
    }

    const newTerrace: Terrace = {
      id: nextId++,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      area: mapArea(v.neighbourhood),
      facing: 'S' as Facing,
      capacity: 'S' as Capacity,
      vibe: deriveVibe(v.type),
      address: `${v.address}, Amsterdam`,
      verified: true,
      coordSource: 'places_api',
      verifiedAt: new Date().toISOString(),
      category: ['coffee'],
      googleRating: v.rating,
      googleReviewCount: v.reviews,
    };
    newEntries.push(newTerrace);
    terraces.push(newTerrace); // for in-loop dedupe of the next iter
    outcomes.push({
      rank: v.rank,
      name: v.name,
      kind: 'imported',
      newId: newTerrace.id,
    });
  }

  // Tally.
  const tally = outcomes.reduce<Record<string, number>>((m, o) => {
    m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, {});
  console.log('\n— Summary —');
  for (const [k, n] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(22)} ${n}`);
  }
  console.log(
    `  rating-added (existing) ${ratingAdded.size}`,
  );

  // Always write the log.
  const stamp = new Date().toISOString();
  for (const o of outcomes) {
    appendFileSync(LOG_PATH, JSON.stringify({ stamp, ...o }) + '\n');
  }
  console.log(`\nLog written: ${LOG_PATH.replace(ROOT, '.')}`);

  if (!args.apply) {
    console.log('\n(dry run — terraces.json NOT modified)');
    console.log('Re-run with --apply to commit.');
    return;
  }

  // Apply annotations to existing entries + append new ones.
  const merged: Terrace[] = original.map((t) => {
    let out = t;
    const cats = annotated.get(t.id);
    if (cats) out = { ...out, category: Array.from(cats) };
    const r = ratingAdded.get(t.id);
    if (r) out = { ...out, googleRating: r.rating, googleReviewCount: r.reviews };
    return out;
  });
  for (const e of newEntries) merged.push(e);

  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(
    `\nWrote ${merged.length} terraces to ${TERRACES_PATH.replace(ROOT, '.')} ` +
      `(+${newEntries.length} new, ${annotated.size} annotated, ${ratingAdded.size} ratings backfilled)`,
  );
}

main();
