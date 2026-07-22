// =============================================================================
// audit-refresh-jul21.mjs — targeted follow-up pass on flagged dataset issues
// -----------------------------------------------------------------------------
// Covers what audit-closed.mjs (2026-07-08) couldn't:
//   A. Re-check the 5 "temporarily closed, revisit in a few weeks" entries +
//      Star Ferry (flagged closed in memory but still present — recheck).
//   B. Re-verify formattedAddress for 4 "address may have drifted" entries.
//   C. The 26 entries with NO placeId: Text Search each to attach a placeId,
//      current businessStatus, rating, and formatted address — closes the
//      coverage gap the automated closed-audit couldn't reach.
// Writes a report only; makes NO repo changes. apply-refresh-jul21.mjs applies.
//
//   node scripts/audit-refresh-jul21.mjs
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const REPO = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae';
const OUT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/refresh-audit-jul21-report.json';
const KEY = (readFileSync(`${REPO}/.env.local`, 'utf8').match(/^GOOGLE_MAPS_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) throw new Error('key missing');

const terraces = JSON.parse(readFileSync(`${REPO}/src/data/terraces.json`, 'utf8'));
const byId = new Map(terraces.map((t) => [t.id, t]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RECHECK_STATUS_IDS = [131, 146, 588, 1094, 1427, 1406]; // temp-closed + Star Ferry
const RECHECK_ADDRESS_IDS = [186, 611, 166, 136]; // possibly-drifted addresses
const NO_PLACEID_IDS = terraces.filter((t) => !t.placeId).map((t) => t.id);

let calls = 0;

async function placeDetails(placeId) {
  calls++;
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'businessStatus,displayName,formattedAddress,rating,userRatingCount' },
  });
  if (r.status === 404) return { gone: true };
  if (!r.ok) return { error: r.status };
  return await r.json();
}

async function textSearch(query) {
  calls++;
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': KEY,
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.businessStatus,places.rating,places.userRatingCount,places.location,places.types',
    },
    body: JSON.stringify({ textQuery: query, locationBias: { circle: { center: { latitude: 52.3676, longitude: 4.9041 }, radius: 12000 } } }),
  });
  if (!r.ok) return { error: r.status };
  const d = await r.json();
  return d.places?.[0] ?? null;
}

// ── A. status recheck ────────────────────────────────────────────────────────
const statusResults = [];
for (const id of RECHECK_STATUS_IDS) {
  const t = byId.get(id);
  if (!t?.placeId) { statusResults.push({ id, name: t?.name, error: 'no placeId on file' }); continue; }
  const d = await placeDetails(t.placeId);
  statusResults.push({ id, name: t.name, area: t.area, businessStatus: d.businessStatus, gone: d.gone, error: d.error });
  await sleep(100);
}

// ── B. address recheck ───────────────────────────────────────────────────────
const addressResults = [];
for (const id of RECHECK_ADDRESS_IDS) {
  const t = byId.get(id);
  if (!t?.placeId) { addressResults.push({ id, name: t?.name, error: 'no placeId on file' }); continue; }
  const d = await placeDetails(t.placeId);
  addressResults.push({ id, name: t.name, currentAddress: t.address, freshAddress: d.formattedAddress, businessStatus: d.businessStatus, gone: d.gone, error: d.error });
  await sleep(100);
}

// ── C. no-placeId entries: text-search to enrich + validate ────────────────
const noPlaceIdResults = [];
for (const id of NO_PLACEID_IDS) {
  const t = byId.get(id);
  const q = `${t.name}, ${t.address || ''}, Amsterdam`;
  const p = await textSearch(q);
  noPlaceIdResults.push({
    id, name: t.name, area: t.area, currentAddress: t.address,
    match: p ? { placeId: p.id, name: p.displayName?.text, address: p.formattedAddress, businessStatus: p.businessStatus, rating: p.rating, reviews: p.userRatingCount, lat: p.location?.latitude, lng: p.location?.longitude, types: p.types } : null,
    error: p?.error,
  });
  await sleep(120);
}

writeFileSync(OUT, JSON.stringify({ statusResults, addressResults, noPlaceIdResults, calls }, null, 2));
console.log(`\n════ REFRESH AUDIT (2026-07-21) ════`);
console.log(`API calls: ${calls} (~$${(calls * 0.02).toFixed(2)})`);

console.log(`\n-- A. status recheck (${statusResults.length}) --`);
for (const r of statusResults) console.log(`  #${r.id} ${r.name}: ${r.gone ? 'GONE(404)' : r.businessStatus || r.error}`);

console.log(`\n-- B. address recheck (${addressResults.length}) --`);
for (const r of addressResults) {
  const changed = r.freshAddress && r.freshAddress !== r.currentAddress;
  console.log(`  #${r.id} ${r.name}: ${changed ? `DRIFTED  "${r.currentAddress}" -> "${r.freshAddress}"` : 'matches'}  [${r.businessStatus || r.error || ''}]`);
}

console.log(`\n-- C. no-placeId entries (${noPlaceIdResults.length}) --`);
for (const r of noPlaceIdResults) {
  if (!r.match) { console.log(`  #${r.id} ${r.name}: NO MATCH FOUND`); continue; }
  const status = r.match.businessStatus || 'OPERATIONAL?';
  console.log(`  #${r.id} ${r.name} -> "${r.match.name}" [${status}] ${r.match.rating}★/${r.match.reviews} — ${r.match.address}`);
}

console.log(`\nReport -> ${OUT}`);
