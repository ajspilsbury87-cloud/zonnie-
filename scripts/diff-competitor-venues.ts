/**
 * Diff Seats-in-the-Sun's 1,095 Amsterdam venues against our 378-curated set.
 *
 * Match by name (folded, diacritic-insensitive) AND proximity (<60m). When
 * either condition matches uniquely, we count it as the same venue. Output
 * lists places in their dataset that are NOT in ours — these are leads for
 * adding to Zonnie's curated set.
 *
 * Filters out obvious noise: chains, museums, train stations, hotels-as-
 * terraces. Categorizes each candidate so a human reviewer can quickly
 * decide which to add.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface OurTerrace {
  id: number;
  name: string;
  lat: number;
  lng: number;
  area: string;
}

interface SitsVenue {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  is_rest?: boolean;
  is_bar?: boolean;
  peak_sun?: number;
  has_description?: boolean;
  url?: string;
}

const PROJECT_ROOT = process.cwd();
const OUR_PATH = join(PROJECT_ROOT, 'src', 'data', 'terraces.json');
const SITS_PATH = join(
  PROJECT_ROOT,
  'scripts',
  'competitor-research',
  'seatsinthesun_amsterdam_full.json',
);

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
  const dx = (b.lng - a.lng) * M_PER_DEG_LNG;
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

const NOISE_PATTERNS = [
  /museum/i,
  /tulip\s*museum/i,
  /cheese/i,
  /railway/i,
  /station/i,
  /^hotel\b/i,
  /^eco\s*hotel/i,
  /amsterdam\s*centraal/i,
  /^the\s*(student|young)/i,
];

const CHAIN_PATTERNS = [
  /^starbucks/i,
  /^bagels?\s*&\s*beans/i,
  /^annemax/i, // multi-location, ambiguous
  /^kfc/i,
  /^mcdonalds/i,
  /^subway$/i,
  /^döner/i,
];

function isLikelyNoise(name: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(name));
}
function isChain(name: string): boolean {
  return CHAIN_PATTERNS.some((p) => p.test(name));
}

function main() {
  const ours = JSON.parse(readFileSync(OUR_PATH, 'utf-8')) as OurTerrace[];
  const theirs = JSON.parse(readFileSync(SITS_PATH, 'utf-8')) as SitsVenue[];

  console.log(`Ours:   ${ours.length} terraces`);
  console.log(`Theirs: ${theirs.length} terraces`);

  // Build name+proximity index of ours.
  const ourFoldedNames = new Set<string>(ours.map((t) => fold(t.name)));

  const matched: SitsVenue[] = [];
  const candidates: SitsVenue[] = [];
  const noise: SitsVenue[] = [];
  const chains: SitsVenue[] = [];

  for (const v of theirs) {
    if (isLikelyNoise(v.name)) {
      noise.push(v);
      continue;
    }
    if (isChain(v.name)) {
      chains.push(v);
      continue;
    }

    const folded = fold(v.name);
    let isMatch = false;

    // 1. Fold-name exact match
    if (ourFoldedNames.has(folded)) {
      isMatch = true;
    } else {
      // 2. Proximity-only — any of our terraces within 30m AND name shares first word?
      const firstWord = folded.split(/\s+/)[0] ?? '';
      for (const ours_t of ours) {
        const d = distMeters(v, ours_t);
        if (d < 30 && fold(ours_t.name).includes(firstWord) && firstWord.length >= 4) {
          isMatch = true;
          break;
        }
      }
    }

    if (isMatch) matched.push(v);
    else candidates.push(v);
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  RESULTS');
  console.log('═'.repeat(60));
  console.log(`  Already in our set:        ${matched.length}`);
  console.log(`  Candidates to consider:    ${candidates.length}`);
  console.log(`  Noise (museums/stations):  ${noise.length}`);
  console.log(`  Chains/multi-location:     ${chains.length}`);
  console.log(
    `  Coverage: ${((matched.length / theirs.length) * 100).toFixed(0)}% of theirs already in ours`,
  );

  // Categorize candidates by sun quality
  const highSun = candidates.filter((c) => (c.peak_sun ?? 0) >= 90);
  const midSun = candidates.filter((c) => (c.peak_sun ?? 0) >= 50 && (c.peak_sun ?? 0) < 90);
  const lowSun = candidates.filter((c) => (c.peak_sun ?? 0) < 50);

  console.log('');
  console.log('  Candidates by peak-sun (theirs):');
  console.log(`    ≥90% peak sun:  ${highSun.length}`);
  console.log(`    50–89%:         ${midSun.length}`);
  console.log(`    <50%:           ${lowSun.length}`);

  // Write candidate JSON with sun quality
  const sortedCandidates = candidates
    .slice()
    .sort((a, b) => (b.peak_sun ?? 0) - (a.peak_sun ?? 0));
  const outPath = join(
    PROJECT_ROOT,
    'scripts',
    'competitor-research',
    'venues-not-in-zonnie.json',
  );
  writeFileSync(outPath, JSON.stringify(sortedCandidates, null, 2) + '\n');
  console.log('');
  console.log(`  Wrote ${outPath}`);

  // Top-30 sample
  console.log('');
  console.log('  Top-30 candidates by their peak-sun:');
  for (const c of sortedCandidates.slice(0, 30)) {
    console.log(
      `    ${(c.peak_sun ?? 0).toString().padStart(3)}%  ${c.name.padEnd(40).slice(0, 40)}  ${(c.lat ?? 0).toFixed(4)},${(c.lng ?? 0).toFixed(4)}`,
    );
  }
}

main();
