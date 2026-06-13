/**
 * Derive `facing` for terraces from the 3D BAG building geometry.
 *
 * Why: the 44 research-added terraces had defaulted facings (30×"S", 14×"All",
 * no other directions) — statistically implausible, almost certainly guessed.
 * Facing drives a ±scoring swing, so guesses can't ship.
 *
 * Model (consistent with the scoring engine): a terrace's seating opens toward
 * its most-open sky direction. Open to the south → south-facing → catches the
 * midday sun. Hemmed in to the south (building there) → it faces the street the
 * other way → the sun is "behind" it → shaded. So `facing` = the compass bearing
 * of maximum open sky, weighted by how open each direction is.
 *
 *   - 72 azimuth bins of horizon elevation (same math as compute-openness.ts).
 *   - per-bin openness = 1 − min(horizon, 45)/45.
 *   - openness-weighted circular mean bearing → dominant open direction.
 *   - resultant length R ∈ [0,1] = how *directional* the openness is.
 *       R < R_ALL  → open/blocked broadly or along an ambiguous axis → "All".
 *       else       → snap mean bearing to the nearest 8-point compass.
 *
 * Only rewrites facings for the ids passed in --ids (the new terraces); never
 * touches the existing, human-verified facings. Run:
 *   npx tsx scripts/derive-facing.ts --ids 1416,1417,...    (dry-run: add --dry)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TERRACES_PATH = 'src/data/terraces.json';
const BUILDINGS_PATH = 'src/data/buildings.json';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos(52.37 * DEG);

const BINS = 72;
const MIN_DIST_M = 8;
const MAX_DIST_M = 200;
const MAX_HALF_WIDTH_DEG = 15;
const CANYON_DEG = 45;
const R_ALL = 0.30; // below this, openness is too spread/ambiguous → "All"

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

interface B { lat: number; lng: number; height: number; width?: number }

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const idsArg = args[args.indexOf('--ids') + 1] ?? '';
const targetIds = new Set(idsArg.split(',').map((s) => Number(s.trim())).filter(Boolean));
if (targetIds.size === 0) { console.error('pass --ids 1416,1417,...'); process.exit(1); }

const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf8')) as Array<
  Record<string, unknown> & { id: number; name: string; lat: number; lng: number; facing: string }
>;
const buildings = JSON.parse(readFileSync(BUILDINGS_PATH, 'utf8')) as Record<string, B[]>;

function deriveFacing(t: { id: number; lat: number; lng: number }): { facing: string; R: number } {
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
    let i = startBin;
    for (;;) { if (angHeight > horizon[i]!) horizon[i] = angHeight; if (i === endBin) break; i = (i + 1) % BINS; }
  }
  // openness-weighted circular mean of bin bearings
  let sumSin = 0, sumCos = 0, sumW = 0;
  for (let i = 0; i < BINS; i++) {
    const az = (i * (360 / BINS) + (360 / BINS) / 2) * DEG;
    const open = 1 - Math.min(horizon[i]!, CANYON_DEG) / CANYON_DEG;
    sumSin += open * Math.sin(az);
    sumCos += open * Math.cos(az);
    sumW += open;
  }
  if (sumW === 0) return { facing: 'All', R: 0 };
  const R = Math.hypot(sumSin, sumCos) / sumW;
  if (R < R_ALL) return { facing: 'All', R };
  const meanAz = (Math.atan2(sumSin, sumCos) * RAD + 360) % 360;
  const idx = Math.round(meanAz / 45) % 8;
  return { facing: DIRS[idx]!, R };
}

let changed = 0;
const dist: Record<string, number> = {};
for (const t of terraces) {
  if (!targetIds.has(t.id)) continue;
  const { facing, R } = deriveFacing(t);
  dist[facing] = (dist[facing] ?? 0) + 1;
  console.log(`  #${t.id} ${t.name.slice(0, 30).padEnd(30)} ${String(t.facing).padEnd(4)} → ${facing.padEnd(4)} (R=${R.toFixed(2)})`);
  if (!dry) t.facing = facing;
  if (t.facing !== facing) changed++;
}
console.log('\nderived distribution:', JSON.stringify(dist));
if (dry) { console.log('DRY-RUN — no file written.'); }
else { writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n'); console.log(`wrote ${TERRACES_PATH} (${targetIds.size} facings derived)`); }
