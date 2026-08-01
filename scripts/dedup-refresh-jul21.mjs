// =============================================================================
// dedup-refresh-jul21.mjs — remove duplicate venues surfaced by the refresh
// -----------------------------------------------------------------------------
// The 2026-07-21 enrichment attached placeIds to 9 previously-unlinked entries.
// Six of them turned out to share a Google placeId with an EXISTING entry —
// i.e. they are duplicate rows for the same physical venue. We keep the older
// canonical id (all six have curated buildings.json shadow data) and drop the
// newer duplicate.
//
//   newer(drop) -> older(keep)
//   #140  Piet de Gruyter            -> #632 Café Restaurant Piet de Gruyter
//   #1383 Alba                       -> #780 Alba Restaurant & Wijnbar
//   #1394 Canvas (Volkshotel)        -> #91  Canvas
//   #1397 Badhuis Javaplein          -> #797 Badhuis Amsterdam | Restaurant
//   #1398 Massalia                   -> #661 Massalia Restobar
//   #1510 Café Restaurant Sandberg   -> #777 Cafe Restaurant Sandberg
//
//   node scripts/dedup-refresh-jul21.mjs            # dry-run
//   node scripts/dedup-refresh-jul21.mjs --apply    # write terraces.json
//
// After applying: npx tsx scripts/build-terraces-lite.ts
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const TERRACES = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae/src/data/terraces.json';
const APPLY = process.argv.includes('--apply');

// [dropId, keepId] pairs — verified same placeId before listing here.
const PAIRS = [[140, 632], [1383, 780], [1394, 91], [1397, 797], [1398, 661], [1510, 777]];
const DROP = PAIRS.map(([d]) => d);

const terraces = JSON.parse(readFileSync(TERRACES, 'utf8'));
const byId = new Map(terraces.map((t) => [t.id, t]));

// Guardrail: each pair must exist and actually share a placeId.
for (const [dropId, keepId] of PAIRS) {
  const d = byId.get(dropId), k = byId.get(keepId);
  if (!d) throw new Error(`drop id ${dropId} not found — aborting`);
  if (!k) throw new Error(`keep id ${keepId} not found — aborting`);
  if (!d.placeId || d.placeId !== k.placeId) throw new Error(`#${dropId} and #${keepId} do not share a placeId — aborting (${d.placeId} vs ${k.placeId})`);
}

console.log(`════ DEDUP REFRESH (2026-07-21) ════`);
for (const [dropId, keepId] of PAIRS) {
  console.log(`  drop #${dropId} "${byId.get(dropId).name}"  ->  keep #${keepId} "${byId.get(keepId).name}"`);
}
const kept = terraces.filter((t) => !DROP.includes(t.id));
console.log(`\nCount: ${terraces.length} -> ${kept.length}`);

if (!APPLY) { console.log('\n(dry-run — no writes. Re-run with --apply)'); process.exit(0); }
writeFileSync(TERRACES, JSON.stringify(kept, null, 2) + '\n');
console.log(`\nWrote ${kept.length} terraces -> src/data/terraces.json`);
