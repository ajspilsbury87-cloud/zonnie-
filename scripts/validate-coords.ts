#!/usr/bin/env tsx
/**
 * Coordinate validation script.
 *
 * Runs every terrace in `src/data/terraces.json` through the Google Places API
 * (New) — POST https://places.googleapis.com/v1/places:searchText — compares
 * the result against the stored lat/lng, and:
 *
 *   - distance < 25m        → leave coords, refresh verifiedAt (within tolerance)
 *   - 25m ≤ distance ≤ 2km  → OVERWRITE lat/lng, set coordSource='places_api',
 *                              refresh verifiedAt, log to coord_corrections.jsonl
 *   - distance > 2km        → suspicious, skip, log as 'too_far'
 *   - no API match          → skip, log as 'no_match'
 *
 * Per project decision (memory: SunBae Expo port — 2026-04-25): overwrite in
 * place, log every change so Andy can spot-check and roll back if needed.
 *
 * Pre-flight: enable "Places API (New)" — separate from the legacy "Places API":
 *   https://console.cloud.google.com/apis/library/places.googleapis.com
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."
 *   npm run validate-coords -- --dry-run
 *   npm run validate-coords -- --apply
 *   npm run validate-coords -- --apply --max 50
 *   npm run validate-coords -- --apply --only-unverified
 *
 * Cost: Places API (New) Text Search Pro is ~$0.005/req with our basic field
 * mask. 453 terraces ≈ $2.30. Free tier covers $200/month.
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Terrace } from '../src/engines/types';

// Run via `npm run validate-coords`, which always executes from project root.
const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const LOG_PATH = join(PROJECT_ROOT, 'coord_corrections.jsonl');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

// Field mask is REQUIRED by the new API and determines the billing tier.
// id + displayName + location + formattedAddress = Basic SKU (cheapest).
const FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress';

const AMSTERDAM_BOUNDS = {
  minLat: 52.32,
  maxLat: 52.42,
  minLng: 4.75,
  maxLng: 5.0,
};

const REQUEST_DELAY_MS = 150;
const APPLY_THRESHOLD_M = 25;
const SUSPICIOUS_THRESHOLD_M = 2000;

interface Args {
  apply: boolean;
  max: number;
  onlyUnverified: boolean;
  onlyUnsourced: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, max: Infinity, onlyUnverified: false, onlyUnsourced: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--only-unverified') args.onlyUnverified = true;
    else if (a === '--only-unsourced') args.onlyUnsourced = true;
    else if (a === '--max') {
      const next = argv[++i];
      if (!next) throw new Error('--max requires a number');
      args.max = parseInt(next, 10);
    }
  }
  return args;
}

interface PlacesResult {
  lat: number;
  lng: number;
  matchName: string;
  placeId: string;
}

interface PlacesError {
  status: string;
  errorMessage?: string;
}

type LookupOutcome =
  | { kind: 'hit'; result: PlacesResult }
  | { kind: 'zero_results' }
  | { kind: 'out_of_bounds'; lat: number; lng: number }
  | { kind: 'api_error'; error: PlacesError };

/**
 * Statuses that mean "stop the whole run" — re-issuing more requests will just
 * keep failing the same way. New API uses Google's canonical RPC status codes.
 * See https://cloud.google.com/apis/design/errors
 */
const FATAL_STATUSES = new Set([
  'PERMISSION_DENIED', // API not enabled, key restricted, billing off
  'UNAUTHENTICATED', // bad/missing key
  'RESOURCE_EXHAUSTED', // quota exhausted
  'INVALID_ARGUMENT', // malformed request (shouldn't happen, but bail)
  'FAILED_PRECONDITION', // billing not configured
]);

async function placesLookup(query: string, apiKey: string): Promise<LookupOutcome> {
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
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string };
    };
    const status = errBody.error?.status ?? `HTTP_${res.status}`;
    const errorMessage = errBody.error?.message ?? res.statusText;
    return { kind: 'api_error', error: { status, errorMessage } };
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string; languageCode?: string };
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
    }>;
  };

  if (!data.places || data.places.length === 0) {
    return { kind: 'zero_results' };
  }

  const top = data.places[0]!;
  if (!top.location || !top.displayName) {
    return { kind: 'zero_results' };
  }

  const lat = top.location.latitude;
  const lng = top.location.longitude;

  if (
    lat < AMSTERDAM_BOUNDS.minLat ||
    lat > AMSTERDAM_BOUNDS.maxLat ||
    lng < AMSTERDAM_BOUNDS.minLng ||
    lng > AMSTERDAM_BOUNDS.maxLng
  ) {
    return { kind: 'out_of_bounds', lat, lng };
  }

  return {
    kind: 'hit',
    result: { lat, lng, matchName: top.displayName.text, placeId: top.id },
  };
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
  const dx = (lng2 - lng1) * M_PER_DEG_LNG;
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CorrectionLog {
  timestamp: string;
  id: number;
  name: string;
  address: string;
  oldLat: number;
  oldLng: number;
  newLat?: number;
  newLng?: number;
  distanceM?: number;
  matchName?: string;
  placeId?: string;
  outcome: 'within_tolerance' | 'corrected' | 'too_far' | 'no_match' | 'error';
  reason?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not set in environment.');
    console.error('1. Get a key at https://console.cloud.google.com/');
    console.error('2. Enable "Places API (New)" at');
    console.error('   https://console.cloud.google.com/apis/library/places.googleapis.com');
    process.exit(1);
  }

  console.log(`Reading ${TERRACES_PATH}`);
  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Loaded ${terraces.length} terraces.`);

  let pool = terraces;
  if (args.onlyUnverified) pool = pool.filter((t) => !t.verified);
  if (args.onlyUnsourced) pool = pool.filter((t) => !t.coordSource);
  if (Number.isFinite(args.max)) pool = pool.slice(0, args.max);
  console.log(`Will check ${pool.length} terraces. Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);

  const updates = new Map<number, Terrace>();
  let corrected = 0;
  let withinTol = 0;
  let tooFar = 0;
  let noMatch = 0;
  let errors = 0;

  for (let i = 0; i < pool.length; i++) {
    const t = pool[i]!;
    const tag = `[${(i + 1).toString().padStart(3)}/${pool.length}]`;
    const display = t.name.padEnd(35).slice(0, 35);
    const query = `${t.name}, ${t.address}, Amsterdam, Netherlands`;

    let log: CorrectionLog;

    try {
      const outcome = await placesLookup(query, apiKey);
      await sleep(REQUEST_DELAY_MS);

      if (outcome.kind === 'api_error') {
        const { status, errorMessage } = outcome.error;
        const detail = errorMessage ? ` — ${errorMessage}` : '';
        console.error(`${tag} ${display}  API ${status}${detail}`);

        if (FATAL_STATUSES.has(status)) {
          console.error('');
          console.error(`Aborting: API status "${status}" will not change with more requests.`);
          if (status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
            console.error('Common causes:');
            console.error('  • "Places API (New)" not enabled — enable it at');
            console.error('    https://console.cloud.google.com/apis/library/places.googleapis.com');
            console.error('    (this is SEPARATE from the legacy "Places API")');
            console.error('  • Billing not enabled on the project (required even for free tier)');
            console.error('  • API key has Application restrictions excluding Node (set to "None")');
            console.error('  • API key has API restrictions that exclude "Places API (New)"');
          } else if (status === 'FAILED_PRECONDITION') {
            console.error('Likely cause: billing not configured on the GCP project.');
          } else if (status === 'RESOURCE_EXHAUSTED') {
            console.error('Quota exhausted — wait or raise quota in GCP console.');
          }
          appendFileSync(
            LOG_PATH,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              id: t.id,
              name: t.name,
              address: t.address,
              oldLat: t.lat,
              oldLng: t.lng,
              outcome: 'error',
              reason: `${status}${detail}`,
            }) + '\n',
          );
          process.exit(2);
        }

        errors++;
        log = {
          timestamp: new Date().toISOString(),
          id: t.id,
          name: t.name,
          address: t.address,
          oldLat: t.lat,
          oldLng: t.lng,
          outcome: 'error',
          reason: `${status}${detail}`,
        };
      } else if (outcome.kind === 'zero_results') {
        noMatch++;
        log = {
          timestamp: new Date().toISOString(),
          id: t.id,
          name: t.name,
          address: t.address,
          oldLat: t.lat,
          oldLng: t.lng,
          outcome: 'no_match',
        };
        console.log(`${tag} ${display}  no match`);
      } else if (outcome.kind === 'out_of_bounds') {
        noMatch++;
        log = {
          timestamp: new Date().toISOString(),
          id: t.id,
          name: t.name,
          address: t.address,
          oldLat: t.lat,
          oldLng: t.lng,
          newLat: outcome.lat,
          newLng: outcome.lng,
          outcome: 'no_match',
          reason: 'Places result outside Amsterdam bbox',
        };
        console.log(`${tag} ${display}  out of bounds — skipped`);
      } else {
        const hit = outcome.result;
        const dist = distanceMeters(t.lat, t.lng, hit.lat, hit.lng);

        if (dist > SUSPICIOUS_THRESHOLD_M) {
          tooFar++;
          log = {
            timestamp: new Date().toISOString(),
            id: t.id,
            name: t.name,
            address: t.address,
            oldLat: t.lat,
            oldLng: t.lng,
            newLat: hit.lat,
            newLng: hit.lng,
            distanceM: Math.round(dist),
            matchName: hit.matchName,
            placeId: hit.placeId,
            outcome: 'too_far',
            reason: `Places result ${Math.round(dist)}m away — likely wrong venue, manual review needed`,
          };
          console.log(`${tag} ${display}  too far (${Math.round(dist)}m) — skipped`);
        } else if (dist < APPLY_THRESHOLD_M) {
          withinTol++;
          log = {
            timestamp: new Date().toISOString(),
            id: t.id,
            name: t.name,
            address: t.address,
            oldLat: t.lat,
            oldLng: t.lng,
            newLat: hit.lat,
            newLng: hit.lng,
            distanceM: Math.round(dist),
            matchName: hit.matchName,
            placeId: hit.placeId,
            outcome: 'within_tolerance',
          };
          console.log(`${tag} ${display}  ok (${Math.round(dist)}m)`);
          updates.set(t.id, {
            ...t,
            verified: true,
            coordSource: 'places_api',
            verifiedAt: new Date().toISOString(),
          });
        } else {
          corrected++;
          log = {
            timestamp: new Date().toISOString(),
            id: t.id,
            name: t.name,
            address: t.address,
            oldLat: t.lat,
            oldLng: t.lng,
            newLat: hit.lat,
            newLng: hit.lng,
            distanceM: Math.round(dist),
            matchName: hit.matchName,
            placeId: hit.placeId,
            outcome: 'corrected',
          };
          console.log(`${tag} ${display}  CORRECTED (${Math.round(dist)}m → "${hit.matchName}")`);
          updates.set(t.id, {
            ...t,
            lat: hit.lat,
            lng: hit.lng,
            verified: true,
            coordSource: 'places_api',
            verifiedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      errors++;
      log = {
        timestamp: new Date().toISOString(),
        id: t.id,
        name: t.name,
        address: t.address,
        oldLat: t.lat,
        oldLng: t.lng,
        outcome: 'error',
        reason: err instanceof Error ? err.message : String(err),
      };
      console.error(`${tag} ${display}  ERROR: ${log.reason}`);
    }

    appendFileSync(LOG_PATH, JSON.stringify(log) + '\n');
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Within tolerance (<25m):  ${withinTol}`);
  console.log(`  Corrected (25m–2km):      ${corrected}`);
  console.log(`  Too far (>2km, skipped):  ${tooFar}`);
  console.log(`  No match:                 ${noMatch}`);
  console.log(`  Errors:                   ${errors}`);
  console.log('');
  console.log(`  Log: ${LOG_PATH}`);

  if (!args.apply) {
    console.log('');
    console.log('DRY-RUN — no changes written. Re-run with --apply to overwrite terraces.json.');
    return;
  }

  if (updates.size === 0) {
    console.log('No updates to write.');
    return;
  }

  const merged = terraces.map((t) => updates.get(t.id) ?? t);
  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log('');
  console.log(`Wrote ${updates.size} updates to ${TERRACES_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
