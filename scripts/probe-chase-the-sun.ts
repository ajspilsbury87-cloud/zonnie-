#!/usr/bin/env tsx
/**
 * "Chase the Sun" walking-crawl feasibility probe.  (ANALYSIS ONLY)
 *
 * THE QUESTION: does the real ~993-terrace Amsterdam dataset produce walkable
 * "sun hand-offs" often enough to support a route that keeps a user in sunlight
 * as the sun crosses the afternoon? When your terrace falls into shade, is there
 * reliably another still-sunny terrace a short walk away - enough to chain 3+ stops?
 *
 * METHOD (and why):
 * - CLEAR-SKY: weatherProfile='sunny', hourlyWeather=undefined -> synthetic sunny
 *   fallback. Hand-off feasibility is fundamentally a building/tree shadow-geometry
 *   question, not weather: clouds scale every terrace down together on a given hour
 *   so they don't change WHICH terrace is sunnier than which. We isolate the geometry.
 * - Long summer day 2026-06-21 (near solstice) - the most generous afternoon. If it
 *   fails here it fails in spring/autumn.
 * - Hours 13:00-22:00 at half-hour steps (so hand-offs land mid-hour).
 * - sunLeaves(t): last sampled time h where score(h)>=SUN and score(h+step)<SUN.
 *   Terraces never reaching SUN are skipped.
 * - Walk: haversine metres, ~80 m/min. Easy=<=6min~=480m. Strict=<=4min~=320m.
 * - HAND-OFF: from A going shady at T=sunLeaves(A), is there a B within the cutoff
 *   STILL sunny at arrival (T+walk), ideally with a later sunLeaves than A?
 * - CHAIN (the real metric): greedy walk. Start at each terrace sunny at 15:00; at
 *   each sunLeaves moment hop to the best reachable still-sunny terrace (longest
 *   remaining sun; tie-break nearest). Report % of starts reaching 3 / 4 stops at
 *   both cutoffs, hand-off distance distribution, and sunny-minutes delivered.
 *
 * LIMITATIONS: clear-sky only (overcast kills it regardless); SUN=0.5 is the engine's
 * "is it sunny" line; distances are straight-line haversine NOT street-network, so
 * reachability is an OPTIMISTIC upper bound (canals/bridges make real walks longer);
 * no dwell/ordering time, table availability, or one-way detours modelled. "Feasible
 * here" = geometrically possible (necessary condition), not a guaranteed pleasant crawl.
 *
 * Run:  npx tsx scripts/probe-chase-the-sun.ts   (same tsx runner as other probe-*.ts)
 * Touches NOTHING in src/ - read-only analysis.
 */

import { TERRACES } from '../src/data/terraces';
import { computeSunScore } from '../src/engines/scoring';
import { getBuildingsForTerrace } from '../src/data/buildings';
import { getTreesForTerrace } from '../src/data/trees';
import type { Terrace } from '../src/engines/types';

const DATE = '2026-06-21';
const SUN = 0.5;
const HOUR_FROM = 13;
const HOUR_TO = 22;
const STEP = 0.5;
const WALK_MPM = 80;
const EASY_MIN = 6;
const STRICT_MIN = 4;
const EASY_M = EASY_MIN * WALK_MPM;
const STRICT_M = STRICT_MIN * WALK_MPM;
const START_HOUR = 15;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const STEPS: number[] = [];
for (let h = HOUR_FROM; h <= HOUR_TO + 1e-9; h += STEP) STEPS.push(Number(h.toFixed(2)));

interface TProfile {
  t: Terrace;
  scores: number[];
  sunLeavesTime: number;
  everSunny: boolean;
  startScore: number;
}

console.log(
  `Chase-the-Sun feasibility - ${DATE}, clear-sky (sunny profile), ` +
    `${HOUR_FROM}:00-${HOUR_TO}:00 @ ${STEP}h steps, SUN>=${SUN}`,
);
console.log(`Terraces in dataset: ${TERRACES.length}\n`);
const t0 = Date.now();

const profiles: TProfile[] = TERRACES.map((t) => {
  const buildings = getBuildingsForTerrace(t.id);
  const trees = getTreesForTerrace(t.id);
  const scores = STEPS.map(
    (h) => computeSunScore(t, h, DATE, 'sunny', undefined, buildings, trees).score,
  );
  let everSunny = false;
  let sunLeavesTime = -1;
  for (let i = 0; i < STEPS.length; i++) {
    if (scores[i]! >= SUN) everSunny = true;
    if (i + 1 < STEPS.length && scores[i]! >= SUN && scores[i + 1]! < SUN) {
      sunLeavesTime = STEPS[i]!;
    }
  }
  const startIdx = STEPS.indexOf(START_HOUR);
  const startScore = startIdx >= 0 ? scores[startIdx]! : 0;
  return { t, scores, sunLeavesTime, everSunny, startScore };
});

const scoreAt = (p: TProfile, time: number): number => {
  const idx = STEPS.indexOf(Number(time.toFixed(2)));
  if (idx >= 0) return p.scores[idx]!;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < STEPS.length; i++) {
    const d = Math.abs(STEPS[i]! - time);
    if (d < bestD) {
      bestD = d;
      best = p.scores[i]!;
    }
  }
  return best;
};

const everSunnyList = profiles.filter((p) => p.everSunny);
const withExit = profiles.filter((p) => p.sunLeavesTime >= 0);
console.log(
  `Terraces ever sunny in window: ${everSunnyList.length} ` +
    `(${((everSunnyList.length / profiles.length) * 100).toFixed(0)}%)`,
);
console.log(`Terraces with a clean sun->shade transition: ${withExit.length}\n`);

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
const CELL_M = EASY_M;
const cellKey = (lat: number, lng: number) =>
  `${Math.round((lat * M_PER_DEG_LAT) / CELL_M)}:${Math.round((lng * M_PER_DEG_LNG) / CELL_M)}`;
const grid = new Map<string, TProfile[]>();
for (const p of profiles) {
  const k = cellKey(p.t.lat, p.t.lng);
  (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
}
function neighbours(p: TProfile): TProfile[] {
  const cl = Math.round((p.t.lat * M_PER_DEG_LAT) / CELL_M);
  const cg = Math.round((p.t.lng * M_PER_DEG_LNG) / CELL_M);
  const out: TProfile[] = [];
  for (let dl = -1; dl <= 1; dl++)
    for (let dg = -1; dg <= 1; dg++) {
      const arr = grid.get(`${cl + dl}:${cg + dg}`);
      if (arr) out.push(...arr);
    }
  return out;
}

function handoffStats(cutoffM: number) {
  let hasAny = 0;
  let hasBetter = 0;
  const dists: number[] = [];
  for (const a of withExit) {
    const T = a.sunLeavesTime;
    const walkMin = cutoffM / WALK_MPM;
    const arrive = T + walkMin / 60;
    let any = false;
    let better = false;
    let bestDist = Infinity;
    for (const b of neighbours(a)) {
      if (b === a) continue;
      const d = haversineM(a.t.lat, a.t.lng, b.t.lat, b.t.lng);
      if (d > cutoffM) continue;
      if (scoreAt(b, arrive) >= SUN) {
        any = true;
        if (d < bestDist) bestDist = d;
        if (b.sunLeavesTime > T) better = true;
      }
    }
    if (any) {
      hasAny++;
      dists.push(bestDist);
    }
    if (better) hasBetter++;
  }
  return { hasAny, hasBetter, total: withExit.length, dists };
}

interface ChainResult {
  stops: number;
  sunnyMinutes: number;
  handoffDists: number[];
  area: string;
}

function greedyChain(start: TProfile, cutoffM: number): ChainResult {
  const visited = new Set<number>([start.t.id]);
  const handoffDists: number[] = [];
  let stops = 1;
  let sunnyMinutes = 0;
  let cur = start;
  let clock = START_HOUR;
  for (let guard = 0; guard < 12; guard++) {
    const leave = cur.sunLeavesTime;
    if (leave < clock) {
      let endTime = HOUR_TO;
      for (const h of STEPS) {
        if (h < clock) continue;
        if (scoreAt(cur, h) < SUN) {
          endTime = h;
          break;
        }
      }
      sunnyMinutes += Math.max(0, (endTime - clock) * 60);
      break;
    }
    sunnyMinutes += Math.max(0, (leave - clock) * 60);
    const arrive = leave;
    let next: TProfile | null = null;
    let nextDist = Infinity;
    let nextLeaves = -Infinity;
    for (const b of neighbours(cur)) {
      if (visited.has(b.t.id)) continue;
      const d = haversineM(cur.t.lat, cur.t.lng, b.t.lat, b.t.lng);
      if (d > cutoffM) continue;
      const walkH = d / WALK_MPM / 60;
      if (scoreAt(b, arrive + walkH) < SUN) continue;
      if (b.sunLeavesTime > nextLeaves || (b.sunLeavesTime === nextLeaves && d < nextDist)) {
        next = b;
        nextDist = d;
        nextLeaves = b.sunLeavesTime;
      }
    }
    if (!next) break;
    handoffDists.push(nextDist);
    visited.add(next.t.id);
    const walkH = nextDist / WALK_MPM / 60;
    clock = leave + walkH;
    cur = next;
    stops++;
  }
  return { stops, sunnyMinutes, handoffDists, area: start.t.area };
}

const starts = profiles.filter((p) => p.startScore >= SUN);

function runChains(cutoffM: number) {
  const results = starts.map((s) => greedyChain(s, cutoffM));
  const n = results.length;
  const ge = (k: number) => results.filter((r) => r.stops >= k).length;
  const allHandoffs = results.flatMap((r) => r.handoffDists);
  const sunnyMins = results.map((r) => r.sunnyMinutes).sort((a, b) => a - b);
  return { n, results, ge, allHandoffs, sunnyMins };
}

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(0) : '0');
const median = (arr: number[]) =>
  arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)]! : NaN;
const pctl = (arr: number[], q: number) => {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

console.log(`Greedy-crawl starts (sunny at ${START_HOUR}:00): ${starts.length}\n`);

for (const [label, cutoffM] of [
  ['EASY  (<=6 min / 480 m)', EASY_M],
  ['STRICT(<=4 min / 320 m)', STRICT_M],
] as const) {
  console.log(`========== ${label} ==========`);

  const ho = handoffStats(cutoffM);
  console.log(
    `Hand-off availability: ${ho.hasAny}/${ho.total} (${pct(ho.hasAny, ho.total)}%) ` +
      `of exiting terraces have a still-sunny terrace within ${cutoffM}m at hand-off time; ` +
      `${ho.hasBetter}/${ho.total} (${pct(ho.hasBetter, ho.total)}%) find one that stays sunny LONGER.`,
  );
  if (ho.dists.length) {
    console.log(
      `   nearest-partner hand-off distance: median ${median(ho.dists).toFixed(0)}m, ` +
        `p90 ${pctl(ho.dists, 0.9).toFixed(0)}m`,
    );
  }

  const c = runChains(cutoffM);
  console.log(
    `Chains: ${pct(c.ge(2), c.n)}% reach >=2 stops, ` +
      `${pct(c.ge(3), c.n)}% reach >=3 stops, ` +
      `${pct(c.ge(4), c.n)}% reach >=4 stops, ` +
      `${pct(c.ge(5), c.n)}% reach >=5 stops (n=${c.n})`,
  );
  if (c.allHandoffs.length) {
    console.log(
      `   hand-off walk distance across all chains: median ${median(c.allHandoffs).toFixed(0)}m, ` +
        `p90 ${pctl(c.allHandoffs, 0.9).toFixed(0)}m, max ${Math.max(...c.allHandoffs).toFixed(0)}m`,
    );
  }
  console.log(
    `   sunny-minutes delivered per crawl: median ${median(c.sunnyMins).toFixed(0)} min, ` +
      `p90 ${pctl(c.sunnyMins, 0.9).toFixed(0)} min, max ${Math.max(...c.sunnyMins).toFixed(0)} min`,
  );

  const dist: Record<number, number> = {};
  for (const r of c.results) dist[r.stops] = (dist[r.stops] ?? 0) + 1;
  const distStr = Object.keys(dist)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `${k}:${dist[k]}`)
    .join('  ');
  console.log(`   stop-count distribution (stops:count): ${distStr}`);

  const byArea = new Map<string, { n: number; ge3: number }>();
  for (const r of c.results) {
    const e = byArea.get(r.area) ?? { n: 0, ge3: 0 };
    e.n++;
    if (r.stops >= 3) e.ge3++;
    byArea.set(r.area, e);
  }
  const rows = [...byArea.entries()]
    .filter(([, v]) => v.n >= 8)
    .map(([area, v]) => ({ area, n: v.n, rate: v.ge3 / v.n }))
    .sort((a, b) => b.rate - a.rate);
  console.log('   3+-stop success by area (areas with >=8 starts):');
  console.log(
    '     TOP:    ' +
      rows.slice(0, 6).map((r) => `${r.area} ${(r.rate * 100).toFixed(0)}% (n=${r.n})`).join(' | '),
  );
  console.log(
    '     BOTTOM: ' +
      rows.slice(-6).map((r) => `${r.area} ${(r.rate * 100).toFixed(0)}% (n=${r.n})`).join(' | '),
  );
  console.log('');
}

console.log(`(done in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
