#!/usr/bin/env tsx
/**
 * Path A perf microbenchmark — feeds a measured cost into FINDINGS.md
 * Finding 1's Path A bullet ("wire shadowCoverage back into scoring").
 *
 * Method:
 *   1. Pick a real terrace with non-empty `getBuildingsForTerrace()` so
 *      the shadow check exercises a representative building set
 *      (typically ~30 buildings within 200 m, per src/data/buildings.ts:31).
 *   2. Compute sun position at a peak hour.
 *   3. Warm up the JIT with 1,000 calls (discarded), then time 10,000
 *      `shadowCoverage()` calls.
 *   4. Report mean cost per call, plus extrapolated cost for the two
 *      relevant call-frequencies:
 *        - 947 calls = one full map-pin score refresh at one hour
 *        - 947 × 24 = 22,728 calls = full day timeline for one user view
 *
 * Side note: this measures the engine in isolation, not the React Native
 * runtime. On-device JS engines (Hermes) are slower than node V8 by a
 * non-trivial factor — multiply by ~2–4× for a realistic device estimate.
 * The number quoted in FINDINGS.md should be the node measurement with
 * that caveat written explicitly.
 *
 * Read-only. Writes audit-output/path-a-perf.{json,md}.
 *
 * Run: npx tsx scripts/audit/16-shadow-perf.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { shadowCoverage } from '../../src/engines/shadow';
import { solarPosition } from '../../src/engines/solar';
import { amsterdamLocalToUtc } from '../../src/engines/scoring';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const ITERATIONS = 10_000;
const WARMUP = 1000;

// ── Find a representative terrace ────────────────────────────────────────

let chosen: { id: number; name: string; lat: number; lng: number; buildings: ReturnType<typeof getBuildingsForTerrace>; nWithPoly: number } | null = null;
for (const t of TERRACES) {
  const b = getBuildingsForTerrace(t.id);
  const polyCount = b.filter((x) => x.poly && x.poly.length >= 3).length;
  // Prefer a terrace with at least 15 buildings, mostly with poly — that's
  // the realistic shape on a 3D-BAG-covered location.
  if (b.length >= 15 && polyCount >= 10) {
    chosen = { id: t.id, name: t.name, lat: t.lat, lng: t.lng, buildings: b, nWithPoly: polyCount };
    break;
  }
}
if (!chosen) {
  // Fallback: any terrace with any buildings
  for (const t of TERRACES) {
    const b = getBuildingsForTerrace(t.id);
    if (b.length > 0) {
      const polyCount = b.filter((x) => x.poly && x.poly.length >= 3).length;
      chosen = { id: t.id, name: t.name, lat: t.lat, lng: t.lng, buildings: b, nWithPoly: polyCount };
      break;
    }
  }
}
if (!chosen) {
  console.error('No terrace with any nearby buildings found — cannot benchmark.');
  process.exit(1);
}

const c = chosen;

// ── Sun position fixed at peak hour ──────────────────────────────────────

const utc = amsterdamLocalToUtc('2026-06-21', 14);
const sun = solarPosition(utc, c.lat, c.lng);

// ── Warmup ───────────────────────────────────────────────────────────────

for (let i = 0; i < WARMUP; i++) {
  shadowCoverage({ lat: c.lat, lng: c.lng }, c.buildings, sun.altitude, sun.azimuth);
}

// ── Timed run ────────────────────────────────────────────────────────────

const t0 = performance.now();
let sink = 0;
for (let i = 0; i < ITERATIONS; i++) {
  sink += shadowCoverage({ lat: c.lat, lng: c.lng }, c.buildings, sun.altitude, sun.azimuth);
}
const t1 = performance.now();
const totalMs = t1 - t0;
const meanMs = totalMs / ITERATIONS;
const meanMicros = meanMs * 1000;

// Sink to prevent JIT elimination
if (!Number.isFinite(sink)) throw new Error('sink unfinite — JIT elim likely');

// ── Extrapolations ──────────────────────────────────────────────────────

const N_TERRACES = TERRACES.length;
const N_HOURS = 24;

const mapRefreshMs = meanMs * N_TERRACES;
const dayTimelineMs = meanMs * N_TERRACES * N_HOURS;

// ── Output ──────────────────────────────────────────────────────────────

writeFileSync(
  join(OUT_DIR, 'path-a-perf.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      env: { node: process.versions.node, platform: process.platform },
      sampleTerrace: { id: c.id, name: c.name, nearbyBuildings: c.buildings.length, withPoly: c.nWithPoly },
      sunPosition: { altitudeDeg: Number(sun.altitude.toFixed(2)), azimuthDeg: Number(sun.azimuth.toFixed(2)) },
      iterations: ITERATIONS,
      warmup: WARMUP,
      totalMs: Number(totalMs.toFixed(3)),
      meanMsPerCall: Number(meanMs.toFixed(5)),
      meanMicrosPerCall: Number(meanMicros.toFixed(3)),
      extrapolation: {
        mapRefresh: { callCount: N_TERRACES, totalMs: Number(mapRefreshMs.toFixed(2)) },
        dayTimeline: { callCount: N_TERRACES * N_HOURS, totalMs: Number(dayTimelineMs.toFixed(2)) },
      },
      caveat:
        'Node V8 measurement. On-device Hermes engine is ~2–4× slower; multiply for realistic mobile budget. No memoisation is in place; numbers represent cold compute.',
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# Path A perf microbenchmark — `shadowCoverage()`');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Node ${process.versions.node} on ${process.platform}`);
md.push('');
md.push('## Sample fixture');
md.push('');
md.push(`- Terrace: \`#${c.id} ${c.name}\``);
md.push(`- Nearby buildings: ${c.buildings.length} (${c.nWithPoly} with \`poly\` — real 3D BAG)`);
md.push(`- Sun position: altitude ${sun.altitude.toFixed(2)}°, azimuth ${sun.azimuth.toFixed(2)}°`);
md.push('');
md.push('## Result');
md.push('');
md.push(`- ${ITERATIONS.toLocaleString()} iterations after ${WARMUP.toLocaleString()}-call JIT warmup`);
md.push(`- Total wall-clock: **${totalMs.toFixed(2)} ms**`);
md.push(`- Mean per call: **${meanMicros.toFixed(2)} μs** (${meanMs.toFixed(5)} ms)`);
md.push('');
md.push('## Extrapolation');
md.push('');
md.push('| Scenario | Calls | Total ms |');
md.push('| --- | ---: | ---: |');
md.push(`| One single-hour map refresh (all terraces) | ${N_TERRACES} | ${mapRefreshMs.toFixed(2)} |`);
md.push(`| Full-day timeline for one user view | ${N_TERRACES * N_HOURS} | ${dayTimelineMs.toFixed(2)} |`);
md.push('');
md.push('## Caveats');
md.push('');
md.push('1. **Engine-only measurement.** This times `shadowCoverage()` alone, not the full `computeSunScore()` call. Wrapping into scoring would add `shadowCoverage` cost ON TOP of existing scoring cost.');
md.push('2. **Node V8 vs Hermes.** Production runs on Hermes (React Native\'s JS engine), which is 2–4× slower than node V8 for compute-heavy code. Multiply by 3× for a rough device estimate.');
md.push('3. **No memoisation.** Numbers are cold cost. A cache keyed by (terraceId, dateStr, hour) would amortise across renders. The cache would need invalidation when the time scrubber moves, but pin-score refresh on map pan would hit it.');
md.push('4. **Building-set size varies.** The sample terrace has ' + c.buildings.length + ' nearby buildings; terraces with smaller sets are faster (the algorithm short-circuits via MAX_DISTANCE_M and HEIGHT_RATIO_FLOOR).');

writeFileSync(join(OUT_DIR, 'path-a-perf.md'), md.join('\n'));

console.log(`path-a-perf.md written: mean=${meanMicros.toFixed(2)} μs/call, mapRefresh=${mapRefreshMs.toFixed(1)} ms, dayTimeline=${dayTimelineMs.toFixed(1)} ms.`);
