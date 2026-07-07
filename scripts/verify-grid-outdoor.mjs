// =============================================================================
// verify-grid-outdoor.mjs — outdoor-seating verification for the grid sweep
// -----------------------------------------------------------------------------
// User chose "verify outdoor seating". Classify the 963 quality-gated grid
// candidates:
//   AUTO   — has a classic terrace type (bar/pub/cafe...) AND no retail type →
//            accept without an API call (Amsterdam bars/cafes ~all have terraces)
//   VERIFY — ambiguous (bakery, restaurant, hotel, cocktail bar, retail+cafe) →
//            fetch Places `outdoorSeating`; keep only where it's TRUE
//   DROP   — only non-hospitality types
//
// Writes the accepted set to grid-sweep-accepted.json (same shape the apply
// script consumes). Verification cost only on the VERIFY set (~$0.035 each).
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const REPO = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae';
const SCRATCH = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad';
const REPORT = `${SCRATCH}/grid-sweep-report.json`;
const OUT = `${SCRATCH}/grid-sweep-accepted.json`;

const KEY = (readFileSync(`${REPO}/.env.local`, 'utf8').match(/^GOOGLE_MAPS_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) throw new Error('key missing');

const AUTO = new Set(['bar', 'pub', 'wine_bar', 'gastropub', 'irish_pub', 'sports_bar', 'brewery', 'cafe', 'coffee_shop', 'cat_cafe']);
const DROP = /^(supermarket|convenience_store|grocery_store|gas_station|.*_store|store|hair_salon|beauty_salon|massage|gym|sports_school|sports_complex|laundry|drugstore|car_dealer|butcher_shop|yoga_studio|art_studio|art_gallery|movie_theater|video_arcade|amusement_center|wedding_venue|event_venue|cultural_center|community_center|concert_hall|performing_arts_theater|tourist_attraction|chocolate_factory|miniature_golf_course|market)$/;

const g = JSON.parse(readFileSync(REPORT, 'utf8')).candidates.filter((c) => c.reviews >= 15 && (c.rating ?? 0) >= 3.5);

const auto = [], toVerify = [];
let dropped = 0;
for (const c of g) {
  const ty = c.types ?? [];
  const hasDrop = ty.some((x) => DROP.test(x));
  if (ty.some((x) => AUTO.has(x)) && !hasDrop) { auto.push(c); continue; }
  if (ty.length && ty.every((x) => DROP.test(x))) { dropped++; continue; }
  toVerify.push(c);
}
console.log(`AUTO ${auto.length} · VERIFY ${toVerify.length} · DROP ${dropped}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0, kept = 0, no = 0, unknown = 0, closed = 0;
const verifiedKeep = [];
for (let i = 0; i < toVerify.length; i++) {
  const c = toVerify[i];
  calls++;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${c.placeId}`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'businessStatus,outdoorSeating' },
    });
    if (r.ok) {
      const d = await r.json();
      if (d.businessStatus && d.businessStatus !== 'OPERATIONAL') closed++;
      else if (d.outdoorSeating === true) { verifiedKeep.push(c); kept++; }
      else if (d.outdoorSeating === false) no++;
      else unknown++; // null — unknown seating; dropped for the terrace-app promise
    }
  } catch { /* skip on error */ }
  if ((i + 1) % 50 === 0) console.log(`  verified ${i + 1}/${toVerify.length} · kept ${kept}`);
  await sleep(120);
}

const accepted = [...auto, ...verifiedKeep];
writeFileSync(OUT, JSON.stringify({ candidates: accepted }, null, 2));
console.log(`\n════ VERIFY DONE ════`);
console.log(`Verify API calls: ${calls}  (~$${(calls * 0.035).toFixed(2)})`);
console.log(`  outdoorSeating TRUE (kept): ${kept}`);
console.log(`  FALSE (dropped): ${no} · unknown/null (dropped): ${unknown} · closed: ${closed}`);
console.log(`ACCEPTED TOTAL: ${accepted.length}  (${auto.length} auto + ${kept} verified)`);
console.log(`Report → ${OUT}`);
