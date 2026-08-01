// =============================================================================
// apply-refresh-jul21.mjs — apply the vetted 2026-07-21 refresh audit
// -----------------------------------------------------------------------------
// Consumes refresh-audit-jul21-report.json (zero API calls). Two hand-vetted
// action lists (see AUDIT-REFRESH-Jul2026.md for the reasoning on each id):
//
//   REMOVE  — 4 entries Google reports CLOSED_PERMANENTLY with an exact
//             name+address match. Safe to delete.
//   ENRICH  — 9 entries that had NO placeId but text-search returned a strong
//             name+address match (operational). Attach placeId/rating/reviews/
//             address. Update lat/lng ONLY where coordSource was estimated or
//             missing (Places is authoritative); leave already-places_api
//             coords untouched to avoid disturbing validated positions.
//
// Everything ambiguous (rebrands, wrong-branch, wrong-city false positives,
// large address drifts, still-temporarily-closed) is NOT touched here — it is
// listed in AUDIT-REFRESH-Jul2026.md for Andy to decide.
//
//   node scripts/apply-refresh-jul21.mjs            # dry-run
//   node scripts/apply-refresh-jul21.mjs --apply    # write terraces.json
//
// After applying: npx tsx scripts/build-terraces-lite.ts  (regen web dataset)
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const REPO = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae';
const REPORT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/refresh-audit-jul21-report.json';
const TERRACES = `${REPO}/src/data/terraces.json`;
const APPLY = process.argv.includes('--apply');

const REMOVE_IDS = [1482, 1484, 1506, 1512];
const ENRICH_IDS = [205, 140, 1383, 1394, 1397, 1398, 1477, 1503, 1510];

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const matchById = new Map(report.noPlaceIdResults.filter((r) => r.match).map((r) => [r.id, r.match]));
const terraces = JSON.parse(readFileSync(TERRACES, 'utf8'));
const byId = new Map(terraces.map((t) => [t.id, t]));
const now = new Date().toISOString();

// ── Guardrails: verify every id is still present and matches expectation ──────
for (const id of [...REMOVE_IDS, ...ENRICH_IDS]) {
  if (!byId.has(id)) throw new Error(`id ${id} not in dataset — report is stale, aborting`);
  if (!REMOVE_IDS.includes(id) && !matchById.has(id)) throw new Error(`id ${id} has no match in report — aborting`);
}

// ── ENRICH ────────────────────────────────────────────────────────────────
const enrichLog = [];
for (const id of ENRICH_IDS) {
  const t = byId.get(id);
  const m = matchById.get(id);
  const before = { address: t.address, coordSource: t.coordSource, lat: t.lat, lng: t.lng };
  const coordsWereEstimated = !t.coordSource || t.coordSource === 'estimated';
  t.placeId = m.placeId;
  t.googleRating = m.rating;
  t.googleReviewCount = m.reviews;
  t.address = m.address;
  t.verified = true;
  t.coordSource = 'places_api';
  t.verifiedAt = now;
  if (coordsWereEstimated && m.lat != null && m.lng != null) {
    t.lat = m.lat;
    t.lng = m.lng;
  }
  enrichLog.push({ id, name: t.name, coordsUpdated: coordsWereEstimated, before, after: { address: t.address, lat: t.lat, lng: t.lng } });
}

// ── REMOVE ──────────────────────────────────────────────────────────────
const removeLog = REMOVE_IDS.map((id) => ({ id, name: byId.get(id).name, area: byId.get(id).area }));
const kept = terraces.filter((t) => !REMOVE_IDS.includes(t.id));

// ── Report ────────────────────────────────────────────────────────────────
console.log(`════ APPLY REFRESH (2026-07-21) ════`);
console.log(`\nENRICH (${enrichLog.length}) — attach placeId/rating/reviews/address:`);
for (const e of enrichLog) console.log(`  #${e.id} ${e.name}  ${e.coordsUpdated ? '(coords updated: estimated→places_api)' : '(coords kept)'}`);
console.log(`\nREMOVE (${removeLog.length}) — CLOSED_PERMANENTLY:`);
for (const r of removeLog) console.log(`  #${r.id} ${r.name} [${r.area}]`);
console.log(`\nCount: ${terraces.length} -> ${kept.length}`);

if (!APPLY) { console.log('\n(dry-run — no writes. Re-run with --apply)'); process.exit(0); }
writeFileSync(TERRACES, JSON.stringify(kept, null, 2) + '\n');
console.log(`\nWrote ${kept.length} terraces -> src/data/terraces.json`);
