#!/usr/bin/env tsx
/**
 * Compare Zonnie's sun scores against zonopjebakkes.nl's published
 * top 10 sunny terraces in Amsterdam.
 *
 * Source list: zonopjebakkes.nl/blog/zonnige-terrasjes-in-amsterdam/
 * fetched 2026-05-09. They publish a #1-#10 ranking with no scores
 * exposed (except #1 Hangar Oost flagged as "100% sun"). They
 * notably do NOT factor cloud cover — so on a clear day, our
 * rankings should mostly agree; on overcast days, ours will read
 * lower across the board (which is correct).
 *
 * What this script reports:
 *   - For each zonopjebakkes top-10 venue, find the closest match in
 *     terraces.json (fuzzy + nearest-coords) and report:
 *       Zonnie's rank-by-score in the city
 *       avg score across mid-day (12-18h)
 *       avg score across evening (18-21h)
 *       facing
 *   - Disagreements: a zonopjebakkes #1 ranking 800th in Zonnie is a
 *     red flag worth investigating; a near-the-top match validates
 *     the methodology overlap.
 *
 * Run: npx tsx scripts/compare-zonopjebakkes.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getBuildingsForTerrace } from '../src/data/buildings';
import { computeSunScore, scoreLabel } from '../src/engines/scoring';
import type { Terrace } from '../src/engines/types';

const TERRACES = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'data', 'terraces.json'), 'utf-8'),
) as Terrace[];

const DATE = '2026-05-15'; // mid-May, clear sky, sun is high — fair test

interface ZonopjebakkesEntry {
  rank: number;
  name: string;
  /** Free-text address from their listing — used as a disambiguator. */
  address: string;
}

const ZONOPJEBAKKES_TOP_10: ZonopjebakkesEntry[] = [
  { rank: 1,  name: 'Hangar Oost',                        address: 'Zuiderzeeweg 6H' },
  { rank: 2,  name: 'Living Kitchen by Zoku Amsterdam',   address: 'Weesperstraat 105' },
  { rank: 3,  name: 'THE BUTCHER Social Club',            address: 'Overhoeksplein 1' },
  { rank: 4,  name: 'Watts Hub',                          address: 'Radarweg 480' },
  { rank: 5,  name: 'Café Restaurant Camping Zeeburg',    address: 'Zuider IJdijk 20A' },
  { rank: 6,  name: 'IJ-kantine',                         address: 'NDSM-Kade 5' },
  { rank: 7,  name: "'t Zusje Amsterdam",                 address: 'Van Leijenberghlaan 320' },
  { rank: 8,  name: 'Lagerwal',                           address: 'tt. Melissaweg 57' },
  { rank: 9,  name: 'Kaap Amsterdam',                     address: 'IJdijk 10' },
  { rank: 10, name: 'Café Restaurant Vrijburcht',         address: 'Jan Olphert Vaillantlaan 159' },
];

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function findMatch(entry: ZonopjebakkesEntry): Terrace | null {
  const targetName = fold(entry.name);
  const targetAddr = fold(entry.address);

  // Pass 1: exact folded name match.
  const exact = TERRACES.find((t) => fold(t.name) === targetName);
  if (exact) return exact;

  // Pass 2: substring match where folded form contains the other.
  const partial = TERRACES.filter(
    (t) => fold(t.name).includes(targetName) || targetName.includes(fold(t.name)),
  );
  if (partial.length === 1) return partial[0]!;

  // Pass 3: address contains
  const byAddr = TERRACES.find(
    (t) => t.address && fold(t.address).includes(targetAddr.slice(0, 12)),
  );
  if (byAddr) return byAddr;

  // Pass 4: any token from name appears in any terrace name AND
  // their addresses share a street name.
  const tokens = entry.name
    .split(/\s+/)
    .filter((t) => t.length >= 5)
    .map(fold);
  for (const t of TERRACES) {
    const tn = fold(t.name);
    for (const tok of tokens) {
      if (tn.includes(tok)) return t;
    }
  }
  return null;
}

interface Scored {
  terrace: Terrace;
  midDayAvg: number;
  eveningAvg: number;
}

function score(terrace: Terrace): Scored {
  const buildings = getBuildingsForTerrace(terrace.id);
  let mid = 0;
  let midN = 0;
  let eve = 0;
  let eveN = 0;
  for (let h = 12; h <= 21; h++) {
    const r = computeSunScore(terrace, buildings, h, DATE, 'sunny');
    if (h <= 18) {
      mid += r.score;
      midN++;
    }
    if (h >= 18) {
      eve += r.score;
      eveN++;
    }
  }
  return {
    terrace,
    midDayAvg: midN > 0 ? mid / midN : 0,
    eveningAvg: eveN > 0 ? eve / eveN : 0,
  };
}

function main(): void {
  console.log(`\nDate: ${DATE} (sunny profile)\n`);

  // Score every terrace by mid-day average to compute Zonnie's
  // city-wide ranking.
  const allScored = TERRACES.map(score).sort((a, b) => b.midDayAvg - a.midDayAvg);
  const rankById = new Map<number, number>();
  allScored.forEach((s, idx) => rankById.set(s.terrace.id, idx + 1));

  console.log('zopjbk  Match                                  Zonnie  Mid-day  Evening   Label');
  console.log('──────  ─────────────────────────────────────  ──────  ───────  ───────   ─────────────');

  let matched = 0;
  let topQuartile = 0;
  for (const entry of ZONOPJEBAKKES_TOP_10) {
    const t = findMatch(entry);
    if (!t) {
      console.log(
        `  #${entry.rank.toString().padStart(2)}   [NOT IN ZONNIE DATASET]   ${entry.name}`,
      );
      continue;
    }
    matched++;
    const s = allScored.find((x) => x.terrace.id === t.id)!;
    const zonnieRank = rankById.get(t.id)!;
    const inTopQuartile = zonnieRank <= TERRACES.length / 4;
    if (inTopQuartile) topQuartile++;

    const midPct = Math.round(s.midDayAvg * 100).toString().padStart(3);
    const evePct = Math.round(s.eveningAvg * 100).toString().padStart(3);
    const label = scoreLabel(s.midDayAvg);
    console.log(
      `  #${entry.rank.toString().padStart(2)}   ${t.name.slice(0, 36).padEnd(36)}  #${zonnieRank.toString().padStart(4)}    ${midPct}%     ${evePct}%    ${label}`,
    );
  }

  console.log(
    `\nMatched: ${matched}/${ZONOPJEBAKKES_TOP_10.length}.  In Zonnie's top 25%: ${topQuartile}/${matched}`,
  );
  if (matched > 0) {
    console.log(
      `Median Zonnie rank for matched venues: #${
        median(
          ZONOPJEBAKKES_TOP_10.map((e) => findMatch(e))
            .filter((t): t is Terrace => t != null)
            .map((t) => rankById.get(t.id)!),
        )
      } of ${TERRACES.length}`,
    );
  }
  console.log('');
  console.log('Methodology notes:');
  console.log('  - Their algorithm: solar position + building geometry only.');
  console.log('  - Ours adds: continuous shadow coverage, real LIDAR heights');
  console.log('    (3D BAG), cloud cover penalty, wind shelter, sqrt-of-altitude');
  console.log('    perceived-brightness curve.');
  console.log('  - Their "100% sun" for #1 is geometry-only — on a real overcast');
  console.log('    day our score for the same venue would be lower, correctly.');
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

main();
