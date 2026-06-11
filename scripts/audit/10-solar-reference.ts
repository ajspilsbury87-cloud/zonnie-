#!/usr/bin/env tsx
/**
 * B1 — Solar position correctness + DST audit.
 *
 * Produces two output files in `audit-output/`:
 *   - solar-reference.json   (machine-consumable raw matrix + per-cell diffs)
 *   - solar-reference.md     (human-readable summary + per-section verdicts)
 *
 * Three sections:
 *
 *   (1) Cross-check against `suncalc` (independent SPA implementation).
 *       Matrix: 6 dates × every 30 min from 06:00–23:00 Amsterdam local.
 *       Tolerance: |Δazimuth| ≤ 1.0°, |Δaltitude| ≤ 0.5°.
 *       ⚠ Azimuth convention mismatch — see normalisation comment below.
 *
 *   (2) DST transitions. Hours either side of 2026-03-29 02:00 CET→CEST
 *       (spring forward: 02:00 jumps to 03:00) and 2026-10-25 03:00 CEST→CET
 *       (fall back: 03:00 falls to 02:00). The engine takes local
 *       wall-clock + IANA tz; the test confirms a 10:00 local query on
 *       these days picks the right UTC instant (i.e., CET on the
 *       morning of fall-back, CEST on the morning of spring-forward).
 *
 *   (3) Sanity asserts vs published almanac numbers for Amsterdam:
 *       midsummer noon altitude, midwinter noon altitude, due-south
 *       azimuth at solar noon, etc.
 *
 * Run: npx tsx scripts/audit/10-solar-reference.ts
 *      (or `node --import tsx scripts/audit/10-solar-reference.ts`
 *       if npx isn't available)
 *
 * Reads no env vars. Side-effect-free apart from writing to
 * `audit-output/`. Exits 0 always — no failure asserts; instead each
 * check is recorded as PASS/FAIL in the markdown so the auditor sees
 * the whole landscape rather than getting blocked on the first failure.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fromZonedTime } from 'date-fns-tz';

import { solarPosition } from '../../src/engines/solar';
import { amsterdamLocalToUtc, AMSTERDAM_LAT, AMSTERDAM_LNG } from '../../src/engines/scoring';

// ── suncalc is optional — graceful skip if the install was blocked ───────
//
// The Decisions Log #3 pre-approved installing suncalc dev-only. If
// npm install was denied, this require() fails and the cross-check
// section is recorded as SKIPPED in the output rather than crashing.
type SunCalcModule = {
  getPosition: (
    date: Date,
    lat: number,
    lng: number,
  ) => { azimuth: number; altitude: number };
};

let SunCalc: SunCalcModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SunCalc = require('suncalc') as SunCalcModule;
} catch {
  SunCalc = null;
}

// ── Setup ────────────────────────────────────────────────────────────────

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const TZ = 'Europe/Amsterdam';

// 6 dates covering equinoxes + solstices + 2 arbitrary.
// All 2026 because that's the in-app default year for present-tense scoring.
const DATES = [
  '2026-03-20', // March equinox
  '2026-06-21', // June solstice (peak sun)
  '2026-09-22', // September equinox
  '2026-12-21', // December solstice (lowest sun)
  '2026-05-15', // matches existing validate-scoring DATE
  '2026-10-25', // fall-back DST day (covered separately below)
];

// 06:00 to 23:00 in 30-min steps = 35 samples per date.
const HOURS_HHMM: { hh: number; mm: number }[] = [];
for (let h = 6; h <= 23; h++) {
  HOURS_HHMM.push({ hh: h, mm: 0 });
  if (h < 23) HOURS_HHMM.push({ hh: h, mm: 30 });
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a (date, hh, mm) in Amsterdam local time to a UTC Date.
 * Centralised here so the suncalc and engine paths use the same UTC instant.
 */
function localToUtc(dateStr: string, hh: number, mm: number): Date {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return fromZonedTime(`${dateStr}T${pad(hh)}:${pad(mm)}:00`, TZ);
}

/**
 * suncalc convention: azimuth in RADIANS, measured FROM SOUTH, positive
 * westward (so 0 = due south, +PI/2 = due west, -PI/2 = due east).
 * altitude in RADIANS above horizon.
 *
 * Our convention: degrees, azimuth FROM NORTH clockwise (0=N, 90=E, 180=S,
 * 270=W). altitude in degrees.
 *
 * Conversion:
 *   ours_az_deg = (suncalc_az_rad * 180/PI + 180 + 360) % 360
 *   ours_alt_deg = suncalc_alt_rad * 180/PI
 *
 * Documenting here because reversing the +180 gives a perfect 180° false
 * positive across the entire matrix.
 */
function suncalcToOurConvention(
  raw: { azimuth: number; altitude: number },
): { azimuth: number; altitude: number } {
  const RAD = 180 / Math.PI;
  const azDeg = (raw.azimuth * RAD + 180 + 360) % 360;
  const altDeg = raw.altitude * RAD;
  return { azimuth: azDeg, altitude: altDeg };
}

/** Circular distance between two azimuths in degrees (0–180). */
function azDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── Section 1: suncalc cross-check ───────────────────────────────────────

interface CellComparison {
  date: string;
  hh: number;
  mm: number;
  ours: { azimuth: number; altitude: number };
  suncalc: { azimuth: number; altitude: number } | null;
  dAz: number | null;
  dAlt: number | null;
  withinAzTol: boolean | null;
  withinAltTol: boolean | null;
}

const AZ_TOL_DEG = 1.0;
const ALT_TOL_DEG = 0.5;

const matrix: CellComparison[] = [];
let maxDAz = 0;
let maxDAlt = 0;
let sumDAz = 0;
let sumDAlt = 0;
let nCells = 0;
let nAzOutOfTol = 0;
let nAltOutOfTol = 0;

for (const dateStr of DATES) {
  for (const { hh, mm } of HOURS_HHMM) {
    const utc = localToUtc(dateStr, hh, mm);
    const ours = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);

    let suncalcOurs: { azimuth: number; altitude: number } | null = null;
    let dAz: number | null = null;
    let dAlt: number | null = null;
    let withinAzTol: boolean | null = null;
    let withinAltTol: boolean | null = null;

    if (SunCalc) {
      const raw = SunCalc.getPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
      suncalcOurs = suncalcToOurConvention(raw);
      // Only compare azimuth when the sun is above the horizon — below
      // the horizon, azimuth is well-defined but the angle is irrelevant
      // for terrace scoring, and trig wrap can give large false deltas
      // at very low altitudes.
      if (ours.altitude > 0 && suncalcOurs.altitude > 0) {
        dAz = azDelta(ours.azimuth, suncalcOurs.azimuth);
        withinAzTol = dAz <= AZ_TOL_DEG;
        nCells++;
        sumDAz += dAz;
        if (dAz > maxDAz) maxDAz = dAz;
        if (!withinAzTol) nAzOutOfTol++;
      }
      dAlt = Math.abs(ours.altitude - suncalcOurs.altitude);
      withinAltTol = dAlt <= ALT_TOL_DEG;
      sumDAlt += dAlt;
      if (dAlt > maxDAlt) maxDAlt = dAlt;
      if (!withinAltTol) nAltOutOfTol++;
    }

    matrix.push({
      date: dateStr,
      hh,
      mm,
      ours: { azimuth: ours.azimuth, altitude: ours.altitude },
      suncalc: suncalcOurs,
      dAz,
      dAlt,
      withinAzTol,
      withinAltTol,
    });
  }
}

const meanDAz = nCells > 0 ? sumDAz / nCells : 0;
const meanDAlt = matrix.length > 0 ? sumDAlt / matrix.length : 0;

// ── Section 2: DST transition fixtures ───────────────────────────────────

interface DstCase {
  label: string;
  dateStr: string;
  hour: number;
  expectedOffsetHours: number; // expected UTC offset of the local time
  actualUtc: Date;
  actualOffsetHours: number;
  pass: boolean;
}

function utcOffsetHoursForLocal(dateStr: string, hour: number): number {
  // The offset between the local wall-clock the user typed and the UTC
  // instant the engine derives. For 10:00 local in CEST (UTC+2), the
  // engine should give a UTC instant of 08:00 → offset +2.
  const utc = amsterdamLocalToUtc(dateStr, hour);
  // Reconstruct the local wall-clock from the UTC instant for sanity.
  // Use the difference in epoch ms divided by ms-per-hour to compute
  // the implied offset.
  const localMs =
    Date.UTC(
      Number(dateStr.slice(0, 4)),
      Number(dateStr.slice(5, 7)) - 1,
      Number(dateStr.slice(8, 10)),
      hour,
      0,
      0,
    );
  return Math.round((localMs - utc.getTime()) / (60 * 60 * 1000));
}

const dstCases: DstCase[] = [];

// 2026 DST transitions in Europe/Amsterdam:
//   Spring forward: Sun Mar 29 — 02:00 CET → 03:00 CEST  (skip 02:00–03:00)
//   Fall back:      Sun Oct 25 — 03:00 CEST → 02:00 CET  (repeat 02:00–03:00)
const DST_CASES: { label: string; dateStr: string; hour: number; expect: number }[] = [
  // Day BEFORE spring forward — still CET (UTC+1)
  { label: 'Mar 28 10:00 (CET, pre-DST)', dateStr: '2026-03-28', hour: 10, expect: 1 },
  // Day OF spring forward, after the jump — CEST (UTC+2)
  { label: 'Mar 29 10:00 (CEST, day of spring-fwd)', dateStr: '2026-03-29', hour: 10, expect: 2 },
  // Day AFTER spring forward — CEST (UTC+2)
  { label: 'Mar 30 10:00 (CEST, post-DST)', dateStr: '2026-03-30', hour: 10, expect: 2 },
  // Day BEFORE fall back — still CEST (UTC+2)
  { label: 'Oct 24 10:00 (CEST, pre-DST)', dateStr: '2026-10-24', hour: 10, expect: 2 },
  // Day OF fall back, after the jump — CET (UTC+1)
  { label: 'Oct 25 10:00 (CET, day of fall-back)', dateStr: '2026-10-25', hour: 10, expect: 1 },
  // Day AFTER fall back — CET (UTC+1)
  { label: 'Oct 26 10:00 (CET, post-DST)', dateStr: '2026-10-26', hour: 10, expect: 1 },
  // Mid-winter — CET (UTC+1)
  { label: 'Jan 15 13:00 (CET deep winter)', dateStr: '2026-01-15', hour: 13, expect: 1 },
  // Mid-summer — CEST (UTC+2)
  { label: 'Jul 15 13:00 (CEST deep summer)', dateStr: '2026-07-15', hour: 13, expect: 2 },
];

for (const c of DST_CASES) {
  const actualUtc = amsterdamLocalToUtc(c.dateStr, c.hour);
  const actualOffset = utcOffsetHoursForLocal(c.dateStr, c.hour);
  dstCases.push({
    label: c.label,
    dateStr: c.dateStr,
    hour: c.hour,
    expectedOffsetHours: c.expect,
    actualUtc,
    actualOffsetHours: actualOffset,
    pass: actualOffset === c.expect,
  });
}

const allDstPass = dstCases.every((c) => c.pass);

// ── Section 3: Solar-position sanity asserts ─────────────────────────────

interface SanityCheck {
  label: string;
  expected: string;
  observed: string;
  pass: boolean;
}

const sanity: SanityCheck[] = [];

function record(label: string, expected: string, observed: string, pass: boolean): void {
  sanity.push({ label, expected, observed, pass });
}

// (a) Midsummer solar noon altitude — published almanac value for
// Amsterdam (lat 52.3676): ~61°.
{
  // Solar noon in CEST is approx 13:40 local. Sample 13:30 for stability.
  const utc = amsterdamLocalToUtc('2026-06-21', 13.5);
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = '61° ± 2°';
  const observed = `${sun.altitude.toFixed(2)}°`;
  const pass = Math.abs(sun.altitude - 61) <= 2;
  record('Midsummer solar noon altitude (Jun 21 13:30 CEST)', expected, observed, pass);
}

// (b) Midwinter solar noon altitude — almanac value ~14°.
{
  const utc = amsterdamLocalToUtc('2026-12-21', 12.5);
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = '14° ± 2°';
  const observed = `${sun.altitude.toFixed(2)}°`;
  const pass = Math.abs(sun.altitude - 14) <= 2;
  record('Midwinter solar noon altitude (Dec 21 12:30 CET)', expected, observed, pass);
}

// (c) Solar noon azimuth — sun should be due south (≈ 180°).
{
  const utc = amsterdamLocalToUtc('2026-06-21', 13.67); // ~13:40 CEST = solar noon
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = '180° ± 3° (due S)';
  const observed = `${sun.azimuth.toFixed(2)}°`;
  const pass = Math.abs(sun.azimuth - 180) <= 3;
  record('Solar noon azimuth on June solstice (~13:40 CEST)', expected, observed, pass);
}

// (d) Equinox noon altitude — should equal 90° - lat ≈ 37.6°.
{
  const utc = amsterdamLocalToUtc('2026-03-20', 13);
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = '37.6° ± 2°';
  const observed = `${sun.altitude.toFixed(2)}°`;
  const pass = Math.abs(sun.altitude - 37.6) <= 2;
  record('March equinox noon altitude (Mar 20 13:00 CET)', expected, observed, pass);
}

// (e) Midnight: sun below horizon.
{
  const utc = amsterdamLocalToUtc('2026-05-15', 0);
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = 'altitude ≤ 0°';
  const observed = `${sun.altitude.toFixed(2)}°`;
  const pass = sun.altitude <= 0;
  record('Midnight altitude (May 15 00:00 CEST)', expected, observed, pass);
}

// (f) Pre-sunrise on Dec 21 (sunrise ~08:46 CET): 06:00 should be below horizon.
{
  const utc = amsterdamLocalToUtc('2026-12-21', 6);
  const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const expected = 'altitude < 0°';
  const observed = `${sun.altitude.toFixed(2)}°`;
  const pass = sun.altitude < 0;
  record('Pre-sunrise altitude (Dec 21 06:00 CET)', expected, observed, pass);
}

const allSanityPass = sanity.every((c) => c.pass);

// ── Output: JSON ─────────────────────────────────────────────────────────

const json = {
  generatedAt: new Date().toISOString(),
  engine: {
    file: 'src/engines/solar.ts',
    function: 'solarPosition',
    azimuthConvention: 'from-north-clockwise-degrees',
  },
  reference: SunCalc
    ? {
        library: 'suncalc',
        azimuthConvention: 'from-south-westward-radians',
        normalisation: '(suncalc.azimuth_rad * 180/PI + 180 + 360) % 360',
      }
    : null,
  tolerances: { azimuthDeg: AZ_TOL_DEG, altitudeDeg: ALT_TOL_DEG },
  summary: SunCalc
    ? {
        cells: matrix.length,
        cellsCompared: nCells,
        meanDeltaAzDeg: Number(meanDAz.toFixed(4)),
        maxDeltaAzDeg: Number(maxDAz.toFixed(4)),
        meanDeltaAltDeg: Number(meanDAlt.toFixed(4)),
        maxDeltaAltDeg: Number(maxDAlt.toFixed(4)),
        cellsOverAzTol: nAzOutOfTol,
        cellsOverAltTol: nAltOutOfTol,
      }
    : null,
  dst: { allPass: allDstPass, cases: dstCases },
  sanity: { allPass: allSanityPass, checks: sanity },
  matrix,
};

writeFileSync(
  join(OUT_DIR, 'solar-reference.json'),
  JSON.stringify(json, null, 2),
);

// ── Output: Markdown ─────────────────────────────────────────────────────

const lines: string[] = [];
lines.push('# B1 — Solar Position Reference Audit');
lines.push('');
lines.push(`Generated: ${json.generatedAt}`);
lines.push('');
lines.push('Tests `src/engines/solar.ts::solarPosition` for correctness against');
lines.push('an independent reference (suncalc) and against published almanac');
lines.push('values for Amsterdam, plus DST transition handling via');
lines.push('`amsterdamLocalToUtc`.');
lines.push('');

// Section 1 summary
lines.push('## Section 1 — Cross-check vs suncalc');
lines.push('');
if (!SunCalc) {
  lines.push('**STATUS: SKIPPED.** `suncalc` is not installed.');
  lines.push('');
  lines.push('Run `npm install --save-dev suncalc @types/suncalc` then re-run');
  lines.push('this script. The DST and sanity sections below still ran.');
} else {
  const tolOk = nAzOutOfTol === 0 && nAltOutOfTol === 0;
  lines.push(`**STATUS: ${tolOk ? 'PASS' : 'FAIL — see per-cell table'}**`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Cells in matrix | ${matrix.length} |`);
  lines.push(`| Cells compared (sun above horizon both sides) | ${nCells} |`);
  lines.push(`| Mean Δazimuth | ${meanDAz.toFixed(4)}° |`);
  lines.push(`| Max Δazimuth | ${maxDAz.toFixed(4)}° |`);
  lines.push(`| Cells exceeding ±${AZ_TOL_DEG}° azimuth tolerance | ${nAzOutOfTol} |`);
  lines.push(`| Mean Δaltitude | ${meanDAlt.toFixed(4)}° |`);
  lines.push(`| Max Δaltitude | ${maxDAlt.toFixed(4)}° |`);
  lines.push(`| Cells exceeding ±${ALT_TOL_DEG}° altitude tolerance | ${nAltOutOfTol} |`);
  lines.push('');
  lines.push('Per-cell raw values are in `solar-reference.json`. Convention');
  lines.push('normalisation: suncalc returns azimuth in radians from SOUTH');
  lines.push('positive-westward; we transform `(rad * 180/π + 180 + 360) % 360`');
  lines.push('to put it in the engine\'s from-NORTH-clockwise-degrees frame');
  lines.push('before diffing. (Skipping that step produces a false 180° bug.)');
  lines.push('');
  if (nAzOutOfTol > 0 || nAltOutOfTol > 0) {
    lines.push('### Cells out of tolerance');
    lines.push('');
    lines.push('| Date | Local time | Ours az | suncalc az | Δaz | Ours alt | suncalc alt | Δalt |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const c of matrix) {
      if (!c.suncalc) continue;
      const azBad = c.withinAzTol === false;
      const altBad = c.withinAltTol === false;
      if (!azBad && !altBad) continue;
      const t = `${c.hh.toString().padStart(2, '0')}:${c.mm.toString().padStart(2, '0')}`;
      lines.push(
        `| ${c.date} | ${t} | ${c.ours.azimuth.toFixed(2)} | ${c.suncalc.azimuth.toFixed(2)} | ${c.dAz?.toFixed(3) ?? '–'} | ${c.ours.altitude.toFixed(2)} | ${c.suncalc.altitude.toFixed(2)} | ${c.dAlt?.toFixed(3) ?? '–'} |`,
      );
    }
    lines.push('');
  }
}
lines.push('');

// Section 2
lines.push('## Section 2 — DST transition handling');
lines.push('');
lines.push(`**STATUS: ${allDstPass ? 'PASS' : 'FAIL'}**`);
lines.push('');
lines.push('Exercises `amsterdamLocalToUtc` either side of the 2026 European');
lines.push('DST transitions. For each (local date, local hour) pair, the');
lines.push('engine should produce a UTC instant whose offset matches the');
lines.push('expected zone (CET = UTC+1, CEST = UTC+2).');
lines.push('');
lines.push('| Local date / hour | Expected offset | Engine UTC | Actual offset | Pass |');
lines.push('| --- | --- | --- | --- | --- |');
for (const c of dstCases) {
  lines.push(
    `| ${c.label} | UTC+${c.expectedOffsetHours} | ${c.actualUtc.toISOString()} | UTC+${c.actualOffsetHours} | ${c.pass ? '✅' : '❌'} |`,
  );
}
lines.push('');

// Section 3
lines.push('## Section 3 — Almanac sanity asserts');
lines.push('');
lines.push(`**STATUS: ${allSanityPass ? 'PASS' : 'FAIL'}**`);
lines.push('');
lines.push('Published almanac values for Amsterdam (lat 52.3676), used as');
lines.push('coarse but independent ground-truth that doesn\'t require');
lines.push('suncalc.');
lines.push('');
lines.push('| Check | Expected | Observed | Pass |');
lines.push('| --- | --- | --- | --- |');
for (const c of sanity) {
  lines.push(`| ${c.label} | ${c.expected} | ${c.observed} | ${c.pass ? '✅' : '❌'} |`);
}
lines.push('');

// Verdict
lines.push('## Verdict');
lines.push('');
const haveSuncalc = SunCalc != null;
const suncalcOk = haveSuncalc && nAzOutOfTol === 0 && nAltOutOfTol === 0;
if (!haveSuncalc) {
  lines.push('- ⚠ Cross-check section was SKIPPED (suncalc not installed).');
}
if (haveSuncalc) {
  lines.push(`- ${suncalcOk ? '✅' : '❌'} Cross-check vs suncalc.`);
}
lines.push(`- ${allDstPass ? '✅' : '❌'} DST transition handling.`);
lines.push(`- ${allSanityPass ? '✅' : '❌'} Almanac sanity asserts.`);
lines.push('');
const overall = (
  (!haveSuncalc || suncalcOk) &&
  allDstPass &&
  allSanityPass
);
lines.push(`**Overall: ${overall ? 'PASS' : 'FAIL'}.**`);
lines.push('');
if (!overall) {
  lines.push('Failing rows above are direct evidence for FINDINGS.md.');
} else {
  lines.push('Solar position + timezone handling are evidence-validated.');
  lines.push('The classic "1–2h shifted score" timezone-bug risk is unlikely');
  lines.push('to be the root cause of any user-reported score complaints.');
}

writeFileSync(
  join(OUT_DIR, 'solar-reference.md'),
  lines.join('\n'),
);

// Brief stdout signal so the auditor knows it ran
console.log(
  `solar-reference.md written: suncalc=${haveSuncalc ? 'OK' : 'SKIPPED'}, dst=${allDstPass ? 'PASS' : 'FAIL'}, sanity=${allSanityPass ? 'PASS' : 'FAIL'}`,
);
