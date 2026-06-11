#!/usr/bin/env tsx
/**
 * B4 — Cloud / direct-radiation attenuation audit.
 *
 * Two paths through the transparency multiplier (scoring.ts:242–250):
 *
 *   PATH A (preferred — when real Open-Meteo data is available):
 *     score *= 0.70 + transparency * 0.30
 *     where transparency = min(1, directRadiation / (950 * sin(altitude)))
 *     applies only when `directRadiation != null` AND `sun.altitude > 1`
 *
 *   PATH B (fallback — synthetic profiles, offline, hour with no data):
 *     score *= 1 - (cloudCover / 100) * 0.30
 *
 * Both floor at ×0.70. Both ceiling at ×1.00. We check:
 *   (1) Curves are monotonic + bounded as the formulas claim
 *   (2) Boundaries: 0 / 100 cloud and 0 / 1000 W/m² direct radiation produce
 *       the documented ×1.00 / ×0.70 endpoints
 *   (3) NaN / missing-data robustness: what happens if a weather field is
 *       NaN, undefined, or the override is null mid-array?
 *   (4) Path-selection rule: directRadiation = null falls back to cloud
 *       PATH B; directRadiation defined but altitude ≤ 1° falls back too
 *
 * Run: npx tsx scripts/audit/13-clouds.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  computeSunScore,
  computeRangeScore,
  amsterdamLocalToUtc,
  AMSTERDAM_LAT,
  AMSTERDAM_LNG,
} from '../../src/engines/scoring';
import { solarPosition } from '../../src/engines/solar';
import type { Weather } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

// Use a fixed (lat, lng, date, hour, facing) where altitude is high so
// every other multiplier is constant; cloud/direct then move alone.
const DATE = '2026-06-21';
const HOUR = 13; // midsummer noon
const TERRACE = { lat: AMSTERDAM_LAT, lng: AMSTERDAM_LNG, facing: 'All' as const };

// Reference score under crystal-clear sky (0% cloud, full direct rad).
// Used as the denominator to extract just the transparency multiplier.
const utc = amsterdamLocalToUtc(DATE, HOUR);
const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
const clearSkyDirect = 950 * Math.sin((sun.altitude * Math.PI) / 180);

function clearWeather(): Weather {
  return { cloudCover: 0, temp: 20, windSpeed: 0, windDirection: 180 };
}

const clearScore = computeSunScore(TERRACE, HOUR, DATE, 'sunny', clearWeather()).score;

// ── Section 1: PATH B (cloud cover) curve ───────────────────────────────

interface CurvePoint {
  input: number;
  score: number;
  ratioToClear: number;
}

const cloudCurve: CurvePoint[] = [];
for (const cc of [0, 10, 25, 40, 50, 60, 75, 90, 100]) {
  const r = computeSunScore(
    TERRACE,
    HOUR,
    DATE,
    'sunny',
    { cloudCover: cc, temp: 20, windSpeed: 0, windDirection: 180 },
  );
  cloudCurve.push({
    input: cc,
    score: Number(r.score.toFixed(4)),
    ratioToClear: clearScore > 0 ? Number((r.score / clearScore).toFixed(4)) : NaN,
  });
}

// ── Section 2: PATH A (directRadiation) curve ───────────────────────────

const directCurve: CurvePoint[] = [];
for (const dr of [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
  const w: Weather = {
    cloudCover: 50, // ignored when directRadiation is present
    temp: 20,
    windSpeed: 0,
    windDirection: 180,
    directRadiation: dr,
  };
  const r = computeSunScore(TERRACE, HOUR, DATE, 'sunny', w);
  directCurve.push({
    input: dr,
    score: Number(r.score.toFixed(4)),
    ratioToClear: clearScore > 0 ? Number((r.score / clearScore).toFixed(4)) : NaN,
  });
}

// ── Section 3: assertions ───────────────────────────────────────────────

interface AssertResult {
  name: string;
  expected: string;
  observed: string;
  pass: boolean;
}

const asserts: AssertResult[] = [];

function add(name: string, expected: string, observed: string, pass: boolean): void {
  asserts.push({ name, expected, observed, pass });
}

// (a) Cloud=0 produces ×1.00 (relative to clear-sky baseline).
{
  const r = cloudCurve.find((p) => p.input === 0)!.ratioToClear;
  add('Cloud 0% → ratio ≈ 1.00', '1.000', r.toFixed(4), Math.abs(r - 1) < 1e-9);
}

// (b) Cloud=100 produces ×0.70 (floor).
{
  const r = cloudCurve.find((p) => p.input === 100)!.ratioToClear;
  add('Cloud 100% → ratio ≈ 0.70', '0.700', r.toFixed(4), Math.abs(r - 0.7) < 0.01);
}

// (c) Cloud monotonic non-increasing.
{
  let mono = true;
  for (let i = 1; i < cloudCurve.length; i++) {
    if (cloudCurve[i]!.score > cloudCurve[i - 1]!.score + 1e-9) {
      mono = false;
      break;
    }
  }
  add('Cloud curve monotonic non-increasing', 'monotonic', mono ? 'monotonic' : 'has rise', mono);
}

// (d) directRadiation=0 → ×0.70.
{
  const r = directCurve.find((p) => p.input === 0)!.ratioToClear;
  add('directRadiation 0 W/m² → ratio ≈ 0.70', '0.700', r.toFixed(4), Math.abs(r - 0.7) < 0.01);
}

// (e) directRadiation = clear-sky → ×1.00 (within rounding).
{
  // At altitude 61°, clearSkyDirect ≈ 950 * sin(61°) ≈ 831 W/m².
  // The curve hits saturation at ~830; we test 1000 which is above
  // saturation → must still be ×1.00.
  const r = directCurve.find((p) => p.input === 1000)!.ratioToClear;
  add(
    'directRadiation above clear-sky saturates at ratio ≈ 1.00',
    '1.000',
    r.toFixed(4),
    Math.abs(r - 1) < 1e-9,
  );
}

// (f) Direct monotonic non-decreasing.
{
  let mono = true;
  for (let i = 1; i < directCurve.length; i++) {
    if (directCurve[i]!.score < directCurve[i - 1]!.score - 1e-9) {
      mono = false;
      break;
    }
  }
  add('directRadiation curve monotonic non-decreasing', 'monotonic', mono ? 'monotonic' : 'has dip', mono);
}

// (g) NaN guard: cloudCover = NaN. Score should be finite (or 0).
{
  const w: Weather = { cloudCover: Number.NaN, temp: 20 };
  const r = computeSunScore(TERRACE, HOUR, DATE, 'sunny', w);
  const finite = Number.isFinite(r.score);
  add(
    'NaN cloudCover → score is finite',
    'score finite (no NaN)',
    finite ? `finite (${r.score})` : 'NaN',
    finite,
  );
}

// (h) NaN guard: directRadiation = NaN. directRadiation is checked with
//     != null which is TRUE for NaN, so the path runs with a NaN multiplier.
{
  const w: Weather = { cloudCover: 50, temp: 20, directRadiation: Number.NaN };
  const r = computeSunScore(TERRACE, HOUR, DATE, 'sunny', w);
  const finite = Number.isFinite(r.score);
  add(
    'NaN directRadiation → score is finite',
    'score finite (no NaN)',
    finite ? `finite (${r.score})` : 'NaN',
    finite,
  );
}

// (i) Path selection: directRadiation = null falls back to cloud cover.
{
  const w: Weather = { cloudCover: 100, temp: 20, directRadiation: undefined };
  const r = computeSunScore(TERRACE, HOUR, DATE, 'sunny', w);
  // Expected: floors at 0.70 of clear-sky-cloud-0 score.
  const ratio = clearScore > 0 ? r.score / clearScore : 0;
  add(
    'directRadiation undefined + cloud 100% → falls back to cloud path floor (0.70)',
    'ratio ≈ 0.70',
    ratio.toFixed(4),
    Math.abs(ratio - 0.7) < 0.01,
  );
}

// (j) Path selection: directRadiation defined but altitude ≤ 1°. Use a
//     dateStr just before sunrise on Dec 21 — but solarPosition is
//     computed inside computeSunScore, so we exercise a known low-altitude
//     hour: Dec 21 09:00 (sun is up but low).
{
  const lowDate = '2026-12-21';
  const lowHour = 9; // sun is just up — altitude ~3°? Let's verify
  const lowUtc = amsterdamLocalToUtc(lowDate, lowHour);
  const lowSun = solarPosition(lowUtc, AMSTERDAM_LAT, AMSTERDAM_LNG);
  const w: Weather = { cloudCover: 100, temp: 20, directRadiation: 1000 };
  const r = computeSunScore(TERRACE, lowHour, lowDate, 'sunny', w);
  add(
    `Altitude > 1° at Dec 21 09:00 (observed alt=${lowSun.altitude.toFixed(1)}°)`,
    'altitude > 1° → PATH A active',
    `altitude ${lowSun.altitude.toFixed(2)}°, score ${r.score.toFixed(4)}`,
    lowSun.altitude > 1,
  );
}

// (k) computeRangeScore robust to a sparse hourlyWeather array
//     (undefined elements between defined hours, common when Open-Meteo
//     returns gaps).
{
  const sparse: (Weather | undefined)[] = new Array(24).fill(undefined);
  sparse[13] = { cloudCover: 0, temp: 22 };
  sparse[15] = { cloudCover: 100, temp: 22 };
  // Pass as readonly Weather[] — undefined elements are valid because
  // computeRangeScore uses optional chaining (hourlyWeather?.[h]).
  const avg = computeRangeScore(
    TERRACE,
    13,
    15,
    DATE,
    'sunny',
    sparse as unknown as readonly Weather[],
  );
  const finite = Number.isFinite(avg);
  add(
    'Sparse hourlyWeather (defined hours 13 + 15, gap at 14) — range avg is finite',
    'finite, between 0 and 1',
    finite ? `${avg.toFixed(4)}` : 'NaN',
    finite && avg >= 0 && avg <= 1,
  );
}

// (l) Per-hour fallback: a single missing override falls back to the
//     synthetic profile of the same hour. Verify that score for that
//     hour matches sunny-profile baseline.
{
  const allHourly: (Weather | undefined)[] = new Array(24).fill(undefined);
  allHourly[14] = { cloudCover: 50, temp: 20 };
  const withOverride = computeSunScore(TERRACE, 14, DATE, 'sunny', allHourly[14]);
  const withoutOverride = computeSunScore(TERRACE, 14, DATE, 'sunny');
  const differ = Math.abs(withOverride.score - withoutOverride.score) > 1e-6;
  add(
    'Override with cloud=50 differs from synthetic sunny baseline at hour 14',
    'scores differ (override applied)',
    `with override=${withOverride.score.toFixed(4)}, without=${withoutOverride.score.toFixed(4)}, diff=${(withOverride.score - withoutOverride.score).toFixed(4)}`,
    differ,
  );
}

// ── Output ──────────────────────────────────────────────────────────────

const totalPass = asserts.filter((a) => a.pass).length;

writeFileSync(
  join(OUT_DIR, 'clouds.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceFile: 'src/engines/scoring.ts',
      formulaLines: '242–250',
      altitudeAtSamplePoint: Number(sun.altitude.toFixed(2)),
      clearSkyDirectAtAlt: Number(clearSkyDirect.toFixed(2)),
      cloudCurve,
      directCurve,
      asserts,
      summary: { total: asserts.length, passed: totalPass, failed: asserts.length - totalPass },
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# B4 — Cloud / direct-radiation attenuation audit');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Sample point: Jun 21 13:00 CEST, altitude ${sun.altitude.toFixed(2)}°, clear-sky direct rad ${clearSkyDirect.toFixed(0)} W/m².`);
md.push('');
md.push(`**Summary: ${totalPass}/${asserts.length} checks passed.**`);
md.push('');
md.push('## PATH B — cloud-cover curve');
md.push('');
md.push('| Cloud % | Score | Ratio to clear sky |');
md.push('| ---: | ---: | ---: |');
for (const p of cloudCurve) md.push(`| ${p.input}% | ${p.score} | ${p.ratioToClear} |`);
md.push('');
md.push('## PATH A — directRadiation curve');
md.push('');
md.push('| directRadiation W/m² | Score | Ratio to clear sky |');
md.push('| ---: | ---: | ---: |');
for (const p of directCurve) md.push(`| ${p.input} | ${p.score} | ${p.ratioToClear} |`);
md.push('');
md.push('## Assertions');
md.push('');
md.push('| Check | Expected | Observed | Pass |');
md.push('| --- | --- | --- | --- |');
for (const a of asserts) md.push(`| ${a.name} | ${a.expected} | ${a.observed} | ${a.pass ? '✅' : '❌'} |`);
md.push('');
if (asserts.some((a) => !a.pass)) {
  md.push('## Failures — evidence for FINDINGS.md');
  md.push('');
  for (const a of asserts) {
    if (a.pass) continue;
    md.push(`- **${a.name}** — expected ${a.expected}, observed ${a.observed}.`);
  }
}

writeFileSync(join(OUT_DIR, 'clouds.md'), md.join('\n'));

console.log(`clouds.md written: ${totalPass}/${asserts.length} passed.`);
