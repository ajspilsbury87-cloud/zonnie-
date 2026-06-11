#!/usr/bin/env tsx
/**
 * B5 — Range scoring + band consistency.
 *
 * Three sections:
 *
 *   (1) Regression guard for the LandingPage parity bug fixed before:
 *       `computeRangeScore(t, h, h, ...)` must equal `computeSunScore(t, h, ...)`
 *       for a degenerate one-hour window.
 *
 *   (2) Band-threshold duplication scan. Grep `src/**` for the four cutoff
 *       constants (0.7, 0.5, 0.3, 0.1) appearing together within a small
 *       window. Each independent copy is a P1 (per Decisions-Log §B5).
 *       The script *finds* the duplicates; FINDINGS.md will *grade* them.
 *
 *   (3) Distribution snapshot across all terraces for tomorrow 13:00–15:00
 *       under sunny + cloudy synthetic skies. Smell tests:
 *         - not everything 90%+
 *         - distribution not identical between sunny/cloudy
 *         - N-facing canal terraces visibly lower than open S-facing squares
 *
 * Run: npx tsx scripts/audit/14-range-and-bands.ts
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import {
  computeSunScore,
  computeRangeScore,
  scoreLabel,
} from '../../src/engines/scoring';
import type { Facing } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const DATE = '2026-06-21';

// ── Section 1: regression guard ─────────────────────────────────────────

interface RangeGuard {
  hour: number;
  facing: Facing;
  single: number;
  range: number;
  match: boolean;
}
const guards: RangeGuard[] = [];

const sampleHours = [9, 12, 14, 16, 19];
const sampleFacings: Facing[] = ['S', 'SW', 'N', 'NE', 'All'];

let allMatch = true;
for (const hour of sampleHours) {
  for (const facing of sampleFacings) {
    const t = TERRACES.find((x) => x.facing === facing) ?? TERRACES[0]!;
    const single = computeSunScore(t, hour, DATE, 'sunny').score;
    const range = computeRangeScore(t, hour, hour, DATE, 'sunny');
    const match = Math.abs(single - range) < 1e-9;
    if (!match) allMatch = false;
    guards.push({
      hour,
      facing,
      single: Number(single.toFixed(6)),
      range: Number(range.toFixed(6)),
      match,
    });
  }
}

// ── Section 2: band-threshold duplication scan ──────────────────────────
//
// We look for files that contain ALL FOUR of {0.7, 0.5, 0.3, 0.1} within
// any 30-line window — that's a strong signal that someone has inlined
// the band cascade rather than calling `scoreLabel`/`scoreToColor`. Then
// we list each file with the matched line numbers.

interface DuplicateHit {
  file: string;
  matchedLines: number[];
  startLine: number;
  endLine: number;
  context: string;
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'ios' || entry === 'android' || entry === 'audit-output') {
        continue;
      }
      walk(p, files);
    } else {
      const ext = extname(entry);
      if (ext === '.ts' || ext === '.tsx') files.push(p);
    }
  }
}

const srcDir = join(process.cwd(), 'src');
const allFiles: string[] = [];
walk(srcDir, allFiles);

const TOK = [
  { v: '0.7', re: /\b0\.7(?!\d)/ },
  { v: '0.5', re: /\b0\.5(?!\d)/ },
  { v: '0.3', re: /\b0\.3(?!\d)/ },
  { v: '0.1', re: /\b0\.1(?!\d)/ },
];
const WINDOW = 30;

const duplicates: DuplicateHit[] = [];

for (const filePath of allFiles) {
  const rel = relative(process.cwd(), filePath).replace(/\\/g, '/');
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);

  // Find lines that contain a `> 0.X` cascade. A line is a candidate if
  // it contains `> 0.<num>` and matches one of the cutoffs.
  const candidateLines: { line: number; matched: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]!;
    if (/>\s*0\.[1-9]/.test(L)) {
      for (const tk of TOK) {
        if (tk.re.test(L)) {
          candidateLines.push({ line: i + 1, matched: tk.v });
          break;
        }
      }
    }
  }

  // Look for a 30-line window covering all four cutoffs.
  for (let i = 0; i < candidateLines.length; i++) {
    const start = candidateLines[i]!.line;
    const matchedSet = new Set<string>();
    let j = i;
    while (j < candidateLines.length && candidateLines[j]!.line - start < WINDOW) {
      matchedSet.add(candidateLines[j]!.matched);
      j++;
    }
    if (matchedSet.size === 4) {
      const end = candidateLines[j - 1]!.line;
      const context = lines.slice(start - 1, end).join('\n');
      duplicates.push({
        file: rel,
        matchedLines: candidateLines.slice(i, j).map((x) => x.line),
        startLine: start,
        endLine: end,
        context,
      });
      // Skip past this hit
      i = j - 1;
    }
  }
}

// ── Section 3: distribution snapshot ────────────────────────────────────

interface DistRow {
  bucket: string;
  sunny: number;
  cloudy: number;
}

function bucketise(values: number[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = 0; i < 20; i++) buckets[`${(i * 5).toString().padStart(3, '0')}%`] = 0;
  for (const v of values) {
    const idx = Math.min(19, Math.max(0, Math.floor(v * 20)));
    const key = `${(idx * 5).toString().padStart(3, '0')}%`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

const sunnyScores = TERRACES.map((t) => computeRangeScore(t, 13, 15, DATE, 'sunny'));
const cloudyScores = TERRACES.map((t) => computeRangeScore(t, 13, 15, DATE, 'cloudy'));

const sunnyBuckets = bucketise(sunnyScores);
const cloudyBuckets = bucketise(cloudyScores);
const distribution: DistRow[] = Object.keys(sunnyBuckets)
  .sort()
  .map((k) => ({ bucket: k, sunny: sunnyBuckets[k] ?? 0, cloudy: cloudyBuckets[k] ?? 0 }));

// Smell tests
const sunnyOver90 = sunnyScores.filter((s) => s > 0.9).length;
const sunnyDistinctValues = new Set(sunnyScores.map((s) => s.toFixed(2))).size;
const cloudyDistinctValues = new Set(cloudyScores.map((s) => s.toFixed(2))).size;

// Mean by facing
interface FacingStat { facing: string; sunnyMean: number; cloudyMean: number; n: number }
const byFacing: Record<string, { sunny: number[]; cloudy: number[] }> = {};
for (let i = 0; i < TERRACES.length; i++) {
  const f = TERRACES[i]!.facing;
  (byFacing[f] ??= { sunny: [], cloudy: [] }).sunny.push(sunnyScores[i]!);
  byFacing[f]!.cloudy.push(cloudyScores[i]!);
}
const facingStats: FacingStat[] = [];
for (const f of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All']) {
  const data = byFacing[f];
  if (!data || data.sunny.length === 0) continue;
  const sm = data.sunny.reduce((a, b) => a + b, 0) / data.sunny.length;
  const cm = data.cloudy.reduce((a, b) => a + b, 0) / data.cloudy.length;
  facingStats.push({ facing: f, sunnyMean: Number(sm.toFixed(4)), cloudyMean: Number(cm.toFixed(4)), n: data.sunny.length });
}

// Label distribution
const sunnyLabels: Record<string, number> = {};
const cloudyLabels: Record<string, number> = {};
for (const s of sunnyScores) sunnyLabels[scoreLabel(s)] = (sunnyLabels[scoreLabel(s)] ?? 0) + 1;
for (const s of cloudyScores) cloudyLabels[scoreLabel(s)] = (cloudyLabels[scoreLabel(s)] ?? 0) + 1;

// ── Output ──────────────────────────────────────────────────────────────

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

add(
  'computeRangeScore([h,h]) equals computeSunScore at h for all sampled (hour, facing)',
  `all ${guards.length} samples match`,
  allMatch ? `all ${guards.length} match` : `${guards.filter((g) => !g.match).length} mismatches`,
  allMatch,
);

// At most ONE band-cascade should exist (`scoring.ts::scoreLabel`).
// We expect to see:
//   - scoring.ts/scoreLabel (the original)
//   - tokens.ts/scoreToColor (acceptable parallel — color cascade)
// So we tolerate two hits but flag more.
add(
  'Band thresholds duplicated in at most 2 places (scoreLabel + scoreToColor)',
  '≤2 duplicate sites',
  `${duplicates.length} duplicate sites: ${duplicates.map((d) => d.file).join(', ')}`,
  duplicates.length <= 2,
);

add(
  'Not all terraces clumped at ≥90% under sunny profile',
  '< 30% of terraces > 0.90',
  `${sunnyOver90}/${TERRACES.length} (${((sunnyOver90 / TERRACES.length) * 100).toFixed(1)}%)`,
  sunnyOver90 / TERRACES.length < 0.3,
);

add(
  'Sunny and cloudy distributions differ',
  'distinct value counts differ',
  `sunny=${sunnyDistinctValues} distinct, cloudy=${cloudyDistinctValues} distinct`,
  Math.abs(sunnyDistinctValues - cloudyDistinctValues) > 1 || sunnyDistinctValues !== cloudyDistinctValues,
);

// Find S vs N facing means.
const sStat = facingStats.find((x) => x.facing === 'S');
const nStat = facingStats.find((x) => x.facing === 'N');
if (sStat && nStat) {
  add(
    'S-facing mean > N-facing mean under sunny sky',
    'S mean > N mean',
    `S=${sStat.sunnyMean}, N=${nStat.sunnyMean}`,
    sStat.sunnyMean > nStat.sunnyMean,
  );
}

const totalPass = asserts.filter((a) => a.pass).length;

writeFileSync(
  join(OUT_DIR, 'range-and-bands.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      regressionGuard: { allMatch, samples: guards },
      duplicates,
      distribution,
      facingStats,
      labelDistribution: { sunny: sunnyLabels, cloudy: cloudyLabels },
      asserts,
      summary: { total: asserts.length, passed: totalPass, failed: asserts.length - totalPass },
    },
    null,
    2,
  ),
);

const md: string[] = [];
md.push('# B5 — Range scoring + band consistency');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('');
md.push(`**Summary: ${totalPass}/${asserts.length} checks passed.**`);
md.push('');

md.push('## 1. Regression guard — `computeRangeScore([h,h]) === computeSunScore(h)`');
md.push('');
md.push(`Status: ${allMatch ? '✅ PASS' : '❌ FAIL'}`);
md.push('');
md.push('| Hour | Facing | Single-hour score | Range([h,h]) | Match |');
md.push('| ---: | --- | ---: | ---: | --- |');
for (const g of guards) {
  md.push(`| ${g.hour} | ${g.facing} | ${g.single} | ${g.range} | ${g.match ? '✅' : '❌'} |`);
}
md.push('');

md.push('## 2. Band-threshold duplication scan');
md.push('');
md.push('Files containing the entire `> 0.7 / > 0.5 / > 0.3 / > 0.1` cascade within a 30-line window. Each duplicate is a refactor target.');
md.push('');
if (duplicates.length === 0) {
  md.push('No duplicates found. Surprising — at minimum `scoring.ts::scoreLabel` should appear here. Check the heuristic.');
} else {
  for (const d of duplicates) {
    md.push(`### \`${d.file}\` (lines ${d.startLine}–${d.endLine})`);
    md.push('');
    md.push('```ts');
    md.push(d.context);
    md.push('```');
    md.push('');
  }
}

md.push('## 3. Distribution snapshot (13:00–15:00 window)');
md.push('');
md.push('| Bucket | Sunny | Cloudy |');
md.push('| --- | ---: | ---: |');
for (const row of distribution) md.push(`| ${row.bucket} | ${row.sunny} | ${row.cloudy} |`);
md.push('');
md.push('### Mean by facing');
md.push('');
md.push('| Facing | n | Sunny mean | Cloudy mean |');
md.push('| --- | ---: | ---: | ---: |');
for (const f of facingStats) md.push(`| ${f.facing} | ${f.n} | ${f.sunnyMean} | ${f.cloudyMean} |`);
md.push('');
md.push('### Label distribution');
md.push('');
md.push('Sunny: ' + Object.entries(sunnyLabels).map(([k, v]) => `${k}=${v}`).join(', '));
md.push('');
md.push('Cloudy: ' + Object.entries(cloudyLabels).map(([k, v]) => `${k}=${v}`).join(', '));
md.push('');

md.push('## Assertions');
md.push('');
md.push('| Check | Expected | Observed | Pass |');
md.push('| --- | --- | --- | --- |');
for (const a of asserts) md.push(`| ${a.name} | ${a.expected} | ${a.observed} | ${a.pass ? '✅' : '❌'} |`);

writeFileSync(join(OUT_DIR, 'range-and-bands.md'), md.join('\n'));

console.log(`range-and-bands.md written: ${totalPass}/${asserts.length} passed; ${duplicates.length} duplicate sites.`);
