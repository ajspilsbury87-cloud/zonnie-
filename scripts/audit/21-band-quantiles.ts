/** 21 — quantiles to choose recalibrated band thresholds (finding 20, fix B). */
import { computeSunScore } from '../../src/engines/scoring';
import { getBuildingsForTerrace } from '../../src/data/buildings';
import { getTreesForTerrace } from '../../src/data/trees';
import { TERRACES } from '../../src/data/terraces';

for (const hour of [14, 17]) {
  const s = TERRACES.map((t) =>
    computeSunScore(t, hour, '2026-06-13', 'sunny', undefined,
      getBuildingsForTerrace(t.id), getTreesForTerrace(t.id)).score,
  ).sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor(s.length * p)]!.toFixed(3);
  console.log(`H${hour}: p50=${q(0.5)} p60=${q(0.6)} p70=${q(0.7)} p75=${q(0.75)} p80=${q(0.8)} p85=${q(0.85)} p90=${q(0.9)} p95=${q(0.95)} max=${s[s.length - 1]!.toFixed(3)}`);
  for (const th of [0.72, 0.75, 0.78, 0.8, 0.82]) {
    console.log(`   full>${th} → ${((s.filter((v) => v > th).length / s.length) * 100).toFixed(0)}%`);
  }
}
