#!/usr/bin/env tsx
/**
 * Backfill `placeId` field into `src/data/terraces.json` from the existing
 * `coord_corrections.jsonl` audit log produced by `validate-coords.ts`.
 *
 * Each Places API hit logged a `placeId` for the terrace it matched. We
 * already used those to overwrite lat/lng (when distance > tolerance) or
 * just refresh `verifiedAt` (when within tolerance). The placeId itself
 * was never persisted into the runtime data — fixing that here so the
 * app can fetch place details (rating, hours, photos) at runtime without
 * re-running the validation pipeline.
 *
 * Idempotent. Run with: `npm run backfill-place-ids`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Terrace } from '../src/engines/types';

const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const CORRECTIONS_PATH = join(PROJECT_ROOT, 'coord_corrections.jsonl');

interface CorrectionLog {
  id: number;
  placeId?: string;
  outcome: 'within_tolerance' | 'corrected' | 'too_far' | 'no_match' | 'error';
  timestamp: string;
}

function main() {
  console.log(`Reading ${TERRACES_PATH}`);
  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`  ${terraces.length} terraces.`);

  console.log(`Reading ${CORRECTIONS_PATH}`);
  let raw: string;
  try {
    raw = readFileSync(CORRECTIONS_PATH, 'utf-8');
  } catch {
    console.error('  ✗ coord_corrections.jsonl not found. Run validate-coords first.');
    process.exit(1);
  }

  // Build a map of id → most-recent valid placeId. The log can contain
  // multiple entries per terrace from successive runs; we want the latest
  // one with a placeId set.
  const latestPlaceIdById = new Map<number, { placeId: string; timestamp: string }>();
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    let entry: CorrectionLog;
    try {
      entry = JSON.parse(line) as CorrectionLog;
    } catch {
      continue;
    }
    if (!entry.placeId || (entry.outcome !== 'within_tolerance' && entry.outcome !== 'corrected')) {
      continue;
    }
    const prev = latestPlaceIdById.get(entry.id);
    if (!prev || entry.timestamp > prev.timestamp) {
      latestPlaceIdById.set(entry.id, { placeId: entry.placeId, timestamp: entry.timestamp });
    }
  }
  console.log(`  ${latestPlaceIdById.size} placeIds found in corrections log.`);

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const merged = terraces.map((t) => {
    const found = latestPlaceIdById.get(t.id);
    if (!found) return t;
    if (t.placeId === found.placeId) {
      unchanged++;
      return t;
    }
    if (t.placeId) updated++;
    else added++;
    return { ...t, placeId: found.placeId };
  });

  console.log('');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Added new placeId:        ${added}`);
  console.log(`  Updated existing placeId: ${updated}`);
  console.log(`  Already up-to-date:       ${unchanged}`);
  console.log(`  Terraces without placeId: ${terraces.length - latestPlaceIdById.size}`);

  if (added === 0 && updated === 0) {
    console.log('\nNothing to write.');
    return;
  }

  writeFileSync(TERRACES_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${TERRACES_PATH}`);
}

main();
