/**
 * 20 — Score distribution / clustering diagnosis.
 *
 * Andy's UX concern: pins cluster around identical scores ("all terraces
 * centred on one point") and/or too many terraces sit in the top band, so
 * users can't pick THE sunniest terrace and stop trusting the number.
 *
 * This measures, with the CURRENT full engine (shadow + trees + facing +
 * normalisation), at two representative hours on a sunny day:
 *   1. how many DISTINCT score values exist across 931 terraces,
 *   2. the largest identical-value clusters (and who's in them),
 *   3. the displayed-integer collision rate (what users actually see),
 *   4. band shares (how many pins read "Volle zon"),
 *   5. WHY: cluster sizes among unshadowed terraces per facing bucket
 *      (facing is 9 discrete values; weather/temp/wind are city-wide, so
 *      unshadowed same-facing terraces are structurally identical).
 *
 * Output: audit-output/score-distribution.md (+ stdout summary).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { computeSunScore } from '../../src/engines/scoring';
import { bandForScore } from '../../src/engines/bands';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { getTreesForTerrace } from '../../src/data/trees';
import { TERRACES } from '../../src/data/terraces';

const DATE = '2026-06-13';
const HOURS = [14, 17];

mkdirSync('audit-output', { recursive: true });

let md = `# Score distribution diagnosis — ${DATE}, sunny profile\n\n`;
md += `Engine: current production chain (altitude, sky, facing, wind, temp, shadow ×(1−0.85·cov), ÷1.61).\n`;
md += `Terraces: ${TERRACES.length}.\n\n`;

for (const hour of HOURS) {
  type Row = { id: number; name: string; facing: string; score: number; cov: number };
  const rows: Row[] = TERRACES.map((t) => {
    const r = computeSunScore(
      t, hour, DATE, 'sunny', undefined,
      getBuildingsForTerrace(t.id), getTreesForTerrace(t.id),
    );
    return { id: t.id, name: t.name, facing: t.facing, score: r.score, cov: r.shadow };
  });

  const scores = rows.map((r) => r.score);
  const n = scores.length;
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  // 1. distinct values at 4dp and at displayed-integer precision
  const at4 = new Set(scores.map((s) => s.toFixed(4))).size;
  const displayed = rows.map((r) => Math.min(99, Math.floor(r.score * 100)));
  const distinctDisplayed = new Set(displayed).size;

  // 2. largest exact-value clusters
  const byVal = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.score.toFixed(4);
    (byVal.get(k) ?? byVal.set(k, []).get(k)!).push(r);
  }
  const clusters = [...byVal.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);

  // 3. displayed-integer histogram concentration
  const intCount = new Map<number, number>();
  for (const d of displayed) intCount.set(d, (intCount.get(d) ?? 0) + 1);
  const topInts = [...intCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // 4. band shares
  const bands = new Map<string, number>();
  for (const s of scores) bands.set(bandForScore(s), (bands.get(bandForScore(s)) ?? 0) + 1);

  // 5. unshadowed same-facing structural clusters
  const open = rows.filter((r) => r.cov === 0);
  const byFacing = new Map<string, number>();
  for (const r of open) byFacing.set(r.facing, (byFacing.get(r.facing) ?? 0) + 1);

  md += `## Hour ${hour}:00\n\n`;
  md += `- range ${min.toFixed(3)}–${max.toFixed(3)}, mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}\n`;
  md += `- **distinct exact values: ${at4}** across ${n} terraces; **distinct displayed integers: ${distinctDisplayed}**\n`;
  md += `- top displayed integers: ${topInts.map(([v, c]) => `**${v}**×${c}`).join(', ')}\n`;
  md += `- bands: ${[...bands.entries()].map(([b, c]) => `${b} ${c} (${((c / n) * 100).toFixed(0)}%)`).join(' · ')}\n`;
  md += `- unshadowed (cov=0) terraces: ${open.length}; per facing: ${[...byFacing.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f}:${c}`).join(' ')}\n`;
  md += `\n### Largest identical-score clusters\n\n| score | count | examples |\n|---|---|---|\n`;
  for (const [v, list] of clusters) {
    md += `| ${v} | ${list.length} | ${list.slice(0, 3).map((r) => `${r.name} (${r.facing})`).join(', ')}… |\n`;
  }
  md += `\n`;

  console.log(`H${hour}: distinct=${at4}/${n}  displayedInts=${distinctDisplayed}  ` +
    `topInt=${topInts[0]?.[0]}×${topInts[0]?.[1]}  full-band=${bands.get('full') ?? 0} (${(((bands.get('full') ?? 0) / n) * 100).toFixed(0)}%)  ` +
    `biggestCluster=${clusters[0]?.[1].length}`);
}

writeFileSync('audit-output/score-distribution.md', md);
console.log('\nwritten audit-output/score-distribution.md');
