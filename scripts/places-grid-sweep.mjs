// =============================================================================
// places-grid-sweep.mjs — comprehensive coverage sweep via grid Nearby Search
// -----------------------------------------------------------------------------
// The text-search sweep put "terrace" in every query, which skipped brown bars
// (bruine kroegen) Google doesn't tag as having a terrace. This walks a grid of
// points across Amsterdam asking "what bar/cafe venues are within RADIUS of
// here" — completeness regardless of how the listing is worded.
//
//   node scripts/places-grid-sweep.mjs --calibrate   # ~12 cells, cost probe
//   node scripts/places-grid-sweep.mjs               # full core grid
//
// Writes a report to the scratchpad; makes NO repo changes.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const CALIBRATE = process.argv.includes('--calibrate');
const REPO = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae';
const OUT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/grid-sweep-report.json';

const KEY = (readFileSync(`${REPO}/.env.local`, 'utf8').match(/^GOOGLE_MAPS_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY || !KEY.startsWith('AIza')) throw new Error('GOOGLE_MAPS_API_KEY missing');

// Dense populated core (covers Centrum, Jordaan, De Pijp, Oost, West, Oud-West/
// Zuid, De Baarsjes, Haarlemmerbuurt, south Noord). Outer sparse areas were
// covered by the earlier text sweep; a coarse outer ring can be a follow-up.
const BBOX = { minLat: 52.345, maxLat: 52.410, minLng: 4.845, maxLng: 4.945 };
const SPACING_M = 400;
const RADIUS_M = 285;

const M_LAT = 110540, M_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
function buildGrid() {
  const dLat = SPACING_M / M_LAT, dLng = SPACING_M / M_LNG;
  const pts = [];
  for (let la = BBOX.minLat; la <= BBOX.maxLat; la += dLat)
    for (let ln = BBOX.minLng; ln <= BBOX.maxLng; ln += dLng)
      pts.push({ lat: +la.toFixed(6), lng: +ln.toFixed(6) });
  return pts;
}
// Calibration: a spread of dense (centre/Pijp/Jordaan) + medium cells.
const CALIB = [
  { lat: 52.3676, lng: 4.9041 }, { lat: 52.3600, lng: 4.8920 }, // Centrum, De Pijp
  { lat: 52.3730, lng: 4.8830 }, { lat: 52.3660, lng: 4.9250 }, // Jordaan, Oost
  { lat: 52.3580, lng: 4.8680 }, { lat: 52.3800, lng: 4.9000 }, // Oud-West, centre-N
  { lat: 52.3520, lng: 4.9100 }, { lat: 52.3690, lng: 4.8600 }, // Amstel, De Baarsjes
  { lat: 52.3560, lng: 4.8850 }, { lat: 52.3630, lng: 4.9050 }, // Oud-Zuid, Weesperzijde
  { lat: 52.3900, lng: 4.9100 }, { lat: 52.3480, lng: 4.9000 }, // Noord-S, Rivierenbuurt
];

const TYPE_GROUPS = [
  ['bar', 'pub', 'wine_bar'],
  ['cafe', 'coffee_shop', 'bakery'],
];
const FIELDS = 'places.id,places.displayName,places.location,places.formattedAddress,places.businessStatus,places.types,places.rating,places.userRatingCount';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function nearby(center, includedTypes) {
  calls++;
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: RADIUS_M } },
    }),
  });
  if (!r.ok) { console.log('  !!', r.status, (await r.text()).slice(0, 120)); return []; }
  return (await r.json()).places ?? [];
}

// Dedupe scaffolding against the current dataset.
const terraces = JSON.parse(readFileSync(`${REPO}/src/data/terraces.json`, 'utf8'));
const havePlaceId = new Set(terraces.filter((t) => t.placeId).map((t) => t.placeId));
const dist = (a, b) => Math.sqrt(((b.lng - a.lng) * M_LNG) ** 2 + ((b.lat - a.lat) * M_LAT) ** 2);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function overlap(a, b) { const ta = norm(a).split(' ').filter((x) => x.length >= 3); if (!ta.length) return 0; const nb = norm(b); return ta.filter((x) => nb.includes(x)).length / ta.length; }
function existing(name, c) {
  for (const t of terraces) if (dist(c, t) <= 60 && Math.max(overlap(name, t.name), overlap(t.name, name)) >= 0.6) return true;
  return false;
}

const CANNABIS = /coffeeshop|cannabis/i;
const seen = new Map(); // placeId -> candidate

async function run(points) {
  for (let i = 0; i < points.length; i++) {
    for (const grp of TYPE_GROUPS) {
      const places = await nearby(points[i], grp);
      for (const p of places) {
        const pid = p.id, lat = p.location?.latitude, lng = p.location?.longitude;
        if (!pid || lat == null || seen.has(pid)) continue;
        if (havePlaceId.has(pid)) continue;                     // already in dataset (by id)
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
        const name = p.displayName?.text ?? '';
        if (CANNABIS.test(name)) continue;
        if (existing(name, { lat, lng })) continue;             // proximity+name dupe
        seen.set(pid, {
          placeId: pid, name, lat, lng, address: p.formattedAddress ?? '',
          rating: p.rating ?? null, reviews: p.userRatingCount ?? 0, types: (p.types ?? []).slice(0, 5),
        });
      }
      await sleep(120);
    }
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${points.length} cells · ${calls} calls · ${seen.size} new`);
  }
}

const grid = CALIBRATE ? CALIB : buildGrid();
console.log(`${CALIBRATE ? 'CALIBRATION' : 'FULL'} grid: ${grid.length} cells × ${TYPE_GROUPS.length} groups = ${grid.length * TYPE_GROUPS.length} calls`);
await run(grid);

const cands = [...seen.values()];
const q = (min, rt) => cands.filter((c) => c.reviews >= min && (c.rating ?? 0) >= rt).length;
writeFileSync(OUT, JSON.stringify({ mode: CALIBRATE ? 'calibrate' : 'full', cells: grid.length, calls, candidates: cands }, null, 2));

console.log(`\n════ ${CALIBRATE ? 'CALIBRATION' : 'FULL'} RESULT ════`);
console.log(`API calls: ${calls}  (~$${(calls * 0.032).toFixed(2)} at Nearby Pro $0.032)`);
console.log(`NEW unique venues (not in dataset): ${cands.length}`);
console.log(`  quality-gated ≥20 reviews & ≥3.7★: ${q(20, 3.7)}`);
console.log(`  quality-gated ≥15 reviews & ≥3.5★: ${q(15, 3.5)}`);
if (CALIBRATE) {
  const perCell = cands.length / grid.length;
  const full = Math.round((BBOX.maxLat - BBOX.minLat) / (SPACING_M / M_LAT)) * Math.round((BBOX.maxLng - BBOX.minLng) / (SPACING_M / M_LNG));
  console.log(`\nPROJECTION → full core grid ≈ ${full} cells, ${full * TYPE_GROUPS.length} calls, ~$${(full * TYPE_GROUPS.length * 0.032).toFixed(2)}`);
  console.log(`  new-venue rate ≈ ${perCell.toFixed(1)}/cell (raw; heavy overlap collapses this at full scale)`);
}
console.log(`Report → ${OUT}`);
