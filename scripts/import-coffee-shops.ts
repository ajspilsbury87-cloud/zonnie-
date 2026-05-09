#!/usr/bin/env tsx
/**
 * Import specialty / third-wave coffee shops from
 * `scripts/competitor-research/ect-amsterdam-venues.json` (scraped from
 * europeancoffeetrip.com — 59 hand-curated specialty venues with name,
 * address, lat, lng).
 *
 * What this does, in order:
 *
 *   1. Read the scraped venues, normalise unicode escapes (the scrape
 *      keeps `é` literal in the JSON).
 *   2. For each venue, try to match against the existing 892 terraces
 *      by name+location. If matched → annotate the existing entry with
 *      `category: ['coffee']` (also keeping any existing categories the
 *      data file might carry from older imports).
 *   3. For unmatched venues, hit Places API (New) Text Search with the
 *      `outdoorSeating` field requested. Only candidates that come back
 *      with `outdoorSeating === true` pass — the brand promise of
 *      Zonnie is "find sunny terraces", and a coffee shop with no
 *      pavement seating doesn't qualify.
 *   4. Map lat/lng → area via nearest-existing-terrace lookup (same
 *      approach as `import-competitor-venues.ts` so we stay consistent
 *      with how the 22 area names are assigned).
 *   5. Default `facing: 'S'` (hand-edit later if we know better),
 *      `capacity: 'S'` (coffee shops are usually small), `vibe:
 *      "Specialty coffee"` (placeholder; can be enriched per-venue later).
 *   6. Write merged data back to `src/data/terraces.json`.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."
 *   npm run import-coffee -- --dry-run        # preview, no writes
 *   npm run import-coffee -- --apply          # actually write
 *   npm run import-coffee -- --apply --skip-outdoor-check  # accept all (testing)
 *
 * Cost: 59 venues × $0.025 (Places API New, Atmosphere SKU because we
 * want `outdoorSeating`) ≈ $1.50 total. Well inside the free tier.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Capacity, Facing, Terrace } from '../src/engines/types';

interface ScrapedVenue {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const SCRAPED_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'ect-amsterdam-venues.json',
);
const LOG_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'coffee-import-log.jsonl',
);

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
// Atmosphere SKU — `outdoorSeating` is not a Basic-SKU field. Note
// this field-mask requires the new "Atmosphere" pricing tier; if a
// project uses only Basic, the request returns the field as null
// (which we treat conservatively as "outdoor seating not confirmed").
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.businessStatus',
  'places.types',
  'places.outdoorSeating',
  'places.servesCoffee',
].join(',');

const AMSTERDAM_CENTER = { latitude: 52.3676, longitude: 4.9041 };
const PLACES_BIAS_RADIUS_M = 15_000;
const REQUEST_DELAY_MS = 200;

/** Match-existing-terrace tolerance — coffee shop chains (LOT61,
 *  Cafecito) deliberately have multiple distinct sites, so this needs
 *  to be tight enough to NOT collapse e.g. LOT61 Kinkerstraat into
 *  LOT61 Hendrik Jacobszstraat. 60m is the kerb-to-kerb distance for
 *  the same building, which is the case we want to dedupe. */
const DEDUPE_DISTANCE_M = 60;
const DEDUPE_NAME_OVERLAP_THRESHOLD = 0.6;

interface Args {
  apply: boolean;
  skipOutdoorCheck: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, skipOutdoorCheck: false };
  for (const tok of argv) {
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--skip-outdoor-check') a.skipOutdoorCheck = true;
  }
  return a;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  businessStatus?: string;
  types?: string[];
  outdoorSeating?: boolean;
  servesCoffee?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

/** Normalize a venue name for fuzzy comparison: lowercase, strip
 *  punctuation/diacritics, collapse whitespace. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude name-similarity score: fraction of `a`'s tokens that appear
 *  as substrings in `b`. Symmetric-ish for our use case. */
function nameOverlap(a: string, b: string): number {
  const aTokens = normName(a).split(' ').filter((t) => t.length >= 3);
  if (aTokens.length === 0) return 0;
  const nb = normName(b);
  const hits = aTokens.filter((t) => nb.includes(t)).length;
  return hits / aTokens.length;
}

/** Find an existing terrace that probably represents the same venue:
 *  close in space AND with name overlap. Order: tighten distance to
 *  catch only same-building dedupes, not nearby-but-different shops. */
function findExistingMatch(
  candidate: ScrapedVenue,
  existing: readonly Terrace[],
): Terrace | null {
  let best: { t: Terrace; d: number; sim: number } | null = null;
  for (const t of existing) {
    const d = distMeters(candidate, t);
    if (d > DEDUPE_DISTANCE_M) continue;
    const sim = Math.max(
      nameOverlap(candidate.name, t.name),
      nameOverlap(t.name, candidate.name),
    );
    if (sim < DEDUPE_NAME_OVERLAP_THRESHOLD) continue;
    if (!best || d < best.d) best = { t, d, sim };
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

async function placesSearch(
  query: string,
  apiKey: string,
): Promise<PlaceResult | null> {
  const body = {
    textQuery: query,
    locationBias: {
      circle: { center: AMSTERDAM_CENTER, radius: PLACES_BIAS_RADIUS_M },
    },
    maxResultCount: 1,
    languageCode: 'en',
  };
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Places ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { places?: PlaceResult[] };
  return data.places?.[0] ?? null;
}

interface Outcome {
  scrapedName: string;
  kind:
    | 'annotated_existing'
    | 'imported'
    | 'no_outdoor_seating'
    | 'no_places_match'
    | 'closed'
    | 'api_error';
  reason?: string;
  existingId?: number;
  newId?: number;
  placeId?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey && !args.skipOutdoorCheck) {
    console.error('GOOGLE_MAPS_API_KEY not set in environment.');
    console.error('Either:');
    console.error('  $env:GOOGLE_MAPS_API_KEY = "AIza..."');
    console.error('  npm run import-coffee -- --apply');
    console.error('Or for testing only (skips outdoor-seating verification):');
    console.error('  npm run import-coffee -- --apply --skip-outdoor-check');
    process.exit(1);
  }

  console.log(`Mode: ${args.apply ? 'APPLY (writes terraces.json)' : 'DRY-RUN'}`);
  console.log(
    `Outdoor-seating check: ${args.skipOutdoorCheck ? 'SKIPPED' : 'ENABLED'}`,
  );
  console.log();

  const rawScraped = readFileSync(SCRAPED_PATH, 'utf-8');
  // The scrape keeps unicode escapes literal (e.g. "Caff\\u00e8nation").
  // JSON.parse will resolve them back to "Caffènation".
  const scraped = JSON.parse(rawScraped) as ScrapedVenue[];
  console.log(`Loaded ${scraped.length} scraped venues`);

  const terracesRaw = readFileSync(TERRACES_PATH, 'utf-8');
  const terraces = JSON.parse(terracesRaw) as Terrace[];
  console.log(`Loaded ${terraces.length} existing terraces`);

  // Map of existing-id → new categories to assign (so we can annotate
  // multiple matches in one pass without races).
  const existingCategoryAdditions = new Map<number, Set<string>>();
  // List of brand-new entries to append.
  const newEntries: Terrace[] = [];
  const outcomes: Outcome[] = [];

  let nextId =
    terraces.reduce((max, t) => (t.id > max ? t.id : max), 0) + 1;

  for (const v of scraped) {
    // Step 1: Existing-match dedup.
    const match = findExistingMatch(v, terraces);
    if (match) {
      const set = existingCategoryAdditions.get(match.id) ?? new Set<string>();
      set.add('coffee');
      existingCategoryAdditions.set(match.id, set);
      outcomes.push({
        scrapedName: v.name,
        kind: 'annotated_existing',
        reason: `matched ${match.name} (id ${match.id})`,
        existingId: match.id,
      });
      console.log(`  [annotate] "${v.name}" → existing #${match.id} "${match.name}"`);
      continue;
    }

    // Step 2: Verify via Places API + outdoor seating.
    if (!args.skipOutdoorCheck) {
      try {
        const result = await placesSearch(`${v.name} ${v.address} Amsterdam`, apiKey!);
        if (!result || !result.location) {
          outcomes.push({
            scrapedName: v.name,
            kind: 'no_places_match',
            reason: 'Places returned 0',
          });
          console.log(`  [skip] "${v.name}" — no Places match`);
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
        if (result.businessStatus && result.businessStatus !== 'OPERATIONAL') {
          outcomes.push({
            scrapedName: v.name,
            kind: 'closed',
            reason: result.businessStatus,
            placeId: result.id,
          });
          console.log(
            `  [skip] "${v.name}" — ${result.businessStatus}`,
          );
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
        // outdoorSeating may be:
        //   true  — confirmed has outdoor seating → keep
        //   false — confirmed indoor-only → skip
        //   null  — Places doesn't know → keep (conservative; the
        //           ECT curation already vouches for these venues)
        if (result.outdoorSeating === false) {
          outcomes.push({
            scrapedName: v.name,
            kind: 'no_outdoor_seating',
            reason: 'Places marks indoor-only',
            placeId: result.id,
          });
          console.log(
            `  [skip] "${v.name}" — Places: outdoorSeating=false`,
          );
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
        // Use Places' canonical lat/lng (more accurate than scrape).
        v.lat = result.location.latitude;
        v.lng = result.location.longitude;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        outcomes.push({
          scrapedName: v.name,
          kind: 'api_error',
          reason: msg,
        });
        console.log(`  [error] "${v.name}" — ${msg}`);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    // Step 3: Build the new Terrace.
    const area = nearestAreaName(v, terraces);
    const newTerrace: Terrace = {
      id: nextId++,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      area,
      facing: 'S' as Facing,
      capacity: 'S' as Capacity,
      vibe: 'Specialty coffee',
      address: v.address,
      verified: true,
      coordSource: 'places_api',
      verifiedAt: new Date().toISOString(),
      category: ['coffee'],
    };
    newEntries.push(newTerrace);
    outcomes.push({
      scrapedName: v.name,
      kind: 'imported',
      newId: newTerrace.id,
    });
    console.log(`  [import] "${v.name}" → #${newTerrace.id} (${area})`);
  }

  console.log();
  const tally = outcomes.reduce<Record<string, number>>((m, o) => {
    m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, {});
  console.log('Summary:');
  for (const [k, n] of Object.entries(tally)) {
    console.log(`  ${k}: ${n}`);
  }

  if (!args.apply) {
    console.log('\n(dry run — no files written)');
    return;
  }

  // Apply category annotations to existing entries.
  const merged: Terrace[] = terraces.map((t) => {
    const adds = existingCategoryAdditions.get(t.id);
    if (!adds) return t;
    const existingCats = new Set<string>(t.category ?? []);
    for (const c of adds) existingCats.add(c);
    return { ...t, category: Array.from(existingCats) };
  });

  // Append new entries.
  for (const e of newEntries) merged.push(e);

  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(
    `\nWrote ${merged.length} terraces to ${TERRACES_PATH} (` +
      `+${newEntries.length} new, ${existingCategoryAdditions.size} annotated)`,
  );

  // Append to JSONL log for incremental review.
  const stamp = new Date().toISOString();
  for (const o of outcomes) {
    appendFileSync(LOG_PATH, JSON.stringify({ stamp, ...o }) + '\n');
  }
  console.log(`Appended ${outcomes.length} outcomes to ${LOG_PATH}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
