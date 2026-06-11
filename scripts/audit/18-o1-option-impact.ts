#!/usr/bin/env tsx
/**
 * O1 — Option impact quantifier.
 *
 * Re-implements the FULL scoring chain from scoring.ts (so we can vary the
 * orientation rule without touching production code) and measures the score
 * impact of three options against the CURRENT production baseline:
 *
 *   Baseline (A): orientation back-penalty floor -50% AND real shadow, both
 *                 active (today's production behaviour).
 *   Option  (B): soften the orientation back-penalty floor from -50% to -25%
 *                 (i.e. ramp to x0.75 at 180 instead of x0.50). Shadow unchanged.
 *   Option  (C): mutual exclusivity -- apply the orientation back-penalty ONLY
 *                 when shadowCoverage is ~0 (<= 0.05). Where real shadow exists,
 *                 drop the orientation back-penalty (set it to x1.0) and let the
 *                 shadow term do the work. Front bonus + 'All' unchanged.
 *
 * For each option we report, across all 930 terraces x hours 12..18 on
 * 2026-06-21 (sunny), only on hours where the sun is up:
 *   - mean score, mean absolute score delta vs baseline
 *   - count + % of terrace-hours whose score changes by > 0.01
 *   - mean delta restricted to the affected (back-penalty) hours
 *   - band-flip count vs baseline (using bands.ts thresholds)
 *
 * This is a faithful re-implementation: altitude factor, shadow (0.85*cov),
 * cloud path B (sunny synthetic), facing bonus/penalty, wind (none -- synthetic
 * sunny has no wind fields), temperature, and the MAX_RAW=1.61 normalisation.
 * Verified against computeSunScore for the baseline below.
 *
 * Output: audit-output/o1-option-impact.json
 * Run: npx tsx scripts/audit/18-o1-option-impact.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { getTreesForTerrace } from '../../src/data/trees';
import { shadowCoverage, treeShadowCoverage } from '../../src/engines/shadow';
import { solarPosition } from '../../src/engines/solar';
import {
  amsterdamLocalToUtc,
  computeSunScore,
  getWeather,
} from '../../src/engines/scoring';
import { bandForScore } from '../../src/engines/bands';
import type { Facing } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const DATE = '2026-06-21';
const HOURS = [12, 13, 14, 15, 16, 17, 18];
const MAX_RAW = 1.40 * 1.15; // = 1.61, from scoring.ts
const ALT_FULL_DEG = 25;

const FACING_AZIMUTHS: Record<Facing, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315, All: -1,
};

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function temperatureFactor(temp: number): number {
  const n = Math.max(-1, Math.min(1, (temp - 20) / 10));
  return 1 + n * 0.15;
}

type OrientMode = 'baseline' | 'optionB' | 'optionC';

/**
 * Full score re-implementation. `mode` controls the orientation back-penalty.
 * cloudCover path B only (sunny synthetic has no directRadiation), no wind
 * (synthetic profile has no wind fields), no NaN concerns (synthetic).
 */
function scoreWith(
  terrace: { lat: number; lng: number; facing: Facing; id: number },
  hour: number,
  mode: OrientMode,
  buildings: ReturnType<typeof getBuildingsForTerrace>,
  trees: ReturnType<typeof getTreesForTerrace>,
): number {
  const utc = amsterdamLocalToUtc(DATE, hour);
  const sun = solarPosition(utc, terrace.lat, terrace.lng);
  if (sun.altitude <= 0) return 0;
  const w = getWeather(hour, 'sunny');

  const altFactor = sun.altitude >= ALT_FULL_DEG ? 1.0 : Math.sqrt(sun.altitude / ALT_FULL_DEG);
  let score = altFactor;

  const bCov = shadowCoverage(terrace, buildings, sun.altitude, sun.azimuth);
  const tCov = trees.length > 0 ? treeShadowCoverage(terrace, trees, sun.altitude, sun.azimuth) : 0;
  const coverage = Math.max(bCov, tCov);
  score *= 1 - 0.85 * coverage;

  // cloud path B
  score *= 1 - (w.cloudCover / 100) * 0.30;

  // orientation
  const facingAz = FACING_AZIMUTHS[terrace.facing];
  if (facingAz >= 0) {
    const facingDiff = angularDiff(sun.azimuth, facingAz);
    if (facingDiff < 90) {
      score *= 1 + (1 - facingDiff / 90) * 0.40; // front bonus, unchanged in all modes
    } else {
      // back penalty -- this is where the options differ.
      if (mode === 'baseline') {
        score *= 1 - ((facingDiff - 90) / 90) * 0.50;
      } else if (mode === 'optionB') {
        score *= 1 - ((facingDiff - 90) / 90) * 0.25; // softened floor -25%
      } else {
        // optionC: only apply back-penalty when real shadow is ~absent.
        if (coverage <= 0.05) {
          score *= 1 - ((facingDiff - 90) / 90) * 0.50;
        }
        // else: no orientation back-penalty; shadow term already applied.
      }
    }
  } else {
    score *= 1.15; // 'All'
  }

  // wind: synthetic sunny has no wind fields -> windShelterFactor returns 1.0
  score *= temperatureFactor(w.temp);

  return Math.min(1, Math.max(0, score / MAX_RAW));
}

interface ModeStats {
  mode: string;
  meanScore: number;
  meanAbsDelta: number;        // over all sun-up terrace-hours
  changedCount: number;        // |delta| > 0.01
  changedPct: number;
  meanDeltaOnAffected: number; // mean signed delta over back-penalty hours only
  affectedCount: number;
  bandFlips: number;
  bandFlipPct: number;
  maxIncrease: number;
  exampleFlips: { name: string; facing: string; hour: number; base: number; opt: number; baseBand: string; optBand: string }[];
}

// Pre-collect baseline scores and whether each hour is a back-penalty hour.
let sunUpHours = 0;
let baselineSum = 0;
const baseScores: number[] = [];
const isBackHour: boolean[] = [];
const meta: { name: string; facing: string; hour: number }[] = [];

interface Row { tIdx: number; hour: number; }
const rows: Row[] = [];

const terr = TERRACES.map((t) => ({
  id: t.id, name: t.name, lat: t.lat, lng: t.lng, facing: t.facing as Facing,
  buildings: getBuildingsForTerrace(t.id), trees: getTreesForTerrace(t.id),
}));

// sanity: confirm our baseline matches computeSunScore (with buildings+trees).
let maxBaselineDiff = 0;
for (const t of terr.slice(0, 50)) {
  for (const hour of HOURS) {
    const mine = scoreWith(t, hour, 'baseline', t.buildings, t.trees);
    const real = computeSunScore(t, hour, DATE, 'sunny', undefined, t.buildings, t.trees).score;
    maxBaselineDiff = Math.max(maxBaselineDiff, Math.abs(mine - real));
  }
}

for (let ti = 0; ti < terr.length; ti++) {
  const t = terr[ti]!;
  for (const hour of HOURS) {
    const utc = amsterdamLocalToUtc(DATE, hour);
    const sun = solarPosition(utc, t.lat, t.lng);
    if (sun.altitude <= 0) continue;
    sunUpHours++;
    const facingAz = FACING_AZIMUTHS[t.facing];
    const back = facingAz >= 0 && angularDiff(sun.azimuth, facingAz) >= 90;
    isBackHour.push(back);
    const b = scoreWith(t, hour, 'baseline', t.buildings, t.trees);
    baseScores.push(b);
    baselineSum += b;
    meta.push({ name: t.name, facing: t.facing, hour });
    rows.push({ tIdx: ti, hour });
  }
}

function evalMode(mode: OrientMode, label: string): ModeStats {
  let sum = 0, absDeltaSum = 0, changed = 0, affectedDeltaSum = 0, affected = 0;
  let flips = 0, maxInc = 0;
  const exampleFlips: ModeStats['exampleFlips'] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const t = terr[r.tIdx]!;
    const s = scoreWith(t, r.hour, mode, t.buildings, t.trees);
    sum += s;
    const d = s - baseScores[i]!;
    absDeltaSum += Math.abs(d);
    if (Math.abs(d) > 0.01) changed++;
    if (d > maxInc) maxInc = d;
    if (isBackHour[i]) { affectedDeltaSum += d; affected++; }
    const bandBase = bandForScore(baseScores[i]!);
    const bandOpt = bandForScore(s);
    if (bandBase !== bandOpt) {
      flips++;
      if (exampleFlips.length < 12) {
        const m = meta[i]!;
        exampleFlips.push({
          name: m.name, facing: m.facing, hour: m.hour,
          base: Number(baseScores[i]!.toFixed(3)), opt: Number(s.toFixed(3)),
          baseBand: bandBase, optBand: bandOpt,
        });
      }
    }
  }
  return {
    mode: label,
    meanScore: Number((sum / rows.length).toFixed(4)),
    meanAbsDelta: Number((absDeltaSum / rows.length).toFixed(4)),
    changedCount: changed,
    changedPct: Number((100 * changed / rows.length).toFixed(2)),
    meanDeltaOnAffected: affected > 0 ? Number((affectedDeltaSum / affected).toFixed(4)) : 0,
    affectedCount: affected,
    bandFlips: flips,
    bandFlipPct: Number((100 * flips / rows.length).toFixed(2)),
    maxIncrease: Number(maxInc.toFixed(4)),
    exampleFlips,
  };
}

const baselineMean = Number((baselineSum / rows.length).toFixed(4));
const optB = evalMode('optionB', 'Option B (soften back floor -50% -> -25%)');
const optC = evalMode('optionC', 'Option C (back-penalty only when coverage<=0.05)');

const out = {
  generatedAt: new Date().toISOString(),
  config: { date: DATE, hours: HOURS, weather: 'sunny', maxRaw: MAX_RAW },
  sanity: {
    reimplVsComputeSunScoreMaxDiff: Number(maxBaselineDiff.toFixed(6)),
    note: 'Re-implementation validated against computeSunScore on first 50 terraces; max abs diff should be ~0.',
  },
  baseline: {
    label: 'Option A (leave both as-is, current production)',
    sunUpTerraceHours: sunUpHours,
    backPenaltyHours: isBackHour.filter(Boolean).length,
    meanScore: baselineMean,
  },
  optionB: optB,
  optionC: optC,
  caveat:
    'buildings.json mid-refresh: ~35/930 terraces have 0 buildings, so Option C ' +
    '(which keys off real coverage) cannot fully act on them yet; impact is a lower bound.',
};

writeFileSync(join(OUT_DIR, 'o1-option-impact.json'), JSON.stringify(out, null, 2));

console.log(
  `Baseline mean=${baselineMean} | B mean=${optB.meanScore} (changed ${optB.changedPct}%, flips ${optB.bandFlips}) ` +
  `| C mean=${optC.meanScore} (changed ${optC.changedPct}%, flips ${optC.bandFlips}) | reimplDiff=${maxBaselineDiff.toExponential(2)}`,
);
