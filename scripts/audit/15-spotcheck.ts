#!/usr/bin/env tsx
/**
 * B6 — Spotcheck scaffold (POST-SHADOW).
 *
 * Picks 12 well-known Amsterdam terraces spanning orientations and
 * neighbourhoods, predicts their hourly sun scores for the coming
 * Saturday under a sunny-sky synthetic profile, and writes a markdown
 * checklist for Andy to mark check/cross after verifying in person /
 * via Street View / via webcams.
 *
 * UPDATE (post-shadow): scoring calls now pass the real per-terrace
 * buildings (getBuildingsForTerrace) AND trees (getTreesForTerrace) into
 * computeSunScore, so the predictions reflect building + tree shadow, not
 * orientation alone. The script ALSO computes the old orientation-only
 * score in parallel and reports which of the 12 predictions changed
 * materially (peak score, peak hour, or best-window) versus the pre-shadow
 * version, so Andy can compare directly.
 *
 * CAVEAT: buildings.json is mid-refresh; ~35/930 terraces currently have 0
 * buildings. All 12 picks here are well-known central venues that DO have
 * data, but note the dataset is not yet complete citywide.
 *
 * Definition-of-done in the audit spec:
 *   >=10/12 should match within +/-30 min of the predicted sunny window.
 *
 * Output:
 *   audit-output/spotcheck.md
 *
 * Run: npx tsx scripts/audit/15-spotcheck.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { getTreesForTerrace } from '../../src/data/trees';
import {
  computeSunScore,
  findBestWindow,
  scoreLabel,
} from '../../src/engines/scoring';
import type { Terrace } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

// ── Pick the next Saturday from today's date ────────────────────────────
function nextSaturday(): string {
  const today = new Date();
  const day = today.getDay(); // 0 = Sun ... 6 = Sat
  const daysToSat = (6 - day + 7) % 7 || 7; // never today; if Sat, pick next Sat
  const target = new Date(today);
  target.setDate(today.getDate() + daysToSat);
  const yyyy = target.getFullYear();
  const mm = (target.getMonth() + 1).toString().padStart(2, '0');
  const dd = target.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DATE = nextSaturday();

// ── 12 picks, hand-curated by name (UNCHANGED from pre-shadow run) ──────
const PICK_NAMES = [
  'Café de Jaren',
  'Loetje Centraal',
  'Café Magere Brug',
  'De Sluyswacht',
  'Meneer Nilsson',
  'Café Hesp',
  'il Pecorino',
  'Café Parlotte',
  'Café Americain',
  'Café Kiebêrt',
  'Café Restaurant Piet de Gruyter',
  'Spirit Amsterdam',
];

// ── Helper: find each pick or its closest name match ────────────────────
const COMBINING = /[̀-ͯ]/g;
function findTerrace(name: string): Terrace | null {
  const norm = (s: string) =>
    s.normalize('NFD').replace(COMBINING, '').toLowerCase().trim();
  const target = norm(name);
  let t = TERRACES.find((x) => norm(x.name) === target);
  if (t) return t;
  t = TERRACES.find((x) => norm(x.name).includes(target));
  return t ?? null;
}

interface PickResult {
  query: string;
  found: Terrace | null;
  buildingCount: number;
  treeCount: number;
  // post-shadow (current production-equivalent)
  hourly: number[];
  bestWindow: ReturnType<typeof findBestWindow>;
  peakHour: number;
  peakScore: number;
  peakLabel: string;
  // orientation-only (pre-shadow comparison)
  hourlyOrient: number[];
  bestWindowOrient: ReturnType<typeof findBestWindow>;
  peakHourOrient: number;
  peakScoreOrient: number;
  peakLabelOrient: string;
}

const picks: PickResult[] = [];

for (const query of PICK_NAMES) {
  const t = findTerrace(query);
  if (!t) {
    picks.push({
      query, found: null, buildingCount: 0, treeCount: 0,
      hourly: [], bestWindow: null, peakHour: -1, peakScore: 0, peakLabel: 'n/a',
      hourlyOrient: [], bestWindowOrient: null, peakHourOrient: -1,
      peakScoreOrient: 0, peakLabelOrient: 'n/a',
    });
    continue;
  }

  const buildings = getBuildingsForTerrace(t.id);
  const trees = getTreesForTerrace(t.id);

  const hourly: number[] = [];
  const hourlyOrient: number[] = [];
  let peakHour = 0, peakScore = 0;
  let peakHourOrient = 0, peakScoreOrient = 0;

  for (let h = 0; h < 24; h++) {
    // POST-SHADOW: pass real buildings + trees.
    const r = computeSunScore(t, h, DATE, 'sunny', undefined, buildings, trees);
    hourly.push(r.score);
    if (r.score > peakScore) { peakScore = r.score; peakHour = h; }
    // ORIENTATION-ONLY: omit buildings/trees (matches the old pre-shadow run).
    const ro = computeSunScore(t, h, DATE, 'sunny');
    hourlyOrient.push(ro.score);
    if (ro.score > peakScoreOrient) { peakScoreOrient = ro.score; peakHourOrient = h; }
  }

  picks.push({
    query, found: t, buildingCount: buildings.length, treeCount: trees.length,
    hourly,
    bestWindow: findBestWindow(hourly, 2, 0.5, 8, 21),
    peakHour, peakScore: Number(peakScore.toFixed(3)), peakLabel: scoreLabel(peakScore),
    hourlyOrient,
    bestWindowOrient: findBestWindow(hourlyOrient, 2, 0.5, 8, 21),
    peakHourOrient, peakScoreOrient: Number(peakScoreOrient.toFixed(3)),
    peakLabelOrient: scoreLabel(peakScoreOrient),
  });
}

// ── Material-change classification ───────────────────────────────────────
// "Material" = peak-score drop >= 0.05, OR peak-hour shift, OR best-window
// start/end shift, OR a peak-label band change.
function bw(w: ReturnType<typeof findBestWindow>): string {
  return w ? `${w.fromHour}:00-${w.toHour}:00` : 'none';
}
interface ChangeRow {
  name: string;
  peakDelta: number;
  peakHourShift: boolean;
  windowShift: boolean;
  labelChange: boolean;
  material: boolean;
  note: string;
}
const changes: ChangeRow[] = [];
for (const p of picks) {
  if (!p.found) continue;
  const peakDelta = Number((p.peakScore - p.peakScoreOrient).toFixed(3));
  const peakHourShift = p.peakHour !== p.peakHourOrient;
  const windowShift = bw(p.bestWindow) !== bw(p.bestWindowOrient);
  const labelChange = p.peakLabel !== p.peakLabelOrient;
  const material = Math.abs(peakDelta) >= 0.05 || peakHourShift || windowShift || labelChange;
  const parts: string[] = [];
  if (Math.abs(peakDelta) >= 0.05) parts.push(`peak ${peakDelta > 0 ? '+' : ''}${peakDelta}`);
  if (labelChange) parts.push(`label ${p.peakLabelOrient} -> ${p.peakLabel}`);
  if (peakHourShift) parts.push(`peak hour ${p.peakHourOrient}:00 -> ${p.peakHour}:00`);
  if (windowShift) parts.push(`window ${bw(p.bestWindowOrient)} -> ${bw(p.bestWindow)}`);
  changes.push({
    name: p.found.name, peakDelta, peakHourShift, windowShift, labelChange, material,
    note: parts.length ? parts.join('; ') : 'no material change',
  });
}
const materialCount = changes.filter((c) => c.material).length;

// ── Markdown output ──────────────────────────────────────────────────────
const md: string[] = [];
md.push('# B6 — Spotcheck Scaffold (post-shadow)');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Target date: **${DATE}** (next Saturday from audit run).`);
md.push('Weather assumption: synthetic `sunny` profile (so predictions reflect "what the app says on a clear day").');
md.push('Scoring: **building + tree shadow wired in** — `computeSunScore(..., getBuildingsForTerrace(id), getTreesForTerrace(id))`. This matches what the live app now shows.');
md.push('');
md.push('> CAVEAT: `buildings.json` is mid-refresh (~35/930 terraces have 0 buildings). All 12 picks below are central venues that DO have building data, so these predictions are stable.');
md.push('');
md.push(`**Post-shadow change summary: ${materialCount} of 12 predictions changed materially** vs the pre-shadow (orientation-only) version. See the "What changed" section below.`);
md.push('');
md.push('Pass criterion (per audit spec): **>= 10 of 12 picks** should match the predicted sunny window within +/-30 min when verified.');
md.push('');
md.push('## How to verify');
md.push('');
md.push('For each terrace below:');
md.push('1. Confirm a clear, broadly sunny day in Amsterdam on the target date (otherwise skip — synthetic predictions assume clear sky).');
md.push('2. Use one of: in-person check, Google Street View at the predicted peak hour, a public webcam (Live from Amsterdam, AT5 livestreams), local knowledge.');
md.push('3. Mark check if the seating area is in direct sun within the predicted "Best 2h window", cross if it is clearly shaded, ? if borderline.');
md.push('4. Tally at the bottom.');
md.push('');
md.push('## Picks (post-shadow scores)');
md.push('');
md.push('| # | Terrace | Area | Facing | Bldgs | Trees | Best 2h window | Peak hour | Peak score | Label | Verdict |');
md.push('| ---: | --- | --- | --- | ---: | ---: | --- | --- | ---: | --- | :---: |');
for (let i = 0; i < picks.length; i++) {
  const p = picks[i]!;
  if (!p.found) {
    md.push(`| ${i + 1} | _${p.query}_ | NOT FOUND | - | - | - | - | - | - | - | - |`);
    continue;
  }
  const t = p.found;
  const win = p.bestWindow
    ? `${p.bestWindow.fromHour}:00-${p.bestWindow.toHour}:00 (avg ${p.bestWindow.avgScore.toFixed(2)})`
    : 'none >= Mostly Sunny';
  md.push(
    `| ${i + 1} | ${t.name} | ${t.area} | ${t.facing} | ${p.buildingCount} | ${p.treeCount} | ${win} | ${p.peakHour}:00 | ${p.peakScore} | ${p.peakLabel} | _ _ |`,
  );
}
md.push('');

md.push('## What changed vs the pre-shadow (orientation-only) version');
md.push('');
md.push('Pre-shadow = `computeSunScore(t, h, DATE, \'sunny\')` with no buildings/trees (the original B6 run). Post-shadow = same call WITH real buildings + trees. A change is "material" if peak score moved >= 0.05, OR the peak hour shifted, OR the best 2h window shifted, OR the peak label band changed.');
md.push('');
md.push('| # | Terrace | Peak (orient -> shadow) | Peak hour (o -> s) | Window (o -> s) | Material? | What changed |');
md.push('| ---: | --- | --- | --- | --- | :---: | --- |');
for (let i = 0; i < picks.length; i++) {
  const p = picks[i]!;
  if (!p.found) continue;
  const c = changes.find((x) => x.name === p.found!.name)!;
  md.push(
    `| ${i + 1} | ${p.found.name} | ${p.peakScoreOrient} -> ${p.peakScore} | ${p.peakHourOrient}:00 -> ${p.peakHour}:00 | ${bw(p.bestWindowOrient)} -> ${bw(p.bestWindow)} | ${c.material ? 'YES' : 'no'} | ${c.note} |`,
  );
}
md.push('');
md.push(`**${materialCount} of 12** predictions changed materially after wiring shadow in.`);
md.push('');

md.push('## Hourly score curves — POST-SHADOW (Amsterdam local time)');
md.push('');
md.push('For drill-down — useful when the verdict is borderline. These are the shadow-aware scores (what the app shows).');
md.push('');
md.push('| # | Terrace | ' + Array.from({ length: 16 }, (_, k) => `${k + 6}:00`).join(' | ') + ' |');
md.push('| ---: | --- | ' + Array.from({ length: 16 }, () => '---:').join(' | ') + ' |');
for (let i = 0; i < picks.length; i++) {
  const p = picks[i]!;
  if (!p.found) continue;
  const row = [`${i + 1}`, p.found.name];
  for (let h = 6; h <= 21; h++) row.push(p.hourly[h]!.toFixed(2));
  md.push('| ' + row.join(' | ') + ' |');
}
md.push('');
md.push('### For comparison — orientation-only curves (pre-shadow)');
md.push('');
md.push('| # | Terrace | ' + Array.from({ length: 16 }, (_, k) => `${k + 6}:00`).join(' | ') + ' |');
md.push('| ---: | --- | ' + Array.from({ length: 16 }, () => '---:').join(' | ') + ' |');
for (let i = 0; i < picks.length; i++) {
  const p = picks[i]!;
  if (!p.found) continue;
  const row = [`${i + 1}`, p.found.name];
  for (let h = 6; h <= 21; h++) row.push(p.hourlyOrient[h]!.toFixed(2));
  md.push('| ' + row.join(' | ') + ' |');
}
md.push('');

md.push('## Tally');
md.push('');
md.push('After verifying, fill in:');
md.push('');
md.push('- check matched: __ / 12');
md.push('- cross failed:  __ / 12');
md.push('- ? borderline: __ / 12');
md.push('- Skipped (cloudy actual day): __ / 12');
md.push('');
md.push('**Verdict (>=10/12 match = green):** ____');
md.push('');
md.push('## Notes on misses');
md.push('');
md.push('For each cross, write one line explaining what was off. Patterns to watch for:');
md.push('- Predicted sunny but actually shaded → with shadow now wired in, this should be RARER than the pre-shadow run; if it still happens, the building height/poly for the blocker may be wrong or missing.');
md.push('- Predicted shaded but actually sunny → could indicate wrong `facing` field, or an over-aggressive building (too tall / too close) in buildings.json.');
md.push('- Timing off by ~1h → triple-check, then revisit B1 (timezone) just in case.');

writeFileSync(join(OUT_DIR, 'spotcheck.md'), md.join('\n'));

console.log(
  `spotcheck.md (post-shadow) written for ${DATE}; ${picks.filter((p) => p.found).length}/12 resolved; ${materialCount}/12 changed materially.`,
);
