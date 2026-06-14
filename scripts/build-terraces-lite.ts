#!/usr/bin/env tsx
/**
 * build-terraces-lite — strip terraces.json down to vote-page fields,
 * and add an hourly clear-sky sun score snapshot (`h[]`) per terrace.
 *
 * Reads:  src/data/terraces.json  (~974 entries, all fields)
 * Writes: docs/terraces-lite.json (same entries, minimal fields + h[])
 *
 * Fields kept:
 *   id, name, area, facing, lat, lng, googleRating?, googleReviewCount?, h[]
 *
 * The `h` field is a 24-element array (index = hour 0–23) of clear-sky
 * sun scores, computed with the FULL engine (shadow + openness + facing).
 * Values are integers 0–99 (Math.min(99, Math.max(0, Math.round(score*100)))).
 *
 * WHY 0–99 not 0–100: keeps a single-digit cap to signal "potential, not
 * perfection" — the page is honest that this is a clear-sky estimate.
 *
 * Date used for the snapshot: today by default, overrideable via --date.
 * Sun geometry changes slowly (a few % week-to-week), so "today" is an
 * accurate proxy for "this week". Rebuild periodically to track the season.
 *
 * Usage:
 *   npx tsx scripts/build-terraces-lite.ts
 *   npx tsx scripts/build-terraces-lite.ts --date 2026-06-21
 *   pnpm build-terraces-lite
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { formatInTimeZone } from 'date-fns-tz';

import { computeSunScore, AMSTERDAM_TZ } from '../src/engines/scoring';
import { getBuildingsForTerrace } from '../src/data/buildings';
import { getTreesForTerrace } from '../src/data/trees';

const ROOT = resolve(__dirname, '..');
const SRC  = resolve(ROOT, 'src', 'data', 'terraces.json');
const DEST = resolve(ROOT, 'docs', 'terraces-lite.json');

// ── Date resolution ─────────────────────────────────────────────────────────

function todayAmsterdam(): string {
  return formatInTimeZone(new Date(), AMSTERDAM_TZ, 'yyyy-MM-dd');
}

function parseDateArg(): string {
  const idx = process.argv.indexOf('--date');
  if (idx >= 0 && process.argv[idx + 1]) {
    const raw = process.argv[idx + 1]!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      console.error(`Invalid --date "${raw}". Expected YYYY-MM-DD.`);
      process.exit(1);
    }
    return raw;
  }
  return todayAmsterdam();
}

const DATE = parseDateArg();
console.log(`Building terraces-lite.json for date: ${DATE}`);

// ── Types ────────────────────────────────────────────────────────────────────

interface TerraceFull {
  id: number;
  name: string;
  area: string;
  facing: string;
  lat: number;
  lng: number;
  openness?: number;
  googleRating?: number;
  googleReviewCount?: number;
  // All other fields are intentionally un-typed here — we strip them.
  [key: string]: unknown;
}

interface TerraceLite {
  id: number;
  name: string;
  area: string;
  facing: string;
  lat: number;
  lng: number;
  googleRating?: number;
  googleReviewCount?: number;
  /** Per-hour clear-sky sun score, index 0–23. Values are integers 0–99. */
  h: number[];
}

// ── Hourly snapshot ──────────────────────────────────────────────────────────

/**
 * Compute a 24-element clear-sky sun score array for a terrace.
 * We use the 'sunny' profile (10% cloud, 18°C base) as the weather input —
 * this is the "clear-day potential" label shown on the vote page.
 */
function computeHourlySnapshot(terrace: TerraceFull): number[] {
  const buildings = getBuildingsForTerrace(terrace.id);
  const trees = getTreesForTerrace(terrace.id);

  // computeSunScore expects a Pick<Terrace, 'lat' | 'lng' | 'facing' | 'openness'>
  // TerraceFull has all of those; openness may be undefined (defaults to 1 in engine).
  const t = {
    lat: terrace.lat,
    lng: terrace.lng,
    facing: terrace.facing as Parameters<typeof computeSunScore>[0]['facing'],
    openness: typeof terrace.openness === 'number' ? terrace.openness : undefined,
  };

  const h: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const result = computeSunScore(t, hour, DATE, 'sunny', undefined, buildings, trees);
    // Clamp to 0–99 and round. 99 not 100 — the page labels this
    // "clear-day potential", not a guaranteed maximum.
    h.push(Math.min(99, Math.max(0, Math.round(result.score * 100))));
  }
  return h;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(SRC, 'utf-8')) as TerraceFull[];

const lite: TerraceLite[] = raw.map((terrace, idx) => {
  if (idx > 0 && idx % 100 === 0) {
    process.stdout.write(`  scored ${idx}/${raw.length}...\r`);
  }

  // Deterministic key order: id, name, area, facing, lat, lng, optionals, h.
  // We build the optional fields first, then spread them so the required `h`
  // can be included inline and TypeScript sees the object as complete.
  const optionals: Pick<TerraceLite, 'googleRating' | 'googleReviewCount'> = {};
  if (terrace.googleRating != null) optionals.googleRating = terrace.googleRating;
  if (terrace.googleReviewCount != null) optionals.googleReviewCount = terrace.googleReviewCount;

  const entry: TerraceLite = {
    id: terrace.id,
    name: terrace.name,
    area: terrace.area,
    facing: terrace.facing,
    lat: terrace.lat,
    lng: terrace.lng,
    ...optionals,
    h: computeHourlySnapshot(terrace),
  };
  return entry;
});

process.stdout.write('\n');

// Two-space indent matches the existing style.
writeFileSync(DEST, JSON.stringify(lite, null, 2) + '\n', 'utf-8');

console.log(`✓ Wrote ${lite.length} entries → docs/terraces-lite.json (date: ${DATE})`);
