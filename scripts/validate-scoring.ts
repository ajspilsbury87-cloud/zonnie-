/**
 * Sun-score validator. Two probes:
 *
 *   1. Café Kiebêrt deep-dive: score across 12-21h on a sunny May day.
 *      Andy's expectation: should be high (Full Sun / Mostly Sunny) from
 *      15-19h. SW-facing, Marathonweg 2.
 *
 *   2. Distribution audit: score every terrace at 16:00 (peak afternoon),
 *      bucket into 10% bins, and surface the top/bottom 20 with their
 *      facing + shadow status. Lets us spot whether the spread is sensible
 *      and whether obviously-sunny venues are landing where we'd expect.
 *
 * Run via `npm run validate-scoring` (added to package.json).
 */

import { TERRACES } from '../src/data/terraces';
import {
  getBuildings,
  getBuildingsForTerrace,
  isUsingRealBuildingData,
} from '../src/data/buildings';
import { computeSunScore, scoreLabel } from '../src/engines/scoring';
import { solarPosition } from '../src/engines/solar';
import { amsterdamLocalToUtc } from '../src/engines/scoring';

const DATE = '2026-05-15'; // mid-May, sun is high, no DST surprises

const buildings = getBuildings();
console.log(
  `Loaded ${TERRACES.length} terraces, ${buildings.length} buildings ` +
    `(${isUsingRealBuildingData() ? 'REAL OSM data' : 'procedural fallback'})`,
);

// ─────────────────────────────────────────────────────────────────────
// PROBE 1: Café Kiebêrt deep-dive
// ─────────────────────────────────────────────────────────────────────
const kiebert = TERRACES.find((t) => t.name.includes('Kiebêrt'));
if (!kiebert) {
  console.error('Café Kiebêrt not found in dataset!');
  process.exit(1);
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PROBE 1: Café Kiebêrt');
console.log('══════════════════════════════════════════════════════════════');
console.log(
  `id=${kiebert.id}  ${kiebert.name}  ${kiebert.area}  facing=${kiebert.facing}`,
);
console.log(`coords: ${kiebert.lat}, ${kiebert.lng}  (${kiebert.address})`);
console.log(`Date: ${DATE}  (sunny profile, no real weather)`);
console.log('');
console.log(
  'Hour  Sun-alt  Sun-az  Cover  Score   Label              Notes',
);
console.log(
  '────  ───────  ──────  ─────  ─────   ─────────────────  ─────',
);
const kiebertBuildings = getBuildingsForTerrace(kiebert.id);
console.log(`(${kiebertBuildings.length} buildings within 200m)`);

// Drill into the buildings causing shadow at 17:00 specifically.
const M_PER_DEG_LAT_C = 110540;
const M_PER_DEG_LNG_C = 111320 * Math.cos((52.37 * Math.PI) / 180);
const sun17 = solarPosition(amsterdamLocalToUtc(DATE, 17), kiebert.lat, kiebert.lng);
console.log(
  `\nBuildings around Kiebêrt at 17:00 (sun alt=${sun17.altitude.toFixed(0)}°, az=${sun17.azimuth.toFixed(0)}°):`,
);
console.log('  dist  bearing  height  width  blocks?');
const candidates = kiebertBuildings
  .map((b) => {
    const dx = (b.lng - kiebert.lng) * M_PER_DEG_LNG_C;
    const dy = (b.lat - kiebert.lat) * M_PER_DEG_LAT_C;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    const angularHeight = (Math.atan2(b.height, dist) * 180) / Math.PI;
    const angDiff = Math.min(
      Math.abs(bearing - sun17.azimuth),
      360 - Math.abs(bearing - sun17.azimuth),
    );
    return { dist, bearing, height: b.height, width: b.width ?? 15, angDiff, angularHeight };
  })
  .sort((a, b) => a.angDiff - b.angDiff)
  .slice(0, 10);
for (const c of candidates) {
  const blocks =
    c.angDiff < 30 && c.angularHeight >= sun17.altitude * 0.7 ? 'YES' : 'no';
  console.log(
    `  ${c.dist.toFixed(0).padStart(3)}m  ${c.bearing.toFixed(0).padStart(3)}°    ${c.height.toFixed(0).padStart(2)}m   ${c.width.toFixed(0).padStart(2)}m   angDiff=${c.angDiff.toFixed(0)}° angHt=${c.angularHeight.toFixed(0)}° ${blocks}`,
  );
}
console.log('');
for (let h = 12; h <= 21; h++) {
  const r = computeSunScore(kiebert, kiebertBuildings, h, DATE, 'sunny');
  const altDeg = r.sun.altitude.toFixed(1).padStart(5);
  const azDeg = r.sun.azimuth.toFixed(0).padStart(4);
  const cover = (r.shadow * 100).toFixed(0).padStart(3) + '%';
  const score = r.score.toFixed(3);
  const label = scoreLabel(r.score).padEnd(17);
  let notes = '';
  if (h >= 15 && h <= 19) notes += '← Andy expects Full/Mostly Sunny';
  console.log(
    `${h.toString().padStart(4)}:00  ${altDeg}°  ${azDeg}°   ${cover}   ${score}   ${label}  ${notes}`,
  );
}

// Range score 15-19h
let sum = 0;
for (let h = 15; h <= 19; h++) {
  sum += computeSunScore(kiebert, kiebertBuildings, h, DATE, 'sunny').score;
}
const avg = sum / 5;
console.log(
  `\n  Range avg 15-19h: ${avg.toFixed(3)} (${scoreLabel(avg)})`,
);

// ─────────────────────────────────────────────────────────────────────
// PROBE 2: Distribution audit
// ─────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('PROBE 2: Distribution at 16:00 on ' + DATE);
console.log('══════════════════════════════════════════════════════════════');

// Sun position at 16:00 to understand which terraces SHOULD score high.
const utc16 = amsterdamLocalToUtc(DATE, 16);
const cityCenterSun = solarPosition(utc16, 52.3676, 4.9041);
console.log(
  `Sun at 16:00 (city center): altitude=${cityCenterSun.altitude.toFixed(1)}°, azimuth=${cityCenterSun.azimuth.toFixed(0)}°`,
);
console.log(
  '(azimuth ~240 = WSW; SW & W facing terraces should peak here, with N-facing in their own building shadow)',
);

const scored = TERRACES.map((t) => {
  const tBuildings = getBuildingsForTerrace(t.id);
  const r = computeSunScore(t, tBuildings, 16, DATE, 'sunny');
  return {
    id: t.id,
    name: t.name,
    facing: t.facing,
    area: t.area,
    score: r.score,
    coverage: r.shadow,
  };
});

// Histogram in 5% buckets
const buckets: Record<string, number> = {};
for (const s of scored) {
  const k = String(Math.round(s.score * 20) * 5).padStart(3);
  buckets[k] = (buckets[k] || 0) + 1;
}
console.log('\nScore histogram (5% buckets):');
const maxCount = Math.max(...Object.values(buckets));
for (const k of Object.keys(buckets).sort((a, b) => Number(a) - Number(b))) {
  const count = buckets[k]!;
  const bar = '█'.repeat(Math.round((count / maxCount) * 50));
  console.log(`  ${k}%  ${bar} ${count}`);
}

// Mean by facing
const byFacing: Record<string, number[]> = {};
for (const s of scored) {
  (byFacing[s.facing] ??= []).push(s.score);
}
console.log('\nMean score by facing (at 16:00):');
console.log('Facing  Mean    Min     Max     Count');
for (const f of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All']) {
  const arr = byFacing[f];
  if (!arr || arr.length === 0) continue;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  console.log(
    `  ${f.padEnd(4)}  ${mean.toFixed(3)}  ${min.toFixed(3)}  ${max.toFixed(3)}  ${arr.length}`,
  );
}

// Top + bottom samples
console.log('\nTop 15 (highest score at 16:00):');
const sorted = [...scored].sort((a, b) => b.score - a.score);
for (const s of sorted.slice(0, 15)) {
  console.log(
    `  ${s.score.toFixed(3)}  ${s.facing.padEnd(3)}  ${s.name.padEnd(35).slice(0, 35)}  ${s.area}`,
  );
}
console.log('\nBottom 15 (lowest score at 16:00):');
for (const s of sorted.slice(-15).reverse()) {
  const tag = s.coverage > 0.5 ? `[shadow ${(s.coverage * 100).toFixed(0)}%]` : '';
  console.log(
    `  ${s.score.toFixed(3)}  ${s.facing.padEnd(3)}  ${s.name.padEnd(35).slice(0, 35)}  ${s.area}  ${tag}`,
  );
}

// Find Kiebêrt's rank
const kiebertScore = scored.find((s) => s.id === kiebert.id)!;
const rank = sorted.findIndex((s) => s.id === kiebert.id) + 1;
const pct = ((rank / sorted.length) * 100).toFixed(1);
console.log(
  `\nCafé Kiebêrt rank at 16:00: #${rank} of ${sorted.length} (top ${pct}%) — score ${kiebertScore.score.toFixed(3)}`,
);

// ─────────────────────────────────────────────────────────────────────
// PROBE 3: Sanity check — the 5 most-rated SW terraces in Oud-Zuid
// ─────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('PROBE 3: Other SW-facing terraces near Kiebêrt at 16:00');
console.log('══════════════════════════════════════════════════════════════');
const nearby = scored
  .filter(
    (s) =>
      s.facing === 'SW' &&
      Math.abs(TERRACES.find((t) => t.id === s.id)!.lat - kiebert.lat) < 0.02 &&
      Math.abs(TERRACES.find((t) => t.id === s.id)!.lng - kiebert.lng) < 0.02,
  )
  .sort((a, b) => b.score - a.score);
for (const s of nearby.slice(0, 10)) {
  const tag = s.coverage > 0.5 ? `[shadow ${(s.coverage * 100).toFixed(0)}%]` : '';
  console.log(
    `  ${s.score.toFixed(3)}  ${s.name.padEnd(35).slice(0, 35)}  ${s.area}  ${tag}`,
  );
}
