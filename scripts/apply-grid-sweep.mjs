// =============================================================================
// apply-grid-sweep.mjs — apply the grid-sweep report to terraces.json
// -----------------------------------------------------------------------------
// Adds quality-gated new venues found by places-grid-sweep.mjs and removes
// permanently-closed #124 Bar Spek in the same batch. Consumes the report, so
// no extra API cost.
//
//   node scripts/apply-grid-sweep.mjs            # dry-run
//   node scripts/apply-grid-sweep.mjs --apply    # write terraces.json
//
// Then: npx tsx scripts/build-terraces-lite.ts
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TERRACES = 'src/data/terraces.json';
// The outdoor-seating-verified accepted set (from verify-grid-outdoor.mjs).
const REPORT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/grid-sweep-accepted.json';

const MIN_REVIEWS = 15;
const MIN_RATING = 3.5;
const CLOSED_IDS = [124]; // Bar Spek — CLOSED_PERMANENTLY (Places-confirmed)
const CANNABIS = /coffeeshop|cannabis/i;
// Types we never want as a "terrace": pure lodging/clubs/fast-food-only etc.
const EXCLUDE_TYPE = /^(lodging|hotel|night_club|liquor_store|supermarket|grocery|convenience_store|gas_station)$/;

const M_LAT = 110540, M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
const dist = (a, b) => Math.sqrt(((b.lng - a.lng) * M_LNG) ** 2 + ((b.lat - a.lat) * M_LAT) ** 2);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function overlap(a, b) { const ta = norm(a).split(' ').filter((x) => x.length >= 3); if (!ta.length) return 0; const nb = norm(b); return ta.filter((x) => nb.includes(x)).length / ta.length; }

function vibeFromTypes(types, name) {
  const s = (types ?? []).join(' ');
  if (/coffee|koffie|espresso|matcha/i.test(name) || /coffee_shop/.test(s)) return 'Specialty coffee';
  if (/wine_bar/.test(s)) return 'Wine bar';
  if (/\bpub\b/.test(s)) return 'Pub';
  if (/\bbar\b/.test(s)) return 'Bar';
  if (/bakery/.test(s)) return 'Bakery café';
  if (/cafe/.test(s)) return 'Café';
  return 'Café';
}
function categoryFromTypes(types, name) {
  const s = (types ?? []).join(' ');
  if (/coffee_shop|bakery/.test(s) || /coffee|koffie|espresso|matcha/i.test(name)) return ['coffee'];
  if (/\bbar\b|wine_bar|pub/.test(s)) return ['bar'];
  return undefined;
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
let terraces = JSON.parse(readFileSync(TERRACES, 'utf8'));

// 1) Remove permanently-closed venues.
const removed = terraces.filter((t) => CLOSED_IDS.includes(t.id)).map((t) => `#${t.id} ${t.name}`);
terraces = terraces.filter((t) => !CLOSED_IDS.includes(t.id));

const byPlaceId = new Map(terraces.filter((t) => t.placeId).map((t) => [t.placeId, t]));
let nextId = terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;
function nearestArea(c) { let best = terraces[0], bd = Infinity; for (const t of terraces) { const d = dist(c, t); if (d < bd) { bd = d; best = t; } } return best.area; }
function existsAlready(c) {
  if (byPlaceId.has(c.placeId)) return true;
  for (const t of terraces) if (dist(c, t) <= 60 && Math.max(overlap(c.name, t.name), overlap(t.name, c.name)) >= 0.6) return true;
  return false;
}

// 2) Add quality-gated new venues.
const skip = { junk: 0, cannabis: 0, badtype: 0, dupe: 0 };
const added = [];
const byArea = {};
for (const c of report.candidates) {
  if (CANNABIS.test(c.name)) { skip.cannabis++; continue; }
  if ((c.reviews ?? 0) < MIN_REVIEWS || (c.rating ?? 0) < MIN_RATING) { skip.junk++; continue; }
  if ((c.types ?? []).length && (c.types ?? []).every((ty) => EXCLUDE_TYPE.test(ty))) { skip.badtype++; continue; }
  if (existsAlready(c)) { skip.dupe++; continue; }
  const area = nearestArea(c);
  const entry = {
    id: nextId++, name: c.name, lat: c.lat, lng: c.lng, area,
    facing: 'S', capacity: 'M', vibe: vibeFromTypes(c.types, c.name),
    address: c.address, verified: true, coordSource: 'places_api',
    verifiedAt: new Date().toISOString(), placeId: c.placeId,
    googleRating: c.rating, googleReviewCount: c.reviews, openness: 0.6,
  };
  const cat = categoryFromTypes(c.types, c.name);
  if (cat) entry.category = cat;
  added.push(entry);
  byPlaceId.set(entry.placeId, entry);
  byArea[area] = (byArea[area] ?? 0) + 1;
}

console.log(`Removed (permanently closed): ${removed.join(', ') || 'none'}`);
console.log(`Candidates in report: ${report.candidates.length}`);
console.log(`Skipped — junk(<${MIN_REVIEWS}rv/<${MIN_RATING}★): ${skip.junk}, cannabis: ${skip.cannabis}, bad-type: ${skip.badtype}, dupe: ${skip.dupe}`);
console.log(`ADDING: ${added.length}`);
console.log('By area: ' + Object.entries(byArea).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(', '));
console.log(`Count: ${terraces.length} (${removed.length} removed) -> ${terraces.length + added.length}`);
console.log('\nSample of additions:');
for (const e of added.slice(0, 25)) console.log(`  ${e.name}  [${e.area}]  ${e.googleRating}★(${e.googleReviewCount})  ${e.vibe}`);

if (!APPLY) { console.log('\n(dry-run — no writes. Re-run with --apply)'); process.exit(0); }
for (const e of added) terraces.push(e);
writeFileSync(TERRACES, JSON.stringify(terraces, null, 2) + '\n');
console.log(`\nWrote ${terraces.length} terraces -> ${TERRACES}`);
