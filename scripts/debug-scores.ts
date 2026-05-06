/**
 * One-off diagnostic to investigate the "all terraces same score" complaint.
 * Run via `npx tsx scripts/debug-scores.ts`.
 */

import { TERRACES } from '../src/data/terraces';
import { getBuildings } from '../src/data/buildings';
import { computeSunScore } from '../src/engines/scoring';

const buildings = getBuildings();
console.log('Buildings:', buildings.length);

const dateStr = '2026-05-04';
const hour = 14;

const scores = TERRACES.map((t) => {
  const r = computeSunScore(t, buildings, hour, dateStr, 'sunny');
  return {
    id: t.id,
    name: t.name,
    facing: t.facing,
    score: r.score,
    coverage: r.shadow,
    inShadow: r.shadow >= 0.5,
    sunAlt: r.sun.altitude,
  };
});

const buckets: Record<string, number> = {};
for (const s of scores) {
  const k = String(Math.round(s.score * 20) * 5);
  buckets[k] = (buckets[k] || 0) + 1;
}
console.log(`\nScore distribution at ${hour}:00 (rounded to 5%):`);
for (const k of Object.keys(buckets).sort((a, b) => Number(a) - Number(b))) {
  console.log(
    '  ' + k.padStart(3) + '%:',
    '*'.repeat(Math.min(60, buckets[k]!)),
    buckets[k],
  );
}

const inShadow = scores.filter((s) => s.inShadow).length;
console.log(
  '\nIn shadow:',
  inShadow,
  '/',
  scores.length,
  '=',
  ((inShadow / scores.length) * 100).toFixed(0) + '%',
);

const facingScores: Record<string, number[]> = {};
for (const s of scores) {
  if (!facingScores[s.facing]) facingScores[s.facing] = [];
  facingScores[s.facing]!.push(s.score);
}
console.log('\nMean score by facing:');
for (const f of Object.keys(facingScores).sort()) {
  const arr = facingScores[f]!;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  console.log(
    '  ' + f.padEnd(4),
    'mean=' + mean.toFixed(3),
    'min=' + min.toFixed(3),
    'max=' + max.toFixed(3),
    '(n=' + arr.length + ')',
  );
}

console.log('\nSample of 10 random terraces:');
for (let i = 0; i < 10; i++) {
  const s = scores[Math.floor(Math.random() * scores.length)]!;
  console.log(
    '  ',
    s.name.padEnd(35).slice(0, 35),
    s.facing.padEnd(3),
    'score=' + s.score.toFixed(3),
    s.inShadow ? '[SHADOW]' : '',
  );
}
