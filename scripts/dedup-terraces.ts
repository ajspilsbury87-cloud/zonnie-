#!/usr/bin/env tsx
/**
 * Dedup `src/data/terraces.json` by `placeId` (preferred) or by
 * `(name, lat, lng)` for entries lacking a placeId. Keeps the first
 * occurrence (preserving older curated terraces over later imports).
 *
 * Run after a bulk import if the Places API returned the same venue
 * for two different candidate queries (rare but happens — e.g.,
 * "Brasserie X (Centrum)" and "Brasserie X (Oost)" both resolving to
 * the same chain location).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Terrace } from '../src/engines/types';

const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');

function key(t: Terrace): string {
  if (t.placeId) return `place:${t.placeId}`;
  return `coord:${t.name.toLowerCase().trim()}|${t.lat.toFixed(5)}|${t.lng.toFixed(5)}`;
}

function main() {
  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  const seen = new Map<string, Terrace>();
  const dropped: Terrace[] = [];

  for (const t of terraces) {
    const k = key(t);
    if (seen.has(k)) {
      dropped.push(t);
    } else {
      seen.set(k, t);
    }
  }

  console.log(`Before: ${terraces.length}`);
  console.log(`After:  ${seen.size}`);
  console.log(`Dropped ${dropped.length} duplicates:`);
  for (const t of dropped) {
    console.log(
      `  id=${t.id}  ${t.name.padEnd(35).slice(0, 35)}  ${t.lat.toFixed(4)},${t.lng.toFixed(4)}  placeId=${t.placeId ?? '(none)'}`,
    );
  }

  if (dropped.length === 0) {
    console.log('No duplicates. Nothing to write.');
    return;
  }

  const merged = [...seen.values()];
  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Wrote ${merged.length} unique terraces to ${TERRACES_PATH}.`);
}

main();
