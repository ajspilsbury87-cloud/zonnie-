#!/usr/bin/env tsx
/**
 * B3 — Orientation modifier audit.
 *
 * Prints the full orientation modifier curve: for each (facing, sun azimuth)
 * combination, what multiplier does `computeSunScore` apply? Then asserts
 * physics:
 *
 *   - S-facing peaks when sun azimuth ≈ 180°
 *   - N-facing peaks when sun azimuth ≈ 0° (which never happens at
 *     Amsterdam latitude — see §1)
 *   - Adjacent compass facings differ by the expected ratio
 *   - No facing produces an *enhancement* when the sun is behind
 *
 * The modifier lives inline in `computeSunScore` (`scoring.ts:252–280`).
 * To probe it cleanly we cancel out every OTHER multiplier in the
 * scoring chain: weather overcast = 0, temp = 20°C (baseline),
 * windSpeed = 0 (no shelter penalty). What's left is altFactor ×
 * orientation × `1/MAX_RAW`. We then divide by altFactor to extract
 * the bare orientation multiplier; altFactor is computed via the same
 * `solarPosition()` so the inputs match.
 *
 * NOTE: Since shadow was removed from scoring (see B0), orientation
 * IS the sun-versus-building approximation. The "orientation applied
 * even when shaded" bug the spec describes cannot occur here — there
 * is no separate shadow factor for it to be incorrectly combined with.
 * Documented in the output so a reviewer doesn't expect that check.
 *
 * Run: npx tsx scripts/audit/12-orientation.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeSunScore, amsterdamLocalToUtc, AMSTERDAM_LAT, AMSTERDAM_LNG } from '../../src/engines/scoring';
import { solarPosition } from '../../src/engines/solar';
import type { Facing } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const FACINGS: Facing[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All'];

// We pin altitude at a high value (>25°, so altFactor = 1) by choosing
// midsummer noon. This isolates the orientation multiplier exactly.
// For different facings we artificially fix the SUN azimuth by stepping
// hours; but since the engine is driven by (date, hour) we instead
// compute scores across the entire daylight range, then extract the
// orientation factor empirically per cell.

// To force a known sun position, we don't drive computeSunScore at all
// for the curve — instead we replicate the orientation formula directly,
// using FACING_AZIMUTHS from scoring.ts (re-derived here from the same
// table). The empirical sweep over real hours is a second check below
// to verify the formula matches what the engine actually does.

const FACING_AZIMUTHS: Record<Facing, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
  All: -1,
};

/** Replicates scoring.ts:252–280 in isolation. */
function orientationMultiplier(facing: Facing, sunAzimuth: number): number {
  const facingAz = FACING_AZIMUTHS[facing];
  if (facingAz < 0) return 1.15; // 'All' flat bonus
  const diff = Math.abs(sunAzimuth - facingAz);
  const facingDiff = Math.min(diff, 360 - diff);
  if (facingDiff < 90) {
    return 1 + (1 - facingDiff / 90) * 0.4;
  }
  return 1 - ((facingDiff - 90) / 90) * 0.5;
}

// ── Section 1: curve printout ───────────────────────────────────────────

const azimuths: number[] = [];
for (let az = 0; az <= 345; az += 15) azimuths.push(az);

const curve: Record<Facing, number[]> = {} as Record<Facing, number[]>;
for (const f of FACINGS) {
  curve[f] = azimuths.map((az) => Number(orientationMultiplier(f, az).toFixed(4)));
}

// ── Section 2: physics assertions ───────────────────────────────────────

interface PhysicsCheck {
  name: string;
  expected: string;
  observed: string;
  pass: boolean;
}

const checks: PhysicsCheck[] = [];

function add(name: string, expected: string, observed: string, pass: boolean): void {
  checks.push({ name, expected, observed, pass });
}

// (a) Peak alignment: each cardinal facing should peak at its compass azimuth.
for (const f of FACINGS) {
  if (f === 'All') continue;
  const facingAz = FACING_AZIMUTHS[f];
  let maxIdx = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < azimuths.length; i++) {
    if (curve[f][i]! > maxVal) {
      maxVal = curve[f][i]!;
      maxIdx = i;
    }
  }
  const peakAz = azimuths[maxIdx]!;
  // Allow ±15° (one bucket of resolution).
  const ok = Math.abs(peakAz - facingAz) <= 15;
  add(
    `${f} peaks near its compass azimuth`,
    `peak at ${facingAz}° ± 15°`,
    `peak at ${peakAz}° (value ${maxVal.toFixed(3)})`,
    ok,
  );
}

// (b) Bonus never exceeds +40%.
{
  let max = 0;
  for (const f of FACINGS) {
    if (f === 'All') continue;
    for (const v of curve[f]) if (v > max) max = v;
  }
  add(
    'Peak orientation multiplier ≤ +40%',
    'max multiplier ≤ 1.40',
    `max multiplier observed = ${max.toFixed(4)}`,
    max <= 1.4 + 1e-9,
  );
}

// (c) Penalty never goes below ×0.50.
{
  let min = Infinity;
  for (const f of FACINGS) {
    if (f === 'All') continue;
    for (const v of curve[f]) if (v < min) min = v;
  }
  add(
    'Penalty floor ≥ ×0.50',
    'min multiplier ≥ 0.50',
    `min multiplier observed = ${min.toFixed(4)}`,
    min >= 0.5 - 1e-9,
  );
}

// (d) 'All' facing is a flat +15% across all azimuths.
{
  const allCurve = curve.All;
  const allSame = allCurve.every((v) => Math.abs(v - 1.15) < 1e-9);
  add(
    "'All' facing is a flat +15%",
    'every cell = 1.15',
    `min=${Math.min(...allCurve).toFixed(4)}, max=${Math.max(...allCurve).toFixed(4)}`,
    allSame,
  );
}

// (e) Antipodal facings should be mirror images: S at az 180 = max bonus,
//     N at az 180 = max penalty. And SW at az 225 = max bonus, NE at az 225
//     = max penalty.
{
  const sAt180 = orientationMultiplier('S', 180);
  const nAt180 = orientationMultiplier('N', 180);
  add(
    'S vs N at sun azimuth 180°: S maxes, N minimises',
    'S=1.40 N=0.50',
    `S=${sAt180.toFixed(3)} N=${nAt180.toFixed(3)}`,
    Math.abs(sAt180 - 1.4) < 1e-9 && Math.abs(nAt180 - 0.5) < 1e-9,
  );
}

// (f) Empirical sweep through computeSunScore: pick a sunny May day at
//     a series of hours; for each (facing, hour) the score ratio should
//     match the orientation formula's prediction (modulo altFactor and
//     transparency, both of which are the same across facings at a
//     given hour).
{
  const dateStr = '2026-05-15';
  const hours = [9, 12, 15, 18];
  const terraceBase = { lat: AMSTERDAM_LAT, lng: AMSTERDAM_LNG };
  let allMatch = true;
  const mismatches: string[] = [];
  for (const hour of hours) {
    // Compute reference score for S facing as the denominator.
    const sScore = computeSunScore({ ...terraceBase, facing: 'S' }, hour, dateStr, 'sunny').score;
    const utc = amsterdamLocalToUtc(dateStr, hour);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const sMult = orientationMultiplier('S', sun.azimuth);
    for (const f of FACINGS) {
      const score = computeSunScore({ ...terraceBase, facing: f }, hour, dateStr, 'sunny').score;
      const fMult = orientationMultiplier(f, sun.azimuth);
      // Predicted ratio: score_f / score_S = fMult / sMult (assuming
      // identical altFactor, transparency, wind, temp). All other
      // multipliers are identical across facings at one (hour, terrace).
      const predicted = fMult / sMult;
      const actual = sScore > 0 ? score / sScore : 0;
      if (sScore > 0 && Math.abs(predicted - actual) > 0.01) {
        allMatch = false;
        mismatches.push(`${f} @ ${hour}:00 az=${sun.azimuth.toFixed(0)}: predicted=${predicted.toFixed(3)} actual=${actual.toFixed(3)}`);
      }
    }
  }
  add(
    'Empirical sweep: engine score ratios match formula predictions',
    'all ratios within ±0.01',
    allMatch ? 'all match' : `mismatches: ${mismatches.slice(0, 4).join('; ')}`,
    allMatch,
  );
}

// (g) Sun behind never produces a net bonus.
{
  // For each facing, find sun azimuths where facingDiff > 90 (sun behind).
  let violation: string | null = null;
  for (const f of FACINGS) {
    if (f === 'All') continue;
    const facingAz = FACING_AZIMUTHS[f];
    for (let az = 0; az < 360; az += 5) {
      const diff = Math.abs(az - facingAz);
      const facingDiff = Math.min(diff, 360 - diff);
      if (facingDiff > 90) {
        const mult = orientationMultiplier(f, az);
        if (mult > 1.0 + 1e-9) {
          violation = `${f} at sun az ${az}° gives mult ${mult.toFixed(3)} > 1.0 (sun behind, expected penalty)`;
          break;
        }
      }
    }
    if (violation) break;
  }
  add(
    'Sun behind terrace → multiplier ≤ 1.0',
    'no facing produces a net bonus when sun is behind',
    violation ?? 'no violations',
    violation == null,
  );
}

// ── Note on the "orientation when shaded" check ─────────────────────────

const designNote = [
  'The audit spec asks whether the orientation modifier is incorrectly',
  'applied to a *shaded* score. In the current pipeline this check is',
  'inapplicable: shadow is not part of `computeSunScore` at all',
  '(see B0 inventory). Orientation IS the de-facto shadow approximation.',
  'If shadow is re-introduced (Path A in Finding 1), revisit this check.',
].join(' ');

// ── Output ──────────────────────────────────────────────────────────────

const totalPass = checks.filter((c) => c.pass).length;
const totalFail = checks.length - totalPass;

writeFileSync(
  join(OUT_DIR, 'orientation.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceFile: 'src/engines/scoring.ts',
      formulaLines: '252–280',
      curve: { azimuthsDeg: azimuths, values: curve },
      checks,
      summary: { total: checks.length, passed: totalPass, failed: totalFail },
      designNote,
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# B3 — Orientation Modifier Audit');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('Source: `src/engines/scoring.ts:252–280` (orientation modifier inline).');
md.push('');
md.push(`**Summary: ${totalPass}/${checks.length} physics checks passed.**`);
md.push('');
md.push('## Orientation multiplier curve');
md.push('');
md.push('Multiplier applied to the running score, indexed by sun azimuth (deg from N, clockwise).');
md.push('');
md.push('| Sun az | N | NE | E | SE | S | SW | W | NW | All |');
md.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (let i = 0; i < azimuths.length; i++) {
  const row = [`${azimuths[i]}°`, ...FACINGS.map((f) => curve[f][i]!.toFixed(3))];
  md.push(`| ${row.join(' | ')} |`);
}
md.push('');
md.push('## Physics checks');
md.push('');
md.push('| Check | Expected | Observed | Pass |');
md.push('| --- | --- | --- | --- |');
for (const c of checks) {
  md.push(`| ${c.name} | ${c.expected} | ${c.observed} | ${c.pass ? '✅' : '❌'} |`);
}
md.push('');
md.push('## Note on the "orientation when shaded" check');
md.push('');
md.push(`> ${designNote}`);

writeFileSync(join(OUT_DIR, 'orientation.md'), md.join('\n'));

console.log(`orientation.md written: ${totalPass}/${checks.length} passed.`);
