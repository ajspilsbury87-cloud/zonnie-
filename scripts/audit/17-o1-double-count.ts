#!/usr/bin/env tsx
/**
 * O1 — Double-count analysis: orientation back-penalty vs real building shadow.
 *
 * Background
 * ----------
 * scoring.ts applies an ORIENTATION modifier based on how far the sun is from
 * the direction the terrace faces (facingDiff):
 *   front (facingDiff < 90): score *= 1 + (1 - facingDiff/90) * 0.40   (bonus)
 *   back  (facingDiff >= 90): score *= 1 - (facingDiff-90)/90 * 0.50    (penalty)
 *   'All' facing:             score *= 1.15
 *
 * The BACK penalty (sun behind the terrace) was historically a stand-in for the
 * terrace's OWN host-building shadow: if the sun is behind you, the building you
 * sit against blocks it. Now that real `shadowCoverage` is wired into scoring,
 * the SAME host building can be penalised TWICE: once by the orientation back-
 * penalty, once by the real shadow ray-cast.
 *
 * This script QUANTIFIES that overlap. It changes NO production code.
 *
 * A terrace-hour is a TRUE DOUBLE-COUNT when ALL of:
 *   1. orientation multiplier < 1.0   (sun is behind the terrace)
 *   2. shadowCoverage > 0.2           (a real building is blocking the sun)
 *   3. the dominant (max-coverage) blocking building's BEARING from the terrace
 *      is within +/-60 deg of the "behind" direction (opposite the facing
 *      azimuth) -- i.e. it is the same host building the orientation penalty
 *      already modelled.
 *
 * Config: all 930 terraces, hours 12..18, date 2026-06-21, sunny profile.
 *
 * CAVEAT: buildings.json is mid-refresh. ~35 newer terraces currently have 0
 * buildings, so their shadowCoverage is 0 and they can never be flagged as a
 * double-count until the fetch lands. Numbers below are a lower bound on the
 * double-count rate for that reason.
 *
 * Outputs:
 *   audit-output/o1-double-count.json
 *   (markdown O1-options.md is written by a companion step using this JSON)
 *
 * Run: npx tsx scripts/audit/17-o1-double-count.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { shadowCoverage } from '../../src/engines/shadow';
import { solarPosition } from '../../src/engines/solar';
import { amsterdamLocalToUtc } from '../../src/engines/scoring';
import type { Building, Facing } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const DATE = '2026-06-21';
const HOURS = [12, 13, 14, 15, 16, 17, 18];
const SHADOW_K = 0.85;            // matches scoring.ts: score *= 1 - 0.85*coverage
const COVERAGE_THRESHOLD = 0.2;   // "a real building is blocking the sun"
const BEHIND_TOLERANCE = 60;      // +/- deg around the behind direction
const METRES_PER_DEG_LNG = 111320 * Math.cos(52.3676 * Math.PI / 180);
const METRES_PER_DEG_LAT = 110540;

// Facing azimuths -- copy of scoring.ts FACING_AZIMUTHS (All = -1 sentinel).
const FACING_AZIMUTHS: Record<Facing, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315, All: -1,
};

/** Minimum circular angular distance between two bearings (0..180). */
function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Replicate the orientation multiplier from scoring.ts EXACTLY.
 * Returns 1.15 for 'All', the front bonus, or the back penalty.
 */
function orientationMultiplier(facing: Facing, sunAzimuth: number): number {
  const facingAz = FACING_AZIMUTHS[facing];
  if (facingAz < 0) return 1.15; // 'All'
  const facingDiff = angularDiff(sunAzimuth, facingAz);
  if (facingDiff < 90) {
    return 1 + (1 - facingDiff / 90) * 0.40;
  }
  return 1 - ((facingDiff - 90) / 90) * 0.50;
}

/**
 * Bearing (deg, 0=N clockwise) from terrace to a building's representative
 * point. For poly buildings we use the centroid of the hull vertices so the
 * "where is the mass" question matches what the eye sees; falls back to the
 * stored lat/lng centroid otherwise.
 */
function buildingBearing(
  terrace: { lat: number; lng: number },
  b: Building,
): number {
  let blat = b.lat, blng = b.lng;
  if (b.poly && b.poly.length > 0) {
    let slat = 0, slng = 0;
    for (const [la, ln] of b.poly) { slat += la; slng += ln; }
    blat = slat / b.poly.length;
    blng = slng / b.poly.length;
  }
  const dx = (blng - terrace.lng) * METRES_PER_DEG_LNG;
  const dy = (blat - terrace.lat) * METRES_PER_DEG_LAT;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

interface FlaggedHour {
  id: number;
  name: string;
  area: string;
  facing: Facing;
  hour: number;
  sunAz: number;
  sunAlt: number;
  orientMult: number;       // < 1.0 means back-penalty active
  coverage: number;
  behindDir: number;        // opposite of facing azimuth
  dominantBearing: number;  // bearing of max-coverage building
  bearingVsBehind: number;  // angular diff between the two
  trueDoubleCount: boolean;
  combinedAttenuation: number; // orientMult * (1 - K*coverage)
}

let totalTerraceHours = 0;
let backPenaltyActive = 0;            // orientation mult < 1.0
let shadowActive = 0;                 // coverage > threshold
let bothActive = 0;                   // orient<1 AND coverage>threshold
let trueDoubleCount = 0;              // both + bearing aligns with behind
const flagged: FlaggedHour[] = [];
const combinedAtten: number[] = [];   // for distribution (only when sun up)

for (const t of TERRACES) {
  const buildings = getBuildingsForTerrace(t.id);
  for (const hour of HOURS) {
    const utc = amsterdamLocalToUtc(DATE, hour);
    const sun = solarPosition(utc, t.lat, t.lng);
    if (sun.altitude <= 0) continue;
    totalTerraceHours++;

    const orientMult = orientationMultiplier(t.facing, sun.azimuth);
    const cov = shadowCoverage(t, buildings, sun.altitude, sun.azimuth);

    const orientIsBack = orientMult < 1.0;
    const shadowOn = cov > COVERAGE_THRESHOLD;
    if (orientIsBack) backPenaltyActive++;
    if (shadowOn) shadowActive++;

    const combined = orientMult * (1 - SHADOW_K * cov);
    combinedAtten.push(combined);

    if (!(orientIsBack && shadowOn)) continue;
    bothActive++;

    // Find the dominant (max single-building coverage) blocking building, then
    // its bearing relative to the terrace.
    let domCov = 0, domBearing = -1;
    for (const b of buildings) {
      const single = shadowCoverage(t, [b], sun.altitude, sun.azimuth);
      if (single > domCov) { domCov = single; domBearing = buildingBearing(t, b); }
    }

    const facingAz = FACING_AZIMUTHS[t.facing];
    // "Behind" = opposite the direction the terrace opens toward.
    const behindDir = facingAz < 0 ? -1 : (facingAz + 180) % 360;
    const bearingVsBehind =
      behindDir < 0 || domBearing < 0 ? 999 : angularDiff(domBearing, behindDir);
    const isTrue =
      behindDir >= 0 && domBearing >= 0 && bearingVsBehind <= BEHIND_TOLERANCE;
    if (isTrue) trueDoubleCount++;

    flagged.push({
      id: t.id, name: t.name, area: t.area, facing: t.facing, hour,
      sunAz: Number(sun.azimuth.toFixed(1)),
      sunAlt: Number(sun.altitude.toFixed(1)),
      orientMult: Number(orientMult.toFixed(4)),
      coverage: Number(cov.toFixed(4)),
      behindDir: Number(behindDir.toFixed(1)),
      dominantBearing: Number(domBearing.toFixed(1)),
      bearingVsBehind: Number(bearingVsBehind.toFixed(1)),
      trueDoubleCount: isTrue,
      combinedAttenuation: Number(combined.toFixed(4)),
    });
  }
}

// Distribution of combined attenuation (orient x shadow), 0.05 buckets.
function histo(values: number[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = 0; i < 30; i++) buckets[(i * 0.05).toFixed(2)] = 0;
  for (const v of values) {
    const idx = Math.min(29, Math.max(0, Math.floor(v / 0.05)));
    buckets[(idx * 0.05).toFixed(2)]++;
  }
  return buckets;
}

// 15 worst-stacked terrace-hours = smallest combined attenuation among
// the TRUE double-counts (the genuine "penalised twice for the same building").
const worstStacked = flagged
  .filter((f) => f.trueDoubleCount)
  .sort((a, b) => a.combinedAttenuation - b.combinedAttenuation)
  .slice(0, 15);

// Also surface worst among ALL both-active (for context).
const worstBothActive = [...flagged]
  .sort((a, b) => a.combinedAttenuation - b.combinedAttenuation)
  .slice(0, 15);

const out = {
  generatedAt: new Date().toISOString(),
  config: {
    date: DATE, hours: HOURS, weather: 'sunny', shadowK: SHADOW_K,
    coverageThreshold: COVERAGE_THRESHOLD, behindToleranceDeg: BEHIND_TOLERANCE,
  },
  caveat:
    'buildings.json mid-refresh: ~35/930 terraces currently have 0 buildings ' +
    '(shadowCoverage forced to 0), so the true-double-count rate is a LOWER BOUND.',
  totals: {
    totalTerraces: TERRACES.length,
    totalTerraceHours,
    backPenaltyActive,
    backPenaltyActivePct: Number((100 * backPenaltyActive / totalTerraceHours).toFixed(2)),
    shadowActive,
    shadowActivePct: Number((100 * shadowActive / totalTerraceHours).toFixed(2)),
    bothActive,
    bothActivePct: Number((100 * bothActive / totalTerraceHours).toFixed(2)),
    trueDoubleCount,
    trueDoubleCountPct: Number((100 * trueDoubleCount / totalTerraceHours).toFixed(2)),
    trueDoubleAsShareOfBoth: bothActive > 0
      ? Number((100 * trueDoubleCount / bothActive).toFixed(2)) : 0,
  },
  combinedAttenuationHistogram: histo(combinedAtten),
  worstStackedTrueDoubleCounts: worstStacked,
  worstBothActive,
  allFlagged: flagged,
};

writeFileSync(join(OUT_DIR, 'o1-double-count.json'), JSON.stringify(out, null, 2));

console.log(
  `O1: terraceHours=${totalTerraceHours} both=${bothActive} (${out.totals.bothActivePct}%) ` +
  `trueDouble=${trueDoubleCount} (${out.totals.trueDoubleCountPct}%)`,
);
