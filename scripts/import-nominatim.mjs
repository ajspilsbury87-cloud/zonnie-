/**
 * import-nominatim.mjs — add venues to terraces.json via free OpenStreetMap
 * (Nominatim) geocoding — no API key. Lower quality than the Places pipeline
 * (no Google rating, no outdoor-seating check) so entries are verified:false /
 * coordSource:'estimated'. Facing defaults to 'S' (matches the Places import).
 *
 *   node scripts/import-nominatim.mjs            # dry-run (preview, no writes)
 *   node scripts/import-nominatim.mjs --apply    # append to terraces.json
 *
 * Then: npx tsx scripts/build-terraces-lite.ts   # regenerate the web dataset
 */
import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TERRACES = 'src/data/terraces.json';
const UA = 'Zonnie-terrace-import/1.0 (a.j.spilsbury87@gmail.com)';
const BBOX = { minLat: 52.27, maxLat: 52.45, minLng: 4.7, maxLng: 5.05 };

// Curated De Pijp café / bar / restaurant terraces (Juno was the flagged gap).
// Nominatim validates existence + location; dedupe drops any already present.
const CANDIDATES = [
  'Juno', 'Café Binnen Buiten', 'Café Krull', 'Pilsvogel', 'Little Collins',
  'Café Kingfisher', 'De Duvel', 'Yerba', 'Volt Amsterdam', 'Café Ruis',
  'Firma Pekelharing', 'Café Berkhout', 'Gambrinus', 'Café Sarphaat',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M_LAT = 110540, M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
function dist(a, b) { const dx = (b.lng - a.lng) * M_LNG, dy = (b.lat - a.lat) * M_LAT; return Math.sqrt(dx * dx + dy * dy); }
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function overlap(a, b) { const ta = norm(a).split(' ').filter((t) => t.length >= 3); if (!ta.length) return 0; const nb = norm(b); return ta.filter((t) => nb.includes(t)).length / ta.length; }
function inBbox(la, ln) { return la >= BBOX.minLat && la <= BBOX.maxLat && ln >= BBOX.minLng && ln <= BBOX.maxLng; }

async function geocode(name) {
  const q = encodeURIComponent(name + ', De Pijp, Amsterdam, Netherlands');
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=5&addressdetails=1`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const arr = await r.json();
  const inb = arr.filter((x) => inBbox(+x.lat, +x.lon));
  const amenity = inb.find((x) => x.class === 'amenity');
  return amenity || inb[0] || null;
}

const terraces = JSON.parse(readFileSync(TERRACES, 'utf-8'));
let nextId = terraces.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;
function nearestArea(c) { let best = terraces[0], bd = Infinity; for (const t of terraces) { const d = dist(c, t); if (d < bd) { bd = d; best = t; } } return best.area; }
function existingMatch(name, c) {
  for (const t of terraces) {
    if (norm(t.name) === norm(name)) return t;
    if (dist(c, t) <= 120 && Math.max(overlap(name, t.name), overlap(t.name, name)) >= 0.5) return t;
  }
  return null;
}
const typeVibe = { cafe: 'Café', bar: 'Bar', pub: 'Café', restaurant: 'Restaurant' };

const added = [];
for (const name of CANDIDATES) {
  let res = null;
  try { res = await geocode(name); } catch (e) { console.log(`  ${name.padEnd(22)} ERROR ${e.message}`); await sleep(1200); continue; }
  if (!res) { console.log(`  ${name.padEnd(22)} — not found in Amsterdam`); await sleep(1200); continue; }
  const c = { lat: +res.lat, lng: +res.lon };
  const dup = existingMatch(name, c);
  if (dup) { console.log(`  ${name.padEnd(22)} dup of #${dup.id} "${dup.name}"`); await sleep(1200); continue; }
  const entry = {
    id: nextId++, name, lat: c.lat, lng: c.lng, area: nearestArea(c),
    facing: 'S', capacity: 'M', vibe: typeVibe[res.type] || 'De Pijp terrace',
    address: (res.display_name || '').split(', Amsterdam')[0] + ', Amsterdam',
    verified: false, coordSource: 'estimated', verifiedAt: null, openness: 0.6,
  };
  added.push(entry);
  console.log(`  ${name.padEnd(22)} + NEW #${entry.id}  ${c.lat.toFixed(5)},${c.lng.toFixed(5)}  [${entry.area}] ${res.class}/${res.type}`);
  await sleep(1200);
}

console.log(`\n${added.length} new / ${CANDIDATES.length} candidates`);
if (!APPLY) { console.log('(dry-run — no writes. Re-run with --apply)'); process.exit(0); }
for (const e of added) terraces.push(e);
writeFileSync(TERRACES, JSON.stringify(terraces, null, 2) + '\n');
console.log(`Wrote ${terraces.length} terraces (+${added.length}) → ${TERRACES}`);
