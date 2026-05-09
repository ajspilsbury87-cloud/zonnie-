#!/usr/bin/env tsx
/**
 * One-off data-quality patches surfaced by the zonopjebakkes top-10
 * comparison (`scripts/compare-zonopjebakkes.ts`). Re-runs are safe:
 * each fix is idempotent.
 *
 *   1. Add Hangar Oost (zonopjebakkes #1) — Zuiderzeeweg 6, Zeeburg.
 *      Coords from Nominatim. Big waterfront terrace, facing S/SW
 *      toward the IJ. Capacity L.
 *   2. Add Watts Hub (zonopjebakkes #4) — Radarweg 480, Sloterdijk.
 *      Coords from Nominatim. Industrial-area waterfront café.
 *   3. Fix Café Restaurant Camping Zeeburg facing: was 'N', actually
 *      'S' (it's on the south shore of IJburg, the terrace faces the
 *      water). Bad inference — the OSM building footprint matched
 *      a different orientation than the actual seating area.
 *
 * After running this, re-run patch-3dbag-buildings to backfill the
 * new terraces' nearby-buildings lists, then commit + OTA.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Terrace } from '../src/engines/types';

const TERRACES_PATH = join(process.cwd(), 'src', 'data', 'terraces.json');

const folded = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function main(): void {
  const apply = process.argv.includes('--apply');

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  const before = terraces.length;
  const verifiedAt = new Date().toISOString();
  let nextId = Math.max(...terraces.map((t) => t.id)) + 1;
  const log: string[] = [];

  // ── 1. Add Hangar Oost ───────────────────────────────────────────
  const hangarOostName = 'Hangar Oost';
  if (!terraces.some((t) => folded(t.name) === folded(hangarOostName))) {
    terraces.push({
      id: nextId++,
      name: hangarOostName,
      lat: 52.3690104,
      lng: 4.9647143,
      area: 'Zeeburgereiland',
      facing: 'SW',
      capacity: 'L',
      vibe:
        'Big waterfront terrace on Zeeburgereiland with views over the IJ. ' +
        "Topped zonopjebakkes.nl's 2026 sunny-terraces list at #1.",
      address: 'Zuiderzeeweg 6H',
      verified: true,
      coordSource: 'manual',
      verifiedAt,
    });
    log.push(`+ Hangar Oost (id=${nextId - 1}) added`);
  } else {
    log.push(`= Hangar Oost already in dataset, skipping`);
  }

  // ── 2. Add Watts Hub ─────────────────────────────────────────────
  const wattsHubName = 'Watts Hub';
  if (!terraces.some((t) => folded(t.name) === folded(wattsHubName))) {
    terraces.push({
      id: nextId++,
      name: wattsHubName,
      lat: 52.3863105,
      lng: 4.8350925,
      area: 'Sloterdijk',
      facing: 'S',
      capacity: 'M',
      vibe:
        'Industrial-area café/restaurant near Sloterdijk. Listed at ' +
        '#4 on zonopjebakkes.nl 2026 sunny-terraces.',
      address: 'Radarweg 480',
      verified: true,
      coordSource: 'manual',
      verifiedAt,
    });
    log.push(`+ Watts Hub (id=${nextId - 1}) added`);
  } else {
    log.push(`= Watts Hub already in dataset, skipping`);
  }

  // ── 3. Fix Camping Zeeburg facing ───────────────────────────────
  const camping = terraces.find(
    (t) => folded(t.name) === folded('Café Restaurant Camping Zeeburg'),
  );
  if (camping && camping.facing !== 'S') {
    log.push(
      `~ Camping Zeeburg (id=${camping.id}) facing: ${camping.facing} → S ` +
        '(south shore of IJburg, terrace faces the IJ)',
    );
    camping.facing = 'S';
    camping.verifiedAt = verifiedAt;
  } else if (!camping) {
    log.push(`= Camping Zeeburg not in dataset, skipping`);
  } else {
    log.push(`= Camping Zeeburg already S-facing, skipping`);
  }

  console.log(log.join('\n'));
  console.log(`\nTerraces: ${before} → ${terraces.length}`);

  if (!apply) {
    console.log('\nDry-run; pass --apply to write changes.');
    return;
  }
  writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');
  console.log(`\nWrote ${TERRACES_PATH}.`);
}

main();
