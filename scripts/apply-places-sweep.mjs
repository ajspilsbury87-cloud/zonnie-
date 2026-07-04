// =============================================================================
// apply-places-sweep.mjs — apply a places-sweep report to terraces.json
// -----------------------------------------------------------------------------
// Consumes the report produced by the sweep dry-run (so applying costs zero
// API calls) and:
//   1. ADDS new venues: confirmed-outdoor entries with >=20 reviews and
//      >=3.5 rating, plus the "probable" bucket (4.2*/100+ already enforced
//      at sweep time). Cannabis coffeeshops are excluded by policy.
//   2. UPGRADES coordSource:'estimated' entries with verified Places data.
//   3. Re-dedupes everything against the CURRENT dataset at apply time.
//
//   node scripts/apply-places-sweep.mjs <report.json>            # dry-run
//   node scripts/apply-places-sweep.mjs <report.json> --apply    # write
//
// After applying: npx tsx scripts/build-terraces-lite.ts  (web dataset)
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const REPORT_PATH = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!REPORT_PATH) throw new Error('usage: node scripts/apply-places-sweep.mjs <report.json> [--apply]');

const TERRACES = 'src/data/terraces.json';
const MIN_REVIEWS = 20;
const MIN_RATING = 3.5;
// Cannabis coffeeshops: real terraces, but out of brand next to family cafés.
const CANNABIS_RX = /coffeeshop|cannabis/i;

const M_LAT = 110540, M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
const dist = (a, b) => Math.sqrt(((b.lng - a.lng) * M_LNG) ** 2 + ((b.lat - a.lat) * M_LAT) ** 2);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function overlap(a, b) {
  const ta = norm(a).split(' ').filter((t) => t.length >= 3);
  if (!ta.length) return 0;
  const nb = norm(b);
  return ta.filter((t) => nb.includes(t)).length / ta.length;
}

function vibeFromTypes(types, name) {
  const t = (types ?? []).join(' ');
  if (/coffee_shop|cafe/.test(t) && /coffee|koffie|espresso/i.test(name)) return 'Specialty coffee';
  if (/restaurant/.test(t)) return 'Restaurant';
  if (/bar|pub/.test(t)) return 'Bar';
  if (/bakery/.test(t)) return 'Bakery café';
  if (/cafe|coffee_shop/.test(t)) return 'Café';
  return 'Terrace';
}

const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
const terraces = JSON.parse(readFileSync(TERRACES, 'utf-8'));
const byPlaceId = new Map(terraces.filter((t) => t.placeId).map((t) => [t.placeId, t]));
const byId = new Map(terraces.map((t) => [t.id, t]));
let nextId = terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;

function nearestArea(c) {
  let best = terraces[0], bd = Infinity;
  for (const t of terraces) { const d = dist(c, t); if (d < bd) { bd = d; best = t; } }
  return best.area;
}
function existsAlready(cand) {
  if (byPlaceId.has(cand.placeId)) return true;
  for (const t of terraces) {
    if (dist(cand, t) <= 60 && Math.max(overlap(cand.name, t.name), overlap(t.name, cand.name)) >= 0.6) return true;
  }
  return false;
}

// ── Additions ────────────────────────────────────────────────────────────────
const pool = [...report.confirmed, ...report.probable];
const skipped = { junk: [], cannabis: [], dupe: [] };
const additions = [];
for (const c of pool) {
  if (CANNABIS_RX.test(c.name)) { skipped.cannabis.push(c.name); continue; }
  if ((c.reviews ?? 0) < MIN_REVIEWS || (c.rating ?? 0) < MIN_RATING) { skipped.junk.push(`${c.name} (${c.rating}★/${c.reviews})`); continue; }
  if (existsAlready(c)) { skipped.dupe.push(c.name); continue; }
  const entry = {
    id: nextId++,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    area: nearestArea(c),
    facing: 'S',
    capacity: 'M',
    vibe: vibeFromTypes(c.types, c.name),
    address: c.address,
    verified: true,
    coordSource: 'places_api',
    verifiedAt: new Date().toISOString(),
    placeId: c.placeId,
    googleRating: c.rating,
    googleReviewCount: c.reviews,
    openness: 0.6,
  };
  if ((c.types ?? []).some((t) => t === 'coffee_shop') || /coffee|koffie|espresso/i.test(c.name)) {
    entry.category = ['coffee'];
  }
  additions.push(entry);
  byPlaceId.set(entry.placeId, entry); // guard against intra-report near-dupes
}

// ── Upgrades ─────────────────────────────────────────────────────────────────
let upgraded = 0;
for (const u of report.upgrades) {
  const t = byId.get(u.id);
  if (!t || t.coordSource !== 'estimated') continue;
  if (byPlaceId.has(u.placeId) && byPlaceId.get(u.placeId).id !== t.id) continue;
  t.lat = u.lat;
  t.lng = u.lng;
  t.address = u.address;
  t.placeId = u.placeId;
  t.googleRating = u.rating ?? undefined;
  t.googleReviewCount = u.reviews ?? undefined;
  t.verified = true;
  t.coordSource = 'places_api';
  t.verifiedAt = new Date().toISOString();
  byPlaceId.set(u.placeId, t);
  upgraded++;
}

console.log(`Pool: ${pool.length} (confirmed ${report.confirmed.length} + probable ${report.probable.length})`);
console.log(`Skipped — junk: ${skipped.junk.length}, cannabis: ${skipped.cannabis.length}, apply-time dupes: ${skipped.dupe.length}`);
if (skipped.junk.length) console.log('  junk:', skipped.junk.join(' | '));
if (skipped.cannabis.length) console.log('  cannabis:', skipped.cannabis.join(' | '));
if (skipped.dupe.length) console.log('  dupes:', skipped.dupe.join(' | '));
console.log(`ADDING: ${additions.length}  |  UPGRADING: ${upgraded}`);
console.log(`Count: ${terraces.length} -> ${terraces.length + additions.length}`);

if (!APPLY) { console.log('(dry-run — no writes. Re-run with --apply)'); process.exit(0); }
for (const e of additions) terraces.push(e);
writeFileSync(TERRACES, JSON.stringify(terraces, null, 2) + '\n');
console.log(`Wrote ${terraces.length} terraces -> ${TERRACES}`);
