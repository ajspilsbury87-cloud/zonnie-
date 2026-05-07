#!/usr/bin/env tsx
/**
 * Evening-score sanity probe.
 *
 * Andy reported scores around 28% for the 18:00 → sunset window on a
 * sunny day, which feels low for what's actually a pleasant golden-hour
 * terrace experience in May. This script:
 *
 *   1. Lists the top 10 ranked terraces for the 18-21h average on
 *      tomorrow's date with the sunny weather profile.
 *   2. Shows the per-hour score breakdown for each so we can see WHERE
 *      the drop is — sun altitude factor vs facing penalty vs shadow.
 *   3. Compares against what a "comfort curve" (sqrt(alt/90)) would
 *      give, as a hypothetical fix that lifts low-altitude scores
 *      without touching mid-day scores much.
 */

import { TERRACES } from '../src/data/terraces';
import { getBuildingsForTerrace } from '../src/data/buildings';
import { computeSunScore, scoreLabel } from '../src/engines/scoring';
import { solarPosition } from '../src/engines/solar';
import { amsterdamLocalToUtc } from '../src/engines/scoring';

const DATE = '2026-05-08'; // Andy: "tomorrow when it's meant to be a bit more sunny"

console.log(`Probing evening 18-21h on ${DATE} (sunny profile)\n`);

// ─── Sun position by hour ─────────────────────────────────────────────────
console.log('Sun position by hour (city center):');
console.log('Hour   Altitude  Azimuth  Direction');
for (let h = 17; h <= 22; h++) {
  const utc = amsterdamLocalToUtc(DATE, h);
  const sun = solarPosition(utc, 52.3676, 4.9041);
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const dir = dirs[Math.round(sun.azimuth / 45)];
  console.log(
    `${h.toString().padStart(4)}:00  ${sun.altitude.toFixed(1).padStart(5)}°    ${sun.azimuth.toFixed(0).padStart(3)}°    ${dir}`,
  );
}

// ─── Score every terrace, 18-21h average ─────────────────────────────────
const scored = TERRACES.map((t) => {
  const tBuildings = getBuildingsForTerrace(t.id);
  let sum = 0;
  const perHour: number[] = [];
  for (let h = 18; h <= 21; h++) {
    const s = computeSunScore(t, tBuildings, h, DATE, 'sunny').score;
    perHour.push(s);
    sum += s;
  }
  return { t, avg: sum / 4, perHour };
});
scored.sort((a, b) => b.avg - a.avg);

console.log('\nTop 15 terraces by 18-21h average:');
console.log(
  'Rank  Score  Label              Facing  Per-hour (18, 19, 20, 21)         Name (area)',
);
for (let i = 0; i < 15; i++) {
  const { t, avg, perHour } = scored[i]!;
  const pct = Math.round(avg * 100);
  const label = scoreLabel(avg).padEnd(17);
  const hourly = perHour.map((s) => Math.round(s * 100).toString().padStart(2)).join(' ');
  console.log(
    `${(i + 1).toString().padStart(4)}  ${pct.toString().padStart(3)}%   ${label}  ${t.facing.padEnd(3)}     ${hourly}                         ${t.name.slice(0, 30)} (${t.area})`,
  );
}

// ─── Histogram for the evening window ─────────────────────────────────
const buckets: Record<string, number> = {};
for (const s of scored) {
  const k = (Math.round(s.avg * 20) * 5).toString().padStart(3);
  buckets[k] = (buckets[k] || 0) + 1;
}
console.log('\nDistribution at 18-21h average (5% bins):');
const max = Math.max(...Object.values(buckets));
for (const k of Object.keys(buckets).sort((a, b) => Number(a) - Number(b))) {
  const c = buckets[k]!;
  const bar = '█'.repeat(Math.round((c / max) * 50));
  console.log(`  ${k}%  ${bar} ${c}`);
}

// ─── Hypothetical "comfort curve" comparison ──────────────────────────
//
// Current altitude factor: min(1, alt / 60). At alt 25°, factor = 0.42.
// Proposed: sqrt(alt / 90). At alt 25°, factor = 0.527 — uplifts the
// low-altitude regime without exceeding 1.0 even at zenith. Removes the
// hard cap at 60°, which spreads top scores too.
console.log('\nWhat the same data would look like with a sqrt(alt/90) curve:');
const ALT_CEILING = 60;
const sample = scored.slice(0, 15);
console.log('Rank  Current  Proposed  Δ      Name');
for (let i = 0; i < sample.length; i++) {
  const { t, avg } = sample[i]!;
  const tBuildings = getBuildingsForTerrace(t.id);
  // Recompute with sqrt curve. We can't easily monkey-patch
  // computeSunScore; instead, replicate just the altitude factor swap
  // and apply the same other multipliers.
  let sum = 0;
  for (let h = 18; h <= 21; h++) {
    const r = computeSunScore(t, tBuildings, h, DATE, 'sunny');
    if (r.sun.altitude <= 0) continue;
    // Current factor that contributed to r.score:
    const currentAlt = Math.min(1, r.sun.altitude / ALT_CEILING);
    // Proposed factor:
    const proposedAlt = Math.sqrt(Math.max(0, r.sun.altitude) / 90);
    // Replace the altitude term: scaled by (proposedAlt / currentAlt)
    if (currentAlt > 0) sum += r.score * (proposedAlt / currentAlt);
  }
  const proposed = sum / 4;
  const cur = Math.round(avg * 100);
  const prop = Math.round(proposed * 100);
  console.log(
    `${(i + 1).toString().padStart(4)}  ${cur.toString().padStart(3)}%     ${prop.toString().padStart(3)}%      ${(prop - cur >= 0 ? '+' : '')}${prop - cur}     ${t.name.slice(0, 35)}`,
  );
}
