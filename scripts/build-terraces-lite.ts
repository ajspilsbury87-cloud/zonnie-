#!/usr/bin/env tsx
/**
 * build-terraces-lite — strip terraces.json down to vote-page fields.
 *
 * Reads:  src/data/terraces.json  (~931 entries, all fields)
 * Writes: docs/terraces-lite.json (same entries, minimal fields only)
 *
 * Fields kept: id, name, area, facing, lat, lng, googleRating?, googleReviewCount?
 * Everything else (vibe, address, placeId, capacity, verified, etc.) is stripped
 * to keep the file small and to avoid leaking data the vote page doesn't need.
 *
 * Key order is fixed (id, name, area, facing, lat, lng, then optionals) so that
 * the output diff is clean and deterministic — rerunning produces the same bytes.
 *
 * Usage:
 *   npx tsx scripts/build-terraces-lite.ts
 *   pnpm build-terraces-lite
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const SRC  = resolve(ROOT, 'src', 'data', 'terraces.json');
const DEST = resolve(ROOT, 'docs', 'terraces-lite.json');

interface TerraceFull {
  id: number;
  name: string;
  area: string;
  facing: string;
  lat: number;
  lng: number;
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
}

const raw = JSON.parse(readFileSync(SRC, 'utf-8')) as TerraceFull[];

const lite: TerraceLite[] = raw.map((t) => {
  // Build the lite object with deterministic key order.
  const entry: TerraceLite = {
    id: t.id,
    name: t.name,
    area: t.area,
    facing: t.facing,
    lat: t.lat,
    lng: t.lng,
  };
  if (t.googleRating != null) entry.googleRating = t.googleRating;
  if (t.googleReviewCount != null) entry.googleReviewCount = t.googleReviewCount;
  return entry;
});

// Two-space indent matches the existing terraces.json style.
writeFileSync(DEST, JSON.stringify(lite, null, 2) + '\n', 'utf-8');

console.log(`✓ Wrote ${lite.length} entries → docs/terraces-lite.json`);
