#!/usr/bin/env tsx
/**
 * One-off batch importer for the 108 pre-curated cafe/coffee venues at
 * `scripts/competitor-research/cafes-108.json` (provided by Andy on
 * 2026-05-14 — already has name + address + lat/lng + rating + reviews
 * + type + neighbourhood, sourced from Google Places).
 *
 * Differs from `import-coffee-shops.ts` in that NO Google Places API
 * call is needed: the JSON ships with everything we need. Pure
 * filesystem work. Zero API cost.
 *
 * What it does for each venue:
 *
 *   1. Find the closest existing terrace within DEDUPE_DISTANCE_M
 *      (60m) that also has name-overlap ≥ DEDUPE_NAME_OVERLAP_THRESHOLD
 *      (0.6 of tokens).
 *
 *      - If matched → annotate that terrace with `category: ['coffee']`
 *        if it's not already tagged. Preserves whatever sun-relevant
 *        fields (facing, capacity, vibe) we already curated.
 *      - If not matched → create a fresh Terrace entry with
 *        `category: ['coffee']`, `coordSource: 'manual'` (the coords
 *        came from Andy's source, not directly from our places import).
 *
 *   2. Map the venue's neighbourhood field to one of our 27 area names
 *      via NEIGHBOURHOOD_TO_AREA. Unknown neighbourhoods fall through
 *      to the nearest-existing-terrace's area, so they still get a
 *      sensible region rollup.
 *
 * Usage (PowerShell):
 *   npm run import-cafe-batch -- --dry-run    # preview
 *   npm run import-cafe-batch -- --apply      # write
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Capacity, Facing, Terrace } from '../src/engines/types';

interface InputVenue {
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

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const INPUT_PATH = join(ROOT, 'scripts', 'competitor-research', 'cafes-108.json');
const LOG_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'cafe-batch-import-log.jsonl',
);

const DEDUPE_DISTANCE_M = 60;
const DEDUPE_NAME_OVERLAP_THRESHOLD = 0.6;

/**
 * Andy's input uses neighbourhood names that don't all match our
 * canonical area list (src/data/regions.ts). Translate them where we
 * can; unmapped ones fall through to nearest-existing-terrace lookup.
 */
const NEIGHBOURHOOD_TO_AREA: Record<string, string> = {
  // Direct matches with our area names
  Centrum: 'Centrum',
  Jordaan: 'Jordaan',
  Noord: 'Noord',
  Oost: 'Oost',
  Plantage: 'Plantage',
  Westerpark: 'Westerpark',
  'De Pijp': 'De Pijp',
  'Oud-West': 'Oud-West',
  Zuidas: 'Zuidas',
  Leidseplein: 'Leidseplein',
  Rivierenbuurt: 'Rivierenbuurt',
  Watergraafsmeer: 'Watergraafsmeer',
  'Bos en Lommer': 'Bos en Lommer',

  // Translations
  'Oud-South': 'Oud-Zuid', // Andy's data uses English; ours uses Dutch
  Buitenveldert: 'Zuid', // Buitenveldert isn't a fine-grained area
  // but rolls up to Zuid in the region
  'Nieuw-West': 'West', // No fine-grained area; folds into West for now
};

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

function findExistingMatch(
  v: InputVenue,
  existing: readonly Terrace[],
): Terrace | null {
  let best: { t: Terrace; d: number } | null = null;
  for (const t of existing) {
    const d = distMeters(v, t);
    if (d > DEDUPE_DISTANCE_M) continue;
    const sim = Math.max(
      nameOverlap(v.name, t.name),
      nameOverlap(t.name, v.name),
    );
    if (sim < DEDUPE_NAME_OVERLAP_THRESHOLD) continue;
    if (!best || d < best.d) best = { t, d };
  }
  return best?.t ?? null;
}

function nearestAreaName(
  c: { lat: number; lng: number },
  existing: readonly Terrace[],
): string {
  if (existing.length === 0) return 'Centrum';
  let best: Terrace = existing[0]!;
  let bestD = distMeters(c, best);
  for (const t of existing) {
    const d = distMeters(c, t);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best.area;
}

function resolveArea(
  v: InputVenue,
  existing: readonly Terrace[],
): string {
  const mapped = NEIGHBOURHOOD_TO_AREA[v.neighbourhood];
  if (mapped) return mapped;
  return nearestAreaName(v, existing);
}

interface Outcome {
  inputName: string;
  rank: number;
  kind:
    | 'annotated_existing'
    | 'already_tagged_coffee'
    | 'imported';
  reason?: string;
  existingId?: number;
  newId?: number;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${args.apply ? 'APPLY (writes terraces.json)' : 'DRY-RUN'}\n`);

  const input = JSON.parse(readFileSync(INPUT_PATH, 'utf-8')) as {
    venues: InputVenue[];
  };
  console.log(`Loaded ${input.venues.length} input venues`);

  const terraces = JSON.parse(
    readFileSync(TERRACES_PATH, 'utf-8'),
  ) as Terrace[];
  console.log(`Loaded ${terraces.length} existing terraces`);

  const existingCategoryAdditions = new Map<number, Set<string>>();
  const newEntries: Terrace[] = [];
  const outcomes: Outcome[] = [];
  let nextId =
    terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;

  for (const v of input.venues) {
    const match = findExistingMatch(v, terraces);
    if (match) {
      const alreadyCoffee = (match.category ?? []).includes('coffee');
      if (alreadyCoffee) {
        outcomes.push({
          inputName: v.name,
          rank: v.rank,
          kind: 'already_tagged_coffee',
          reason: `matches #${match.id} "${match.name}"`,
          existingId: match.id,
        });
      } else {
        const set = existingCategoryAdditions.get(match.id) ?? new Set<string>();
        set.add('coffee');
        existingCategoryAdditions.set(match.id, set);
        outcomes.push({
          inputName: v.name,
          rank: v.rank,
          kind: 'annotated_existing',
          reason: `matches #${match.id} "${match.name}"`,
          existingId: match.id,
        });
      }
    } else {
      const area = resolveArea(v, terraces);
      const newTerrace: Terrace = {
        id: nextId++,
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        area,
        facing: 'S' as Facing,
        capacity: 'S' as Capacity,
        vibe: v.type,
        address: v.address,
        verified: true,
        coordSource: 'manual',
        verifiedAt: new Date().toISOString(),
        category: ['coffee'],
      };
      newEntries.push(newTerrace);
      terraces.push(newTerrace); // in-loop dedupe
      outcomes.push({
        inputName: v.name,
        rank: v.rank,
        kind: 'imported',
        newId: newTerrace.id,
      });
    }
  }

  console.log('\n— Summary —');
  const tally = outcomes.reduce<Record<string, number>>((m, o) => {
    m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, {});
  for (const [k, n] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(24)} ${n}`);
  }

  // Always log outcomes
  const stamp = new Date().toISOString();
  for (const o of outcomes) {
    appendFileSync(LOG_PATH, JSON.stringify({ stamp, ...o }) + '\n');
  }
  console.log(`\nAppended ${outcomes.length} outcomes to ${LOG_PATH}`);

  if (!args.apply) {
    console.log('\n(dry run — no terraces.json writes)');
    console.log('Re-run with --apply to commit imports + annotations.');
    return;
  }

  // Re-read to avoid persisting in-loop dedupe scratch
  const original = JSON.parse(
    readFileSync(TERRACES_PATH, 'utf-8'),
  ) as Terrace[];
  const merged: Terrace[] = original.map((t) => {
    const adds = existingCategoryAdditions.get(t.id);
    if (!adds) return t;
    const existingCats = new Set<string>(t.category ?? []);
    for (const c of adds) existingCats.add(c);
    return { ...t, category: Array.from(existingCats) };
  });
  for (const e of newEntries) merged.push(e);

  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(
    `\nWrote ${merged.length} terraces to ${TERRACES_PATH} ` +
      `(+${newEntries.length} new, ${existingCategoryAdditions.size} annotated)`,
  );
}

main();
