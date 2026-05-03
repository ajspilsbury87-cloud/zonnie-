#!/usr/bin/env tsx
/**
 * Apply pending coordinate corrections from `coord_corrections.jsonl` back
 * into `src/data/terraces.json`.
 *
 * Why this exists: `validate-coords.ts` runs against Places API and writes
 * EVERY decision (`corrected`, `within_tolerance`, `too_far`, `no_match`)
 * to the JSONL log. It only writes back to terraces.json when invoked with
 * `--apply`. If a run was missed-applied (or only a subset was applied via
 * `--only-unverified`), the corrections sit in the log unapplied.
 *
 * This script doesn't touch Places API. It's a pure file operation: take the
 * MOST RECENT `corrected` entry per terrace ID from the log, and overwrite
 * the lat/lng (plus stamp `coordSource: 'places_api'` and `verifiedAt`).
 *
 *   npm run apply-corrections -- --dry-run   # preview, no write
 *   npm run apply-corrections -- --apply     # actually patch terraces.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Terrace } from '../src/engines/types';

const PROJECT_ROOT = process.cwd();
const TERRACES_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const LOG_PATH = join(PROJECT_ROOT, 'coord_corrections.jsonl');

interface CorrectionLog {
  timestamp: string;
  id: number;
  name: string;
  oldLat: number;
  oldLng: number;
  newLat?: number;
  newLng?: number;
  distanceM?: number;
  matchName?: string;
  placeId?: string;
  outcome: 'within_tolerance' | 'corrected' | 'too_far' | 'no_match' | 'error';
}

function parseArgs(argv: string[]): { apply: boolean } {
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (!apply && !dryRun) {
    console.error('Specify --dry-run or --apply.');
    process.exit(1);
  }
  return { apply };
}

function main() {
  const { apply } = parseArgs(process.argv.slice(2));

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  const logLines = readFileSync(LOG_PATH, 'utf-8').trim().split('\n');
  const logs: CorrectionLog[] = logLines.map((l) => JSON.parse(l));

  // Keep the LATEST `corrected` entry per terrace ID. Iterating with later
  // entries overwriting earlier ones keys on log order, which is timestamp
  // order — exactly what we want.
  const latestCorrection = new Map<number, CorrectionLog>();
  for (const entry of logs) {
    if (entry.outcome !== 'corrected') continue;
    if (entry.newLat == null || entry.newLng == null) continue;
    latestCorrection.set(entry.id, entry);
  }

  let willPatch = 0;
  let alreadyApplied = 0;
  let missing = 0;

  const byId = new Map<number, Terrace>();
  for (const t of terraces) byId.set(t.id, t);

  const patches: Array<{ id: number; name: string; from: [number, number]; to: [number, number]; distanceM: number }> = [];

  for (const [id, log] of latestCorrection) {
    const t = byId.get(id);
    if (!t) {
      missing++;
      continue;
    }
    const closeEnough =
      Math.abs(t.lat - (log.newLat ?? 0)) < 1e-6 && Math.abs(t.lng - (log.newLng ?? 0)) < 1e-6;
    if (closeEnough) {
      alreadyApplied++;
      continue;
    }
    patches.push({
      id,
      name: t.name,
      from: [t.lat, t.lng],
      to: [log.newLat!, log.newLng!],
      distanceM: log.distanceM ?? 0,
    });
    willPatch++;
  }

  console.log('═'.repeat(60));
  console.log('  PENDING CORRECTIONS');
  console.log('═'.repeat(60));
  console.log(`  Already applied:    ${alreadyApplied}`);
  console.log(`  Will patch:         ${willPatch}`);
  console.log(`  Missing terrace ID: ${missing}`);
  console.log('');

  if (patches.length > 0) {
    console.log('First 10 patches:');
    for (const p of patches.slice(0, 10)) {
      console.log(
        `  #${p.id.toString().padStart(3)}  ${p.name.padEnd(30).slice(0, 30)}  ${p.distanceM.toString().padStart(5)}m  ` +
          `(${p.from[0].toFixed(5)},${p.from[1].toFixed(5)}) → (${p.to[0].toFixed(5)},${p.to[1].toFixed(5)})`,
      );
    }
    if (patches.length > 10) console.log(`  ...and ${patches.length - 10} more`);
  }

  if (!apply) {
    console.log('');
    console.log('DRY-RUN — no changes written. Re-run with --apply.');
    return;
  }

  if (patches.length === 0) {
    console.log('No patches to apply.');
    return;
  }

  const now = new Date().toISOString();
  const patched = terraces.map((t) => {
    const log = latestCorrection.get(t.id);
    if (!log) return t;
    if (log.newLat == null || log.newLng == null) return t;
    const closeEnough =
      Math.abs(t.lat - log.newLat) < 1e-6 && Math.abs(t.lng - log.newLng) < 1e-6;
    if (closeEnough) return t;
    return {
      ...t,
      lat: log.newLat,
      lng: log.newLng,
      verified: true,
      coordSource: 'places_api' as const,
      verifiedAt: now,
    };
  });

  writeFileSync(TERRACES_PATH, JSON.stringify(patched, null, 2) + '\n');
  console.log('');
  console.log(`Wrote ${willPatch} patches to ${TERRACES_PATH}`);
}

main();
