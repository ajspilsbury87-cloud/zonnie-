#!/usr/bin/env tsx
/**
 * B2a — Shadow engine synthetic fixtures.
 *
 * Validates `src/engines/shadow.ts::shadowCoverage` and `isInShadow`
 * against five synthetic fixtures whose expected outcome is dictated by
 * basic solar geometry. The shadow engine is user-facing — `ShadowOverlay`
 * renders its sister function `computeShadowPolygon` on the map for Pro
 * users when zoomed in. Correctness here is therefore not academic.
 *
 * Convention reminder: building entries are `{ lat, lng, height, width? }`,
 * azimuths are degrees from NORTH clockwise (0=N, 90=E, 180=S, 270=W).
 *
 * Fixtures use a fake terrace at (0, 0) and synthesise buildings at
 * known bearings + distances by inverting the lat/lng → metres formulae
 * the shadow engine uses internally.
 *
 * Writes:
 *   audit-output/shadow-fixtures.json   (raw per-case results)
 *   audit-output/shadow-fixtures.md     (PASS/FAIL summary)
 *
 * Run: npx tsx scripts/audit/11-shadow-cases.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { shadowCoverage, isInShadow } from '../../src/engines/shadow';
import { solarPosition } from '../../src/engines/solar';
import { amsterdamLocalToUtc, AMSTERDAM_LAT, AMSTERDAM_LNG } from '../../src/engines/scoring';
import type { Building } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

// ── Geometry helpers ─────────────────────────────────────────────────────
//
// shadow.ts internally uses:
//   METRES_PER_DEG_LNG = 111320 * cos(52.3676° in rad)
//   METRES_PER_DEG_LAT = 110540
//
// We mirror those exactly so the building placements come out at the
// distance/bearing we intend.
const AMSTERDAM_LAT_RAD = (52.3676 * Math.PI) / 180;
const METRES_PER_DEG_LNG = 111320 * Math.cos(AMSTERDAM_LAT_RAD);
const METRES_PER_DEG_LAT = 110540;

const TERRACE = { lat: 0, lng: 0 };

/**
 * Place a building at a given bearing (degrees from N clockwise) and
 * distance (metres) from the terrace, with the given height + width.
 */
function placeBuilding(
  bearingDeg: number,
  distanceM: number,
  heightM: number,
  widthM = 15,
): Building {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const dx = Math.sin(bearingRad) * distanceM; // east offset metres
  const dy = Math.cos(bearingRad) * distanceM; // north offset metres
  return {
    lat: TERRACE.lat + dy / METRES_PER_DEG_LAT,
    lng: TERRACE.lng + dx / METRES_PER_DEG_LNG,
    height: heightM,
    width: widthM,
  };
}

// ── Test infrastructure ─────────────────────────────────────────────────

interface FixtureResult {
  fixture: string;
  scenario: string;
  inputs: Record<string, unknown>;
  expected: {
    description: string;
    coverage: { min: number; max: number };
  };
  observed: {
    coverage: number;
    isInShadow: boolean;
  };
  pass: boolean;
  notes?: string;
}

const results: FixtureResult[] = [];

function record(r: FixtureResult): void {
  results.push(r);
}

// ── Fixture 1: South building, 20m tall, 15m away ───────────────────────
//
// At Amsterdam latitude, the sun stays in the southern half of the sky.
// A 20m building 15m due south has angular roof height of
// atan(20/15) ≈ 53.13°.
//
// (a) Winter solstice noon: sun altitude ≈ 14°. The roof (53°) is far
//     ABOVE the sun. Sun is fully behind the building → coverage ≈ 1.0.
// (b) Summer solstice noon: sun altitude ≈ 61°. The roof (53°) is below
//     the sun by 8° — physically the sun is visible above the roof, so
//     coverage should be ≈ 0.
//
// ⚠ The engine's `HEIGHT_RATIO_FLOOR = 0.8` produces a non-zero partial
// block in the range heightRatio ∈ (0.8, 1.0). For case (b),
// heightRatio = 53/61 ≈ 0.87 — falls in that band, so the engine
// reports a partial block (~0.35) where the physics says 0. We assert
// the physics expectation here so the discrepancy lands as evidence in
// FINDINGS.md without us pre-judging whether it's an intended penumbra
// model or a bug.

{
  const bSouth20at15 = placeBuilding(180, 15, 20);

  // Case (a): Winter noon. Sun ≈ az 180°, alt 14°.
  {
    const utc = amsterdamLocalToUtc('2026-12-21', 12.5);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const cov = shadowCoverage(TERRACE, [bSouth20at15], sun.altitude, sun.azimuth);
    const inShadow = isInShadow(TERRACE, [bSouth20at15], sun.altitude, sun.azimuth);
    record({
      fixture: 'F1a',
      scenario: 'S building 20m@15m, winter noon — must be fully shaded',
      inputs: {
        building: bSouth20at15,
        sunAlt: Number(sun.altitude.toFixed(2)),
        sunAz: Number(sun.azimuth.toFixed(2)),
      },
      expected: {
        description: 'Roof angular height (~53°) >> sun altitude (~14°) → full shade',
        coverage: { min: 0.9, max: 1.0 },
      },
      observed: {
        coverage: Number(cov.toFixed(4)),
        isInShadow: inShadow,
      },
      pass: cov >= 0.9 && inShadow === true,
    });
  }

  // Case (b): Summer noon. Sun ≈ az 180°, alt 61°.
  {
    const utc = amsterdamLocalToUtc('2026-06-21', 13.67); // ≈ solar noon
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const cov = shadowCoverage(TERRACE, [bSouth20at15], sun.altitude, sun.azimuth);
    const inShadow = isInShadow(TERRACE, [bSouth20at15], sun.altitude, sun.azimuth);
    record({
      fixture: 'F1b',
      scenario: 'S building 20m@15m, summer noon — sun above roof, must be sunny',
      inputs: {
        building: bSouth20at15,
        sunAlt: Number(sun.altitude.toFixed(2)),
        sunAz: Number(sun.azimuth.toFixed(2)),
      },
      expected: {
        description:
          'Roof angular height (~53°) < sun altitude (~61°) → sun visible above roof, coverage ≈ 0',
        coverage: { min: 0, max: 0.1 },
      },
      observed: {
        coverage: Number(cov.toFixed(4)),
        isInShadow: inShadow,
      },
      pass: cov <= 0.1 && inShadow === false,
      notes:
        cov > 0.1
          ? 'Failure here is the HEIGHT_RATIO_FLOOR=0.8 penumbra model — heightRatio ≈ 0.87 falls in the (0.8, 1.0) partial-block band even though physics says sun is clearly above roof. Candidate FINDINGS entry.'
          : undefined,
    });
  }
}

// ── Fixture 2: North building — should never shade ───────────────────────
//
// At Amsterdam latitude (52.37°N), the sun never reaches azimuths in
// roughly (315°, 45°) — i.e. it never comes from the north quadrant.
// A building due NORTH (bearing 0°) should therefore never lie in the
// sun-bearing arc → coverage 0 whenever sun is above the horizon.
//
// We sample every daylight hour across a summer solstice (longest day)
// to maximise the chance the sun gets near north in the early morning
// or late evening.

{
  const bNorth = placeBuilding(0, 15, 30); // due N, 15m, 30m tall — large
  const violations: { hour: number; sunAz: number; coverage: number }[] = [];

  for (let h = 4; h <= 22; h++) {
    const utc = amsterdamLocalToUtc('2026-06-21', h);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    if (sun.altitude <= 0) continue;
    const cov = shadowCoverage(TERRACE, [bNorth], sun.altitude, sun.azimuth);
    if (cov > 0.05) violations.push({ hour: h, sunAz: Number(sun.azimuth.toFixed(2)), coverage: Number(cov.toFixed(4)) });
  }

  record({
    fixture: 'F2',
    scenario: 'N building 30m@15m — must never shade across midsummer daylight',
    inputs: { building: bNorth, hoursTested: '04:00–22:00 on 2026-06-21' },
    expected: {
      description: 'Sun never reaches N azimuth at lat 52° → coverage 0 every hour',
      coverage: { min: 0, max: 0.05 },
    },
    observed: {
      coverage: violations.length === 0 ? 0 : Math.max(...violations.map((v) => v.coverage)),
      isInShadow: false,
    },
    pass: violations.length === 0,
    notes:
      violations.length > 0
        ? `Violations at hours: ${violations.map((v) => `${v.hour}:00(az=${v.sunAz}, cov=${v.coverage})`).join(', ')}`
        : undefined,
  });
}

// ── Fixture 3: West building — morning sunny, evening shaded ─────────────
//
// Building due WEST (bearing 270°), 20m tall @ 15m. Morning sun comes
// from the east (azimuth ~90°), so the W building is opposite the sun
// → coverage 0. Evening sun comes from the west (azimuth ~270°), so
// the W building is between terrace and sun → coverage > 0.5.

{
  const bWest = placeBuilding(270, 15, 20);

  // Morning (09:00 in mid-May, sun in the east)
  {
    const utc = amsterdamLocalToUtc('2026-05-15', 9);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const cov = shadowCoverage(TERRACE, [bWest], sun.altitude, sun.azimuth);
    record({
      fixture: 'F3-morning',
      scenario: 'W building 20m@15m, 09:00 sun in east — must be sunny',
      inputs: { building: bWest, sunAlt: Number(sun.altitude.toFixed(2)), sunAz: Number(sun.azimuth.toFixed(2)) },
      expected: { description: 'Sun in east, building due west → no shadow', coverage: { min: 0, max: 0.05 } },
      observed: { coverage: Number(cov.toFixed(4)), isInShadow: cov >= 0.5 },
      pass: cov <= 0.05,
    });
  }

  // Evening (19:00 in mid-May, sun in the west, alt ~20°)
  {
    const utc = amsterdamLocalToUtc('2026-05-15', 19);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const cov = shadowCoverage(TERRACE, [bWest], sun.altitude, sun.azimuth);
    record({
      fixture: 'F3-evening',
      scenario: 'W building 20m@15m, 19:00 sun in west — must be shaded',
      inputs: { building: bWest, sunAlt: Number(sun.altitude.toFixed(2)), sunAz: Number(sun.azimuth.toFixed(2)) },
      expected: { description: 'Sun in west aligns with building → high coverage', coverage: { min: 0.5, max: 1 } },
      observed: { coverage: Number(cov.toFixed(4)), isInShadow: cov >= 0.5 },
      pass: cov >= 0.5,
    });
  }
}

// ── Fixture 4: Zero buildings → no shadow ───────────────────────────────

{
  let allZero = true;
  let firstViolation: { hour: number; coverage: number } | null = null;

  for (let h = 6; h <= 21; h++) {
    const utc = amsterdamLocalToUtc('2026-06-21', h);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    if (sun.altitude <= 0) continue;
    const cov = shadowCoverage(TERRACE, [], sun.altitude, sun.azimuth);
    if (cov !== 0) {
      allZero = false;
      if (!firstViolation) firstViolation = { hour: h, coverage: Number(cov.toFixed(4)) };
    }
  }

  record({
    fixture: 'F4',
    scenario: 'Zero buildings, sun above horizon — must always be sunny',
    inputs: { buildings: 0, dateStr: '2026-06-21', hoursTested: '06:00–21:00' },
    expected: { description: 'No buildings to block sun → coverage 0', coverage: { min: 0, max: 0 } },
    observed: {
      coverage: firstViolation ? firstViolation.coverage : 0,
      isInShadow: false,
    },
    pass: allZero,
    notes: firstViolation ? `First violation at hour ${firstViolation.hour}: coverage=${firstViolation.coverage}` : undefined,
  });
}

// ── Fixture 5: Sun below horizon → fully shaded (no NaN) ────────────────
//
// shadow.ts:184 special-cases sunAltitude <= 0 to return coverage = 1.
// We exercise both pre-sunrise and post-sunset cases, and the
// negative-altitude case explicitly, asserting (a) coverage === 1,
// (b) result is finite (not NaN).

{
  const bAny = placeBuilding(180, 15, 20);

  const cases: { label: string; dateStr: string; hour: number }[] = [
    { label: 'Pre-sunrise (Dec 21 06:00)', dateStr: '2026-12-21', hour: 6 },
    { label: 'Post-sunset (Dec 21 18:00)', dateStr: '2026-12-21', hour: 18 },
    { label: 'Deep midnight (May 15 00:00)', dateStr: '2026-05-15', hour: 0 },
  ];

  for (const c of cases) {
    const utc = amsterdamLocalToUtc(c.dateStr, c.hour);
    const sun = solarPosition(utc, AMSTERDAM_LAT, AMSTERDAM_LNG);
    const cov = shadowCoverage(TERRACE, [bAny], sun.altitude, sun.azimuth);
    const covNoBldg = shadowCoverage(TERRACE, [], sun.altitude, sun.azimuth);
    const inShadow = isInShadow(TERRACE, [bAny], sun.altitude, sun.azimuth);
    const isFinite = Number.isFinite(cov) && Number.isFinite(covNoBldg);
    record({
      fixture: `F5-${c.label.replace(/\W+/g, '_')}`,
      scenario: `${c.label} — coverage must equal 1, no NaN`,
      inputs: { dateStr: c.dateStr, hour: c.hour, sunAlt: Number(sun.altitude.toFixed(2)) },
      expected: { description: 'Sun below horizon → coverage = 1 (everything is in shadow)', coverage: { min: 1, max: 1 } },
      observed: { coverage: Number(cov.toFixed(4)), isInShadow: inShadow },
      pass: isFinite && cov === 1 && covNoBldg === 1 && inShadow === true,
      notes: !isFinite ? 'NaN detected' : undefined,
    });
  }
}

// ── Fixture 6: shadowCoverage vs isInShadow consistency at low sun ──────
//
// shadow.ts:260 special-cases `isInShadow` to return true when
// sunAltitude <= 2°, regardless of whether any building actually blocks.
// shadowCoverage doesn't have this floor — at sunAltitude = 1° with zero
// buildings, it returns 0. Document this inconsistency.

{
  // Construct a synthetic sun position at altitude 1°, azimuth 200°
  // (no real date — direct injection, exercising both functions).
  const fakeSunAlt = 1;
  const fakeSunAz = 200;
  const cov = shadowCoverage(TERRACE, [], fakeSunAlt, fakeSunAz);
  const inShadow = isInShadow(TERRACE, [], fakeSunAlt, fakeSunAz);
  const consistent = (cov >= 0.5) === inShadow;
  record({
    fixture: 'F6',
    scenario: 'Low-sun (alt=1°) consistency: shadowCoverage vs isInShadow at zero buildings',
    inputs: { fakeSunAlt, fakeSunAz, buildings: 0 },
    expected: {
      description: 'isInShadow should agree with (shadowCoverage >= 0.5). Currently isInShadow has a separate alt<=2 early-return.',
      coverage: { min: 0, max: 1 },
    },
    observed: { coverage: Number(cov.toFixed(4)), isInShadow: inShadow },
    pass: consistent,
    notes: !consistent
      ? `shadowCoverage=${cov}, isInShadow=${inShadow}. The two helpers disagree about alt=1° with zero buildings. isInShadow's alt<=2 floor is documented at shadow.ts:260; shadowCoverage's floor is alt<=0.`
      : undefined,
  });
}

// ── Output ──────────────────────────────────────────────────────────────

const totalPass = results.filter((r) => r.pass).length;
const totalFail = results.length - totalPass;

writeFileSync(
  join(OUT_DIR, 'shadow-fixtures.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      engine: { file: 'src/engines/shadow.ts', functions: ['shadowCoverage', 'isInShadow'] },
      summary: { total: results.length, passed: totalPass, failed: totalFail },
      results,
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# B2a — Shadow Engine Synthetic Fixtures');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('');
md.push('Validates `src/engines/shadow.ts::shadowCoverage` and `isInShadow`');
md.push('against physics-grounded synthetic fixtures. The shadow engine is');
md.push('user-facing via `ShadowOverlay` (Pro map layer) even though it is not');
md.push('called from scoring — correctness matters because shadow polygons');
md.push('drawn on the map are this code\'s output.');
md.push('');
md.push(`**Summary: ${totalPass}/${results.length} passed.**`);
md.push('');
md.push('| Fixture | Scenario | Expected coverage | Observed coverage | Pass |');
md.push('| --- | --- | --- | --- | --- |');
for (const r of results) {
  const exp =
    r.expected.coverage.min === r.expected.coverage.max
      ? `${r.expected.coverage.min}`
      : `[${r.expected.coverage.min}, ${r.expected.coverage.max}]`;
  md.push(
    `| ${r.fixture} | ${r.scenario} | ${exp} | ${r.observed.coverage} | ${r.pass ? '✅' : '❌'} |`,
  );
}
md.push('');

const fails = results.filter((r) => !r.pass);
if (fails.length > 0) {
  md.push('## Failures — evidence for FINDINGS.md');
  md.push('');
  for (const r of fails) {
    md.push(`### ${r.fixture} — ${r.scenario}`);
    md.push('');
    md.push(`- **Inputs:** \`${JSON.stringify(r.inputs)}\``);
    md.push(`- **Expected:** ${r.expected.description}`);
    md.push(`- **Observed:** coverage=${r.observed.coverage}, isInShadow=${r.observed.isInShadow}`);
    if (r.notes) md.push(`- **Notes:** ${r.notes}`);
    md.push('');
  }
} else {
  md.push('## Verdict');
  md.push('');
  md.push('All fixtures passed. The shadow engine is correct on synthetic');
  md.push('ground-truth across the modelled cases (south/north/west buildings,');
  md.push('zero buildings, sun-below-horizon, low-sun consistency).');
}

writeFileSync(join(OUT_DIR, 'shadow-fixtures.md'), md.join('\n'));

console.log(`shadow-fixtures.md written: ${totalPass}/${results.length} passed.`);
