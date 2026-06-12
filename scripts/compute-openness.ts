/**
 * Precompute per-terrace sky OPENNESS from the 3D BAG building data.
 *
 * Why: at any fixed hour, weather/temp/wind are city-wide constants and
 * facing has only 9 buckets — so unshadowed same-facing terraces collapse
 * onto literally identical scores (audit 20: 338 pins displaying "90").
 * Openness is the honest per-terrace differentiator we already have data
 * for: how hemmed-in a terrace is by surrounding buildings, across ALL
 * directions. A canal-alley terrace and an open square genuinely differ
 * in experienced sunniness (direct-sun window breadth + ambient light)
 * even when neither is shadowed at the queried hour.
 *
 * Method (mirrors shadow.ts conventions — bearings from North, clockwise):
 *   - 72 azimuth bins (5° each) of horizon elevation, initialised to 0.
 *   - For each building within [8 m, 200 m] (same bounds as the shadow
 *     engine; <8 m = the terrace's own host building): angular height
 *     atan(h/d), angular half-width atan(width/2 / d) capped at 15°,
 *     painted into the bins it covers (max wins per bin).
 *   - meanHorizon = average bin elevation. openness = 1 − min(mean,45)/45.
 *     Physical anchors: fully open square → 1.0; mean 45° canyon → 0.0.
 *
 * Output: writes an `openness` field (3 dp) onto every terrace in
 * src/data/terraces.json. The scoring engine maps it into a modest
 * multiplier (×0.85–1.00) — see computeSunScore.
 *
 * Run: npx tsx scripts/compute-openness.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TERRACES_PATH = 'src/data/terraces.json';
const BUILDINGS_PATH = 'src/data/buildings.json';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos(52.37 * DEG);

const BINS = 72;                 // 5° each
const MIN_DIST_M = 8;            // own host building — excluded (as in shadow.ts)
const MAX_DIST_M = 200;          // beyond this, buildings barely raise the horizon
const MAX_HALF_WIDTH_DEG = 15;   // cap, as in shadow.ts centroid fallback
const CANYON_DEG = 45;           // mean horizon at which openness bottoms out

interface B { lat: number; lng: number; height: number; width?: number }

const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf8')) as Array<
  Record<string, unknown> & { id: number; lat: number; lng: number }
>;
const buildings = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8')) as Record<string, B[]>;

const values: number[] = [];
for (const t of terraces) {
  const nearby = buildings[String(t.id)] ?? [];
  const horizon = new Array<number>(BINS).fill(0);

  for (const b of nearby) {
    const dx = (b.lng - t.lng) * M_PER_DEG_LNG;
    const dy = (b.lat - t.lat) * M_PER_DEG_LAT;
    const dist = Math.hypot(dx, dy);
    if (dist < MIN_DIST_M || dist > MAX_DIST_M) continue;

    const angHeight = Math.atan2(b.height, dist) * RAD;
    const bearing = (Math.atan2(dx, dy) * RAD + 360) % 360;
    const halfW = Math.min(MAX_HALF_WIDTH_DEG, Math.atan2((b.width ?? 15) / 2, dist) * RAD);

    const startBin = Math.floor(((bearing - halfW + 360) % 360) / (360 / BINS));
    const endBin = Math.floor(((bearing + halfW) % 360) / (360 / BINS));
    // paint bins from start to end inclusive, wrapping at 360°
    let i = startBin;
    for (;;) {
      if (angHeight > horizon[i]!) horizon[i] = angHeight;
      if (i === endBin) break;
      i = (i + 1) % BINS;
    }
  }

  const meanHorizon = horizon.reduce((a, v) => a + v, 0) / BINS;
  const openness = Math.round((1 - Math.min(meanHorizon, CANYON_DEG) / CANYON_DEG) * 1000) / 1000;
  (t as Record<string, unknown>).openness = openness;
  values.push(openness);
}

writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');

// ── Sanity report ─────────────────────────────────────────────────────────────
values.sort((a, b) => a - b);
const n = values.length;
const mean = values.reduce((a, v) => a + v, 0) / n;
const distinct = new Set(values.map((v) => v.toFixed(3))).size;
console.log(`openness written for ${n} terraces`);
console.log(`min ${values[0]}  p25 ${values[Math.floor(n * 0.25)]}  median ${values[Math.floor(n * 0.5)]}  p75 ${values[Math.floor(n * 0.75)]}  max ${values[n - 1]}  mean ${mean.toFixed(3)}`);
console.log(`distinct 3dp values: ${distinct}`);
const sorted = [...terraces].sort((a, b) => (a.openness as number) - (b.openness as number));
console.log('most hemmed-in:', sorted.slice(0, 5).map((t) => `${t.name} ${(t.openness as number).toFixed(2)}`).join(' | '));
console.log('most open:     ', sorted.slice(-5).map((t) => `${t.name} ${(t.openness as number).toFixed(2)}`).join(' | '));
