#!/usr/bin/env tsx
/**
 * Bulk-import specialty / third-wave coffee shops listed by European
 * Coffee Trip (https://europeancoffeetrip.com/amsterdam/) into the
 * Zonnie dataset.
 *
 * Input: `scripts/competitor-research/coffee-shops-ect.json` — a flat
 * JSON array of venue names extracted from the ECT page. Chains where
 * the same brand has multiple Amsterdam locations are listed once per
 * location with the location qualifier embedded in the name (e.g.
 * "Cafecito Nassaukade" vs "Cafecito Overtoom") so Places API
 * disambiguates them on lookup.
 *
 * For each name:
 *
 *   1. Query Google Places API (New) Text Search with the name biased
 *      toward Amsterdam, requesting `outdoorSeating` + `servesCoffee`
 *      atmosphere fields.
 *   2. Skip anything Places marks as:
 *        - businessStatus CLOSED_*
 *        - outside the Amsterdam metro bbox
 *        - `outdoorSeating: false` (Zonnie's brand promise is sunny
 *          terraces; coffee shops with no outdoor seating don't
 *          qualify). `outdoorSeating: null/undefined` is allowed
 *          through — Places' data is incomplete and ECT's editorial
 *          vetting is a stronger signal than Places' silence.
 *   3. Dedupe in two passes:
 *        a. Exact-placeId match against any existing terrace → annotate
 *           that terrace with `category: ['coffee']` (preserves
 *           hand-edits like vibe, capacity).
 *        b. 60m proximity + name-overlap match → same annotation. Catches
 *           the same venue added earlier under a different name
 *           spelling (we have ~890 entries from a prior import; some
 *           overlap is likely).
 *      Otherwise → create new entry with `category: ['coffee']`.
 *   4. Map lat/lng → area via nearest-existing-terrace lookup.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."   # Places API key, NOT the
 *                                          # restricted Android-Maps key
 *   npm run import-coffee-shops -- --dry-run        # preview, no writes
 *   npm run import-coffee-shops -- --apply          # write terraces.json
 *
 * Cost: Atmosphere SKU (needed for outdoorSeating) ≈ $0.025/req.
 *       ~60 candidates × $0.025 ≈ $1.50 total.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Capacity, Facing, Terrace } from '../src/engines/types';

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const NAMES_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'coffee-shops-ect.json',
);
const LOG_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'coffee-import-log.jsonl',
);

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
// `outdoorSeating` requires the Atmosphere SKU (Pro/Enterprise tier);
// projects on Basic only see it as undefined. Both cases handled below.
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
const AMSTERDAM_BBOX = {
  minLat: 52.27,
  maxLat: 52.45,
  minLng: 4.7,
  maxLng: 5.05,
};
const PLACES_BIAS_RADIUS_M = 15_000;
const REQUEST_DELAY_MS = 200;

/** Same-building proximity threshold — tight enough that distinct
 *  chain locations on different streets are kept separate. */
const DEDUPE_DISTANCE_M = 60;
const DEDUPE_NAME_OVERLAP_THRESHOLD = 0.6;

interface Args {
  apply: boolean;
  /** Skip Places API entirely; treat all candidates as importable. For
   *  schema-validation testing only — never use for real data. */
  skipPlaces: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, skipPlaces: false };
  for (const tok of argv) {
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--skip-places') a.skipPlaces = true;
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

function isInAmsterdam(c: { lat: number; lng: number }): boolean {
  return (
    c.lat >= AMSTERDAM_BBOX.minLat &&
    c.lat <= AMSTERDAM_BBOX.maxLat &&
    c.lng >= AMSTERDAM_BBOX.minLng &&
    c.lng <= AMSTERDAM_BBOX.maxLng
  );
}

/** Strip diacritics/punctuation and collapse whitespace for name match. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fraction of `a`'s tokens (3+ chars) that appear as substrings in `b`. */
function nameOverlap(a: string, b: string): number {
  const aTokens = normName(a).split(' ').filter((t) => t.length >= 3);
  if (aTokens.length === 0) return 0;
  const nb = normName(b);
  const hits = aTokens.filter((t) => nb.includes(t)).length;
  return hits / aTokens.length;
}

/** Find an existing terrace that probably represents the same venue:
 *  close in space AND with name overlap. Tight distance to avoid
 *  collapsing chain locations on nearby streets. */
function findExistingMatch(
  ectName: string,
  coord: { lat: number; lng: number },
  existing: readonly Terrace[],
): Terrace | null {
  let best: { t: Terrace; d: number } | null = null;
  for (const t of existing) {
    const d = distMeters(coord, t);
    if (d > DEDUPE_DISTANCE_M) continue;
    const sim = Math.max(
      nameOverlap(ectName, t.name),
      nameOverlap(t.name, ectName),
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

async function placesSearch(
  query: string,
  apiKey: string,
): Promise<PlaceResult | null> {
  // Appending "coffee Amsterdam" tightens the search to the right city
  // and venue type — short/ambiguous names like "Skina", "Yusu", "LERA"
  // get reliably resolved this way.
  const body = {
    textQuery: `${query} coffee Amsterdam`,
    locationBias: {
      circle: { center: AMSTERDAM_CENTER, radius: PLACES_BIAS_RADIUS_M },
    },
    maxResultCount: 1,
    languageCode: 'en',
    includedType: 'cafe',
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
  ectName: string;
  kind:
    | 'annotated_existing'
    | 'imported'
    | 'no_outdoor_seating'
    | 'no_places_match'
    | 'out_of_bounds'
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
  if (!apiKey && !args.skipPlaces) {
    console.error('GOOGLE_MAPS_API_KEY not set in environment.');
    console.error('');
    console.error('Set it with:');
    console.error('  $env:GOOGLE_MAPS_API_KEY = "AIza..."');
    console.error('');
    console.error('Must be a key with Places API (New) enabled. NOT the');
    console.error('GOOGLE_MAPS_ANDROID_API_KEY in EAS — that one is');
    console.error('restricted to "Maps SDK for Android" only.');
    process.exit(1);
  }

  console.log(`Mode: ${args.apply ? 'APPLY (writes terraces.json)' : 'DRY-RUN'}`);
  console.log(`Places API check: ${args.skipPlaces ? 'SKIPPED' : 'ENABLED'}`);
  console.log();

  const names = JSON.parse(readFileSync(NAMES_PATH, 'utf-8')) as string[];
  console.log(`Loaded ${names.length} ECT-listed coffee shops`);

  const terraces = JSON.parse(
    readFileSync(TERRACES_PATH, 'utf-8'),
  ) as Terrace[];
  console.log(`Loaded ${terraces.length} existing terraces`);

  const existingByPlaceId = new Map<string, Terrace>();
  for (const t of terraces) {
    if (t.placeId) existingByPlaceId.set(t.placeId, t);
  }

  // Annotations to apply on existing entries (place_id or proximity
  // matched) → category set additions.
  const existingCategoryAdditions = new Map<number, Set<string>>();
  const newEntries: Terrace[] = [];
  const outcomes: Outcome[] = [];
  let nextId = terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;

  for (const name of names) {
    let outcome: Outcome;

    try {
      let placeResult: PlaceResult | null = null;
      if (!args.skipPlaces) {
        placeResult = await placesSearch(name, apiKey!);
      }
      if (!args.skipPlaces && (!placeResult || !placeResult.location)) {
        outcome = { ectName: name, kind: 'no_places_match' };
      } else if (
        placeResult?.businessStatus &&
        placeResult.businessStatus !== 'OPERATIONAL'
      ) {
        outcome = {
          ectName: name,
          kind: 'closed',
          reason: placeResult.businessStatus,
          placeId: placeResult.id,
        };
      } else if (placeResult?.outdoorSeating === false) {
        // Confirmed indoor-only. Skip.
        outcome = {
          ectName: name,
          kind: 'no_outdoor_seating',
          reason: 'Places marks outdoorSeating=false',
          placeId: placeResult.id,
        };
      } else if (
        placeResult?.location &&
        !isInAmsterdam({
          lat: placeResult.location.latitude,
          lng: placeResult.location.longitude,
        })
      ) {
        outcome = {
          ectName: name,
          kind: 'out_of_bounds',
          reason: placeResult.formattedAddress,
          placeId: placeResult.id,
        };
      } else if (
        placeResult?.id &&
        existingByPlaceId.has(placeResult.id)
      ) {
        const ex = existingByPlaceId.get(placeResult.id)!;
        const set =
          existingCategoryAdditions.get(ex.id) ?? new Set<string>();
        set.add('coffee');
        existingCategoryAdditions.set(ex.id, set);
        outcome = {
          ectName: name,
          kind: 'annotated_existing',
          reason: `placeId ${placeResult.id} matches existing #${ex.id} "${ex.name}"`,
          existingId: ex.id,
          placeId: placeResult.id,
        };
      } else if (placeResult?.location) {
        const coord = {
          lat: placeResult.location.latitude,
          lng: placeResult.location.longitude,
        };
        // Proximity-fallback dedupe (no shared placeId — older entry
        // pre-dates the placeId backfill, or same brand close enough).
        const proxMatch = findExistingMatch(name, coord, terraces);
        if (proxMatch) {
          const set =
            existingCategoryAdditions.get(proxMatch.id) ?? new Set<string>();
          set.add('coffee');
          existingCategoryAdditions.set(proxMatch.id, set);
          outcome = {
            ectName: name,
            kind: 'annotated_existing',
            reason: `within ${DEDUPE_DISTANCE_M}m of "${proxMatch.name}" (id ${proxMatch.id})`,
            existingId: proxMatch.id,
            placeId: placeResult.id,
          };
        } else {
          // New entry.
          const newTerrace: Terrace = {
            id: nextId++,
            name: placeResult.displayName?.text ?? name,
            lat: coord.lat,
            lng: coord.lng,
            area: nearestAreaName(coord, terraces),
            facing: 'S' as Facing,
            capacity: 'S' as Capacity,
            vibe: 'Specialty coffee',
            address: placeResult.formattedAddress ?? '',
            verified: true,
            coordSource: 'places_api',
            verifiedAt: new Date().toISOString(),
            placeId: placeResult.id,
            category: ['coffee'],
          };
          newEntries.push(newTerrace);
          // Mutate in-memory `terraces` for in-loop dedupe of the next
          // candidate (won't be persisted unless --apply).
          terraces.push(newTerrace);
          if (newTerrace.placeId) {
            existingByPlaceId.set(newTerrace.placeId, newTerrace);
          }
          outcome = {
            ectName: name,
            kind: 'imported',
            newId: newTerrace.id,
            placeId: placeResult.id,
          };
        }
      } else {
        // --skip-places path: fabricate a minimal entry with no coords.
        // For schema-validation testing ONLY; never use for real data.
        const newTerrace: Terrace = {
          id: nextId++,
          name,
          lat: AMSTERDAM_CENTER.latitude,
          lng: AMSTERDAM_CENTER.longitude,
          area: 'Centrum',
          facing: 'S' as Facing,
          capacity: 'S' as Capacity,
          vibe: 'Specialty coffee',
          address: '',
          verified: false,
          coordSource: 'estimated',
          category: ['coffee'],
        };
        newEntries.push(newTerrace);
        terraces.push(newTerrace);
        outcome = { ectName: name, kind: 'imported', newId: newTerrace.id };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outcome = { ectName: name, kind: 'api_error', reason: msg };
    }

    outcomes.push(outcome);
    const dot =
      outcome.kind === 'imported'
        ? '✓'
        : outcome.kind === 'annotated_existing'
          ? '·'
          : outcome.kind === 'no_outdoor_seating'
            ? '∅'
            : outcome.kind === 'no_places_match'
              ? '?'
              : 'x';
    process.stdout.write(dot);

    if (!args.skipPlaces) await sleep(REQUEST_DELAY_MS);
  }
  console.log();

  // Tally summary.
  console.log('\n— Summary —');
  const tally = outcomes.reduce<Record<string, number>>((m, o) => {
    m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, {});
  for (const [k, n] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(22)} ${n}`);
  }

  if (!args.apply) {
    console.log('\n(dry run — no files written)');
    console.log('Re-run with --apply to write the changes.');
    return;
  }

  // Re-read the file to avoid persisting the in-loop dedupe scratch.
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
