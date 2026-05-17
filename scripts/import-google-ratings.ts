#!/usr/bin/env tsx
/**
 * One-off importer that backfills `googleRating` + `googleReviewCount`
 * onto every terrace in `src/data/terraces.json` that has a `placeId`.
 *
 * Why: in v1.2 we Pro-gate the runtime Places API call. That keeps
 * variable costs sane, but means free users see no rating at all on
 * the detail sheet — and rating is the single most decision-useful
 * piece of info Google provides. Pre-importing ratings into the
 * static dataset gives every user (free + Pro) the rating without
 * any runtime API cost. Pro additionally gets the live extras
 * (photos, today's hours, phone, website).
 *
 * Cost: ~$0.025 per call (Atmosphere SKU because we want rating +
 * reviewCount). For ~1,000 terraces that's a one-time $25. Runs
 * monthly via cron at most — ratings move slowly and the value of
 * "absolutely live" is low.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."   # Places-API-enabled key
 *   npm run import-google-ratings -- --dry-run    # preview
 *   npm run import-google-ratings -- --apply      # write terraces.json
 *   npm run import-google-ratings -- --apply --max 100   # cap for testing
 *
 * Output is written incrementally — each placeId fetched flushes
 * the file. Safe to ctrl-C mid-run; re-runs skip already-fetched.
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Terrace } from '../src/engines/types';

const ROOT = process.cwd();
const TERRACES_PATH = join(ROOT, 'src', 'data', 'terraces.json');
const LOG_PATH = join(
  ROOT,
  'scripts',
  'competitor-research',
  'google-ratings-import-log.jsonl',
);

const PLACES_URL = 'https://places.googleapis.com/v1/places';
const FIELD_MASK = ['id', 'rating', 'userRatingCount'].join(',');
const REQUEST_DELAY_MS = 200;

interface Args {
  apply: boolean;
  max: number;
  /** Refetch even if a rating is already present in terraces.json. */
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, max: Infinity, force: false };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--apply') a.apply = true;
    else if (tok === '--dry-run') a.apply = false;
    else if (tok === '--max') a.max = parseInt(argv[++i] ?? 'Infinity', 10);
    else if (tok === '--force') a.force = true;
  }
  return a;
}

interface PlaceResult {
  id: string;
  rating?: number;
  userRatingCount?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchRating(
  placeId: string,
  apiKey: string,
): Promise<{ kind: 'ok'; data: PlaceResult } | { kind: 'error'; reason: string }> {
  const url = `${PLACES_URL}/${encodeURIComponent(placeId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { kind: 'error', reason: (err as Error).message ?? String(err) };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { kind: 'error', reason: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = (await res.json().catch(() => null)) as PlaceResult | null;
  if (!data || !data.id) return { kind: 'error', reason: 'no data' };
  return { kind: 'ok', data };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not set in environment.');
    console.error('Set with: $env:GOOGLE_MAPS_API_KEY = "AIza..."');
    console.error('Must have Places API (New) enabled — see import-coffee-shops.ts notes.');
    process.exit(1);
  }
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Force refetch existing ratings: ${args.force ? 'YES' : 'no'}`);

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Loaded ${terraces.length} terraces`);

  // Filter to ones we need to fetch.
  const candidates = terraces.filter((t) => {
    if (!t.placeId) return false;
    if (!args.force && t.googleRating != null) return false;
    return true;
  });
  const targets = candidates.slice(0, args.max);
  console.log(`${candidates.length} terraces with a placeId need rating; processing ${targets.length}`);
  console.log();

  let counters = { ok: 0, no_rating: 0, error: 0 };
  let processed = 0;

  for (const t of targets) {
    const result = await fetchRating(t.placeId!, apiKey);
    processed++;

    if (result.kind === 'error') {
      counters.error++;
      process.stdout.write('x');
      appendFileSync(
        LOG_PATH,
        JSON.stringify({
          stamp: new Date().toISOString(),
          terraceId: t.id,
          placeId: t.placeId,
          kind: 'error',
          reason: result.reason,
        }) + '\n',
      );
    } else if (result.data.rating == null) {
      counters.no_rating++;
      process.stdout.write('?');
      appendFileSync(
        LOG_PATH,
        JSON.stringify({
          stamp: new Date().toISOString(),
          terraceId: t.id,
          placeId: t.placeId,
          kind: 'no_rating',
        }) + '\n',
      );
    } else {
      counters.ok++;
      process.stdout.write('✓');
      if (args.apply) {
        t.googleRating = result.data.rating;
        t.googleReviewCount = result.data.userRatingCount ?? 0;
      }
      appendFileSync(
        LOG_PATH,
        JSON.stringify({
          stamp: new Date().toISOString(),
          terraceId: t.id,
          placeId: t.placeId,
          kind: 'ok',
          rating: result.data.rating,
          reviews: result.data.userRatingCount,
        }) + '\n',
      );
    }

    // Flush terraces.json every 25 venues so a mid-run abort doesn't
    // lose progress and a re-run picks up cleanly.
    if (args.apply && processed % 25 === 0) {
      writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');
    }

    await sleep(REQUEST_DELAY_MS);
  }
  console.log();

  if (args.apply) {
    writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');
    console.log(`\nWrote ${TERRACES_PATH}`);
  } else {
    console.log('\n(dry run — no terraces.json write)');
  }

  console.log('\n— Summary —');
  console.log(`  ok          ${counters.ok}`);
  console.log(`  no_rating   ${counters.no_rating}`);
  console.log(`  error       ${counters.error}`);
  const cost = (counters.ok + counters.no_rating + counters.error) * 0.025;
  console.log(`  est. cost   $${cost.toFixed(2)}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
