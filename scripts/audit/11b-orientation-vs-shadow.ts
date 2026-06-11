#!/usr/bin/env tsx
/**
 * B2b — Quantify the orientation-vs-shadow delta on real terraces.
 *
 * Per the Decisions Log Finding 2: report what we lose by scoring with
 * orientation only (current production) vs an alternative model that
 * also attenuates by `shadowCoverage`. Concretely:
 *
 *   (a) score distribution shift across all terraces
 *   (b) top-50 ranking deltas
 *   (c) named "hostile geometry" exemplars where the drawn map overlay
 *       would cover a terrace whose pin (orientation-only) reads ≥70%
 *
 * The shadow factor we apply post-hoc is `1 - 0.85 * coverage`, mirroring
 * the docstring hint in `src/engines/shadow.ts:178` (the value the
 * original scoring used before shadow was removed in commit 9f732a7).
 *
 * Multiplying AFTER `computeSunScore` (which already clamps to [0,1])
 * is an approximation — strict pre-clamp ordering would yield a few
 * percent different scores on ceiling-hit terraces — but band flips,
 * which are the headline metric, are robust to that ordering because
 * shadow only ever reduces, never raises.
 *
 * Outputs:
 *   audit-output/orientation-vs-shadow.json   raw per-terrace + summary
 *   audit-output/orientation-vs-shadow.md     summary + exemplars
 *
 * Sampling:
 *   Date     2026-06-21 (longest day, peak shadow contrast)
 *   Hours    12, 13, 14, 15, 16, 17, 18 (Decisions-Log peak window)
 *   Weather  'sunny' synthetic profile (so cloud doesn't compress the
 *            range we're measuring)
 *
 * Rubric for grading Finding 2:
 *   >20% band-flips at peak hours = P0
 *   5–20%                          = P1
 *   <5%                            = P2
 *
 * Run: npx tsx scripts/audit/11b-orientation-vs-shadow.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { shadowCoverage } from '../../src/engines/shadow';
import { solarPosition } from '../../src/engines/solar';
import {
  amsterdamLocalToUtc,
  computeSunScore,
  scoreLabel,
} from '../../src/engines/scoring';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const DATE = '2026-06-21';
const HOURS = [12, 13, 14, 15, 16, 17, 18];
const SHADOW_K = 0.85; // matches the docstring hint at shadow.ts:178

// ── Per-terrace, per-hour run ────────────────────────────────────────────

interface HourSample {
  hour: number;
  orientationOnly: number;
  withShadow: number;
  coverage: number;
  bandOrient: string;
  bandShadow: string;
  bandFlipped: boolean;
}

interface TerraceSummary {
  id: number;
  name: string;
  area: string;
  facing: string;
  lat: number;
  lng: number;
  avgOrientation: number;
  avgWithShadow: number;
  maxCoverage: number;
  anyHourFlipped: boolean;
  worstHour: HourSample | null; // hour with largest score delta
  samples: HourSample[];
}

const summaries: TerraceSummary[] = [];

for (const t of TERRACES) {
  const buildings = getBuildingsForTerrace(t.id);
  const samples: HourSample[] = [];
  let maxCov = 0;
  let sumOrient = 0;
  let sumShadow = 0;
  let anyFlip = false;
  let worstSample: HourSample | null = null;
  let worstDelta = -Infinity;

  for (const hour of HOURS) {
    const utc = amsterdamLocalToUtc(DATE, hour);
    const sun = solarPosition(utc, t.lat, t.lng);
    const oResult = computeSunScore(t, hour, DATE, 'sunny');
    const o = oResult.score;
    let cov = 0;
    if (sun.altitude > 0) {
      cov = shadowCoverage(t, buildings, sun.altitude, sun.azimuth);
    } else {
      cov = 1;
    }
    const w = Math.max(0, o * (1 - SHADOW_K * cov));
    const bandO = scoreLabel(o);
    const bandW = scoreLabel(w);
    const flipped = bandO !== bandW;
    if (flipped) anyFlip = true;
    if (cov > maxCov) maxCov = cov;
    sumOrient += o;
    sumShadow += w;
    const sample: HourSample = {
      hour,
      orientationOnly: Number(o.toFixed(4)),
      withShadow: Number(w.toFixed(4)),
      coverage: Number(cov.toFixed(4)),
      bandOrient: bandO,
      bandShadow: bandW,
      bandFlipped: flipped,
    };
    samples.push(sample);
    const delta = o - w;
    if (delta > worstDelta) {
      worstDelta = delta;
      worstSample = sample;
    }
  }

  summaries.push({
    id: t.id,
    name: t.name,
    area: t.area,
    facing: t.facing,
    lat: t.lat,
    lng: t.lng,
    avgOrientation: Number((sumOrient / HOURS.length).toFixed(4)),
    avgWithShadow: Number((sumShadow / HOURS.length).toFixed(4)),
    maxCoverage: Number(maxCov.toFixed(4)),
    anyHourFlipped: anyFlip,
    worstHour: worstSample,
    samples,
  });
}

// ── (a) Distribution shift ───────────────────────────────────────────────

function histogram(values: number[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = 0; i < 20; i++) {
    const lo = (i * 5).toString().padStart(3, '0');
    buckets[`${lo}%`] = 0;
  }
  for (const v of values) {
    const idx = Math.min(19, Math.max(0, Math.floor(v * 20)));
    const key = `${(idx * 5).toString().padStart(3, '0')}%`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

const orientationDist = histogram(summaries.map((s) => s.avgOrientation));
const shadowDist = histogram(summaries.map((s) => s.avgWithShadow));

// ── Band flip rate (the rubric input) ────────────────────────────────────

const totalTerraces = summaries.length;
const totalFlipped = summaries.filter((s) => s.anyHourFlipped).length;
const flipRate = totalTerraces > 0 ? totalFlipped / totalTerraces : 0;

const grade =
  flipRate > 0.2 ? 'P0' : flipRate >= 0.05 ? 'P1' : 'P2';

// Per-hour flip counts
const perHourFlip: { hour: number; flipped: number; pct: number }[] = HOURS.map((h) => {
  const flipped = summaries.filter((s) =>
    s.samples.some((x) => x.hour === h && x.bandFlipped),
  ).length;
  return { hour: h, flipped, pct: totalTerraces > 0 ? flipped / totalTerraces : 0 };
});

// ── (b) Top-50 ranking deltas ────────────────────────────────────────────

const sortedByO = [...summaries].sort((a, b) => b.avgOrientation - a.avgOrientation);
const sortedByW = [...summaries].sort((a, b) => b.avgWithShadow - a.avgWithShadow);

const top50O = new Set(sortedByO.slice(0, 50).map((s) => s.id));
const top50W = new Set(sortedByW.slice(0, 50).map((s) => s.id));

const droppedFromTop50 = sortedByO
  .slice(0, 50)
  .filter((s) => !top50W.has(s.id));
const promotedToTop50 = sortedByW
  .slice(0, 50)
  .filter((s) => !top50O.has(s.id));

// ── (c) "Hostile geometry" exemplars ─────────────────────────────────────
//
// Terraces where ANY hour has:
//   orientationOnly > 0.70  (Volle zon — Full Sun pin)
//   coverage > 0.50         (shadow overlay would visibly cover this terrace)
// Sort by the size of the orientation-vs-shadow gap during that hour.

interface Exemplar {
  id: number;
  name: string;
  area: string;
  facing: string;
  hour: number;
  orientationOnly: number;
  withShadow: number;
  coverage: number;
  delta: number;
}

const exemplars: Exemplar[] = [];
for (const s of summaries) {
  for (const sample of s.samples) {
    if (sample.orientationOnly > 0.7 && sample.coverage > 0.5) {
      exemplars.push({
        id: s.id,
        name: s.name,
        area: s.area,
        facing: s.facing,
        hour: sample.hour,
        orientationOnly: sample.orientationOnly,
        withShadow: sample.withShadow,
        coverage: sample.coverage,
        delta: Number((sample.orientationOnly - sample.withShadow).toFixed(4)),
      });
    }
  }
}
exemplars.sort((a, b) => b.delta - a.delta);
const top20Exemplars = exemplars.slice(0, 20);

// ── Write JSON ──────────────────────────────────────────────────────────

writeFileSync(
  join(OUT_DIR, 'orientation-vs-shadow.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      config: { date: DATE, hours: HOURS, shadowK: SHADOW_K, weather: 'sunny' },
      summary: {
        totalTerraces,
        anyHourFlipped: totalFlipped,
        flipRate,
        rubric: 'Decisions-Log Finding 2: >20%=P0, 5–20%=P1, <5%=P2',
        proposedGrade: grade,
      },
      distributions: { orientationOnly: orientationDist, withShadow: shadowDist },
      perHourFlipRate: perHourFlip,
      top50ChangedFromOrientationToShadow: {
        droppedFromTop50Count: droppedFromTop50.length,
        droppedExamples: droppedFromTop50.slice(0, 25).map((s) => ({
          id: s.id,
          name: s.name,
          area: s.area,
          facing: s.facing,
          avgOrientation: s.avgOrientation,
          avgWithShadow: s.avgWithShadow,
        })),
        promotedToTop50Count: promotedToTop50.length,
        promotedExamples: promotedToTop50.slice(0, 25).map((s) => ({
          id: s.id,
          name: s.name,
          area: s.area,
          facing: s.facing,
          avgOrientation: s.avgOrientation,
          avgWithShadow: s.avgWithShadow,
        })),
      },
      hostileGeometryExemplars: top20Exemplars,
      perTerrace: summaries.map((s) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        facing: s.facing,
        avgOrientation: s.avgOrientation,
        avgWithShadow: s.avgWithShadow,
        maxCoverage: s.maxCoverage,
        anyHourFlipped: s.anyHourFlipped,
      })),
    },
    null,
    2,
  ),
);

// ── Write Markdown ──────────────────────────────────────────────────────

const md: string[] = [];
md.push('# B2b — Orientation-vs-Shadow Delta on Real Terraces');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Date: ${DATE} (longest day, peak shadow contrast)  Hours: ${HOURS.join(', ')}  Weather: sunny`);
md.push(`Shadow attenuation: \`score *= (1 - ${SHADOW_K} × coverage)\` post-hoc`);
md.push('');
md.push('## Headline');
md.push('');
md.push(`- **${totalTerraces} terraces** scored under each model.`);
md.push(`- **${totalFlipped} terraces (${(flipRate * 100).toFixed(1)}%)** have at least one peak hour whose score-band flips under shadow attenuation.`);
md.push(`- Per Decisions-Log Finding 2 rubric: **proposed grade = ${grade}** (>20%=P0, 5–20%=P1, <5%=P2).`);
md.push('');

md.push('## (a) Distribution shift');
md.push('');
md.push('Histogram of per-terrace average score across the peak hours. Each');
md.push('row is a 5% bucket. Left column = orientation-only (current');
md.push('production); right column = orientation × shadow.');
md.push('');
md.push('| Bucket | Orientation-only | Orientation × shadow |');
md.push('| --- | ---: | ---: |');
const bucketKeys = Object.keys(orientationDist).sort();
for (const k of bucketKeys) {
  md.push(`| ${k} | ${orientationDist[k]} | ${shadowDist[k]} |`);
}
md.push('');

md.push('### Per-hour flip rate');
md.push('');
md.push('| Hour | Flipped | % |');
md.push('| --- | ---: | ---: |');
for (const ph of perHourFlip) {
  md.push(`| ${ph.hour}:00 | ${ph.flipped} | ${(ph.pct * 100).toFixed(1)}% |`);
}
md.push('');

md.push('## (b) Top-50 ranking deltas');
md.push('');
md.push(`- **${droppedFromTop50.length} terraces** in the orientation-only top-50 fall OUT when shadow is applied.`);
md.push(`- **${promotedToTop50.length} terraces** are promoted INTO the top-50 under shadow.`);
md.push('');
if (droppedFromTop50.length > 0) {
  md.push('### Dropped from top-50 (first 25)');
  md.push('');
  md.push('| ID | Name | Area | Facing | Orient avg | Shadow avg |');
  md.push('| --- | --- | --- | --- | ---: | ---: |');
  for (const s of droppedFromTop50.slice(0, 25)) {
    md.push(`| ${s.id} | ${s.name} | ${s.area} | ${s.facing} | ${s.avgOrientation} | ${s.avgWithShadow} |`);
  }
  md.push('');
}
if (promotedToTop50.length > 0) {
  md.push('### Promoted into top-50 (first 25)');
  md.push('');
  md.push('| ID | Name | Area | Facing | Orient avg | Shadow avg |');
  md.push('| --- | --- | --- | --- | ---: | ---: |');
  for (const s of promotedToTop50.slice(0, 25)) {
    md.push(`| ${s.id} | ${s.name} | ${s.area} | ${s.facing} | ${s.avgOrientation} | ${s.avgWithShadow} |`);
  }
  md.push('');
}

md.push('## (c) Hostile-geometry exemplars');
md.push('');
md.push('Real terraces whose orientation-only score reads ≥0.70 (Full Sun');
md.push('pin) at the same hour where `shadowCoverage` ≥ 0.50 (the map');
md.push('overlay would visibly cover this terrace). Sorted by the size of');
md.push('the contradiction.');
md.push('');
md.push(`Total exemplar hours found: **${exemplars.length}**.`);
md.push(`Distinct terraces with at least one such hour: **${new Set(exemplars.map((e) => e.id)).size}**.`);
md.push('');
if (top20Exemplars.length > 0) {
  md.push('| ID | Name | Area | Facing | Hour | Orientation | With shadow | Coverage | Δ |');
  md.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
  for (const e of top20Exemplars) {
    md.push(`| ${e.id} | ${e.name} | ${e.area} | ${e.facing} | ${e.hour}:00 | ${e.orientationOnly} | ${e.withShadow} | ${e.coverage} | ${e.delta} |`);
  }
}
md.push('');

md.push('## What this means for FINDINGS.md');
md.push('');
md.push(`- Finding 1 (marketing/consistency mismatch) is **P0 by Decisions Log directive**, evidence-independent.`);
md.push(`- Finding 2 (adequacy of orientation-only) proposed grade is **${grade}** based on the ${(flipRate * 100).toFixed(1)}% band-flip rate.`);
md.push('- See `orientation-vs-shadow.json` for per-terrace samples (input to any further analysis).');

writeFileSync(join(OUT_DIR, 'orientation-vs-shadow.md'), md.join('\n'));

console.log(
  `orientation-vs-shadow.md written: ${totalFlipped}/${totalTerraces} flipped (${(flipRate * 100).toFixed(1)}%, grade=${grade}).`,
);
