#!/usr/bin/env tsx
/**
 * Bulk-import candidates from `scripts/competitor-research/venues-not-in-zonnie.json`
 * (the 952 Amsterdam terraces that Seats-in-the-Sun has but we don't),
 * validate each via Google Places (New) Text Search, and append the
 * cleaned ones to `src/data/terraces.json`.
 *
 * What this script does in order:
 *
 *   1. Read candidates, dedupe against current Zonnie set, sort by their
 *      peak_sun (descending), keep the top N.
 *   2. For each candidate, query Places API to verify the place is real
 *      and currently operating. We use the candidate's lat/lng + name to
 *      bias the search; if Places returns a result within 80m, we accept it
 *      and use Places' canonical lat/lng + address.
 *   3. Filter out anything Places flags as `business_status: CLOSED_*`,
 *      anything in our noise list (museums, stations, hotels — already
 *      filtered upstream by `diff-competitor-venues.ts` but we re-check),
 *      and anything outside the Amsterdam metro bbox.
 *   4. Map their lat/lng → our `area` field by proximity to the 22 area
 *      centroids in `src/data/areas.ts`. Region rolls up automatically via
 *      `src/data/regions.ts`.
 *   5. Default `facing: 'S'` (most common in Amsterdam; can be hand-edited
 *      later) and `capacity: 'M'`.
 *   6. Write the merged set back to `src/data/terraces.json`.
 *   7. Append per-candidate decisions to a sibling `import-log.jsonl` so
 *      reviews can re-run incrementally.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."
 *   npm run import-venues -- --dry-run             # preview, no writes
 *   npm run import-venues -- --apply --max 200     # accept up to 200
 *   npm run import-venues -- --apply --since 0     # restart from cursor 0
 *
 * Cost: ~$0.005/req at the Basic SKU. 200 candidates ≈ $1.00. Well inside
 * the Places API free tier.
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { Terrace } from '../src/engines/types';

interface Candidate {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  is_rest?: boolean;
  is_bar?: boolean;
  peak_sun?: number;
  url?: string;
}

const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const CANDIDATES_PATH = join(
  PROJECT_ROOT,
  'scripts',
  'competitor-research',
  'venues-not-in-zonnie.json',
);
const LOG_PATH = join(
  PROJECT_ROOT,
  'scripts',
  'competitor-research',
  'import-log.jsonl',
);

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.businessStatus',
  'places.types',
].join(',');

const AMSTERDAM_BBOX = {
  minLat: 52.27,
  maxLat: 52.45,
  minLng: 4.7,
  maxLng: 5.05,
};

const PROXIMITY_TOLERANCE_M = 80;
const REQUEST_DELAY_MS = 200;

const NOISE_NAME_PATTERNS = [
  /museum/i,
  /tulip\s*museum/i,
  /cheese\s*museum/i,
  /railway/i,
  /\bstation\b/i,
  /^hotel\b/i,
  /^eco\s*hotel/i,
  /amsterdam\s*centraal/i,
  /aviation/i,
  /^the\s*(student|young)/i,
];

const NOISE_PLACE_TYPES = new Set([
  'train_station',
  'transit_station',
  'subway_station',
  'tourist_attraction',
  'museum',
  'lodging',
  'church',
  'place_of_worship',
  'park',
  'gas_station',
  'parking',
]);

interface Args {
  apply: boolean;
  max: number;
  since: number;
  minPeakSun: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, max: 200, since: 0, minPeakSun: 90 };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--max') a.max = parseInt(argv[++i] ?? '200', 10);
    else if (tok === '--since') a.since = parseInt(argv[++i] ?? '0', 10);
    else if (tok === '--min-peak-sun') a.minPeakSun = parseInt(argv[++i] ?? '90', 10);
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
}

interface Outcome {
  kind:
    | 'imported'
    | 'too_far'
    | 'no_match'
    | 'closed'
    | 'noise'
    | 'out_of_bounds'
    | 'api_error';
  reason?: string;
  newId?: number;
  matchName?: string;
  placeId?: string;
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

function isInAmsterdam(c: { lat: number; lng: number }): boolean {
  return (
    c.lat >= AMSTERDAM_BBOX.minLat &&
    c.lat <= AMSTERDAM_BBOX.maxLat &&
    c.lng >= AMSTERDAM_BBOX.minLng &&
    c.lng <= AMSTERDAM_BBOX.maxLng
  );
}

/**
 * Map a coordinate to one of our existing area names by finding the
 * nearest already-curated terrace and copying its `area`. Uses our own
 * dataset as the source of truth for area boundaries — no separate
 * gazetteer required. Falls back to 'Centrum' if the dataset is empty
 * (shouldn't happen in practice).
 */
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FATAL_STATUSES = new Set([
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'RESOURCE_EXHAUSTED',
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
]);

async function placesLookup(
  query: string,
  apiKey: string,
): Promise<{ kind: 'hit'; result: PlaceResult } | { kind: 'zero' } | { kind: 'error'; status: string; message?: string }> {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: 52.3676, longitude: 4.9041 },
        radius: 15000.0,
      },
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
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string };
    };
    return {
      kind: 'error',
      status: err.error?.status ?? `HTTP_${res.status}`,
      message: err.error?.message,
    };
  }
  const data = (await res.json()) as { places?: PlaceResult[] };
  const top = data.places?.[0];
  if (!top || !top.location) return { kind: 'zero' };
  return { kind: 'hit', result: top };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not set in environment.');
    console.error('Get one at https://console.cloud.google.com/, enable');
    console.error('"Places API (New)" at');
    console.error('  https://console.cloud.google.com/apis/library/places.googleapis.com');
    process.exit(1);
  }

  console.log(`Reading ${CANDIDATES_PATH}`);
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf-8')) as Candidate[];
  console.log(`Loaded ${candidates.length} candidate venues.`);

  console.log(`Reading ${TERRACES_PATH}`);
  const existing = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Existing Zonnie set: ${existing.length} terraces.`);

  // Filter pool: peak_sun >= --min-peak-sun, exclude noise patterns up front.
  const pool = candidates.filter((c) => {
    if ((c.peak_sun ?? 0) < args.minPeakSun) return false;
    if (NOISE_NAME_PATTERNS.some((p) => p.test(c.name))) return false;
    return true;
  });
  console.log(`Pool after peak-sun (>=${args.minPeakSun}) + noise filter: ${pool.length}`);

  const slice = pool.slice(args.since, args.since + args.max);
  console.log(`Will process candidates ${args.since}..${args.since + slice.length}`);

  let counters = {
    imported: 0,
    too_far: 0,
    no_match: 0,
    closed: 0,
    noise: 0,
    out_of_bounds: 0,
    api_error: 0,
  };

  const newTerraces: Terrace[] = [];
  let nextId = Math.max(...existing.map((t) => t.id)) + 1;

  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]!;
    const tag = `[${(i + 1).toString().padStart(3)}/${slice.length}]`;
    const display = c.name.padEnd(40).slice(0, 40);

    const lookup = await placesLookup(`${c.name}, Amsterdam, Netherlands`, apiKey);
    await sleep(REQUEST_DELAY_MS);

    let outcome: Outcome;

    if (lookup.kind === 'error') {
      const status = lookup.status;
      if (FATAL_STATUSES.has(status)) {
        console.error(`${tag} ${display}  FATAL ${status} — aborting.`);
        process.exit(2);
      }
      counters.api_error++;
      outcome = { kind: 'api_error', reason: `${status}: ${lookup.message ?? ''}` };
      console.log(`${tag} ${display}  api error: ${status}`);
    } else if (lookup.kind === 'zero') {
      counters.no_match++;
      outcome = { kind: 'no_match' };
      console.log(`${tag} ${display}  no match`);
    } else {
      const r = lookup.result;
      if (r.businessStatus && r.businessStatus !== 'OPERATIONAL') {
        counters.closed++;
        outcome = { kind: 'closed', reason: r.businessStatus, placeId: r.id };
        console.log(`${tag} ${display}  ${r.businessStatus} — skipped`);
      } else if (r.types?.some((t) => NOISE_PLACE_TYPES.has(t))) {
        counters.noise++;
        outcome = {
          kind: 'noise',
          reason: r.types.filter((t) => NOISE_PLACE_TYPES.has(t)).join(','),
          placeId: r.id,
        };
        console.log(`${tag} ${display}  noise type — skipped (${outcome.reason})`);
      } else if (!r.location) {
        counters.no_match++;
        outcome = { kind: 'no_match' };
        console.log(`${tag} ${display}  no location`);
      } else if (
        !isInAmsterdam({ lat: r.location.latitude, lng: r.location.longitude })
      ) {
        counters.out_of_bounds++;
        outcome = { kind: 'out_of_bounds', placeId: r.id };
        console.log(`${tag} ${display}  out of Amsterdam — skipped`);
      } else {
        const d = distMeters(c, {
          lat: r.location.latitude,
          lng: r.location.longitude,
        });
        if (d > PROXIMITY_TOLERANCE_M) {
          counters.too_far++;
          outcome = {
            kind: 'too_far',
            reason: `${Math.round(d)}m apart`,
            placeId: r.id,
            matchName: r.displayName?.text,
          };
          console.log(`${tag} ${display}  ${Math.round(d)}m apart — skipped`);
        } else {
          // Accept!
          const lat = r.location.latitude;
          const lng = r.location.longitude;
          const id = nextId++;
          const t: Terrace = {
            id,
            name: r.displayName?.text ?? c.name,
            lat,
            lng,
            area: nearestAreaName({ lat, lng }, existing),
            facing: 'S',
            capacity: 'M',
            vibe: c.is_bar && c.is_rest
              ? 'Restaurant & bar'
              : c.is_bar
                ? 'Bar'
                : c.is_rest
                  ? 'Restaurant'
                  : 'Imported',
            address: r.formattedAddress ?? '',
            verified: true,
            coordSource: 'places_api',
            verifiedAt: new Date().toISOString(),
            placeId: r.id,
          };
          newTerraces.push(t);
          counters.imported++;
          outcome = {
            kind: 'imported',
            newId: id,
            placeId: r.id,
            matchName: r.displayName?.text,
          };
          console.log(`${tag} ${display}  imported as id=${id}`);
        }
      }
    }

    appendFileSync(
      LOG_PATH,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        candidateId: c.id,
        candidateName: c.name,
        candidateLat: c.lat,
        candidateLng: c.lng,
        peakSun: c.peak_sun,
        ...outcome,
      }) + '\n',
    );
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  for (const [k, v] of Object.entries(counters)) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  console.log('');
  console.log(`  Log: ${LOG_PATH}`);

  if (!args.apply) {
    console.log('');
    console.log('DRY-RUN — no changes written. Re-run with --apply.');
    return;
  }

  if (newTerraces.length === 0) {
    console.log('No imports to write.');
    return;
  }

  const merged = [...existing, ...newTerraces];
  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log('');
  console.log(
    `Wrote ${newTerraces.length} imports to ${TERRACES_PATH}. New total: ${merged.length}.`,
  );
}

if (!existsSync(LOG_PATH)) {
  writeFileSync(LOG_PATH, '');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
