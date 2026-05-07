#!/usr/bin/env tsx
/**
 * Import the outdoor-TV-screen counts onto terraces.json for the World
 * Cup 2026 launch filter.
 *
 * Source: hand-curated list (`OUTDOOR_TV_VENUES` below) compiled from:
 *   - vrijetijdamsterdam.nl/sports/groot-scherm-in-amsterdam/
 *   - yourlittleblackbook.me/en/ek-voetbal-kijken-amsterdam/
 *   - girlswhomagazine.nl/ek-kijken-op-groot-scherm-amsterdam-2024/
 *   - yourdailylife.nl/op-deze-plekken-kijk-je-het-ek-voetbal-in-amsterdam/
 *
 * Match strategy: diacritic-folded substring/prefix match against the
 * terrace name. We don't have placeIds for the source listings, so name
 * matching is the lever. Conservative — only commit when we have a
 * high-confidence match (substring match on a name normalised to
 * lowercase ASCII letters/digits, with at least 5 matched characters
 * to avoid false positives like "Café" matching every terrace).
 *
 * Run with --apply to write changes; default is --dry-run.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Terrace } from '../src/engines/types';

const TERRACES_PATH = join(process.cwd(), 'src', 'data', 'terraces.json');

interface SourceVenue {
  /** Name as listed in the source. */
  name: string;
  /** Number of outdoor screens. */
  outdoorScreens: number;
  /** Free-text neighborhood hint to disambiguate name collisions. */
  area?: string;
  /** Non-canonical aliases that increase match coverage. */
  aliases?: string[];
}

/**
 * The hand-curated source list. Conservative counts — when sources
 * disagreed, took the median; when only one source mentioned a venue,
 * trusted it.
 */
const OUTDOOR_TV_VENUES: SourceVenue[] = [
  { name: 'Westergasterras', area: 'Westerpark', outdoorScreens: 2 },
  { name: 'IJver', area: 'NDSM', outdoorScreens: 2 },
  { name: 'Strandzuid', area: 'Zuid', outdoorScreens: 2, aliases: ['Strand Zuid'] },
  { name: 'Breman Brasserie', area: 'Lloyd / Museumkwartier', outdoorScreens: 1 },
  { name: 'Vondeltuin', area: 'Vondelpark', outdoorScreens: 1 },
  { name: 'Bar Kantoor', area: 'Westerpark', outdoorScreens: 1 },
  { name: 'Westerunie', area: 'Westerpark', outdoorScreens: 1, aliases: ['Wester Unie'] },
  { name: 'Deck Amsterdam', area: 'Noord', outdoorScreens: 1 },
  { name: "Vooges aan 't IJ", area: 'Centrum', outdoorScreens: 1, aliases: ['Vooges aan t IJ', 'Vooges'] },
  { name: 'Radio Radio', area: 'Westerpark', outdoorScreens: 1 },
  { name: 'Lagerwal Noord', area: 'Noord', outdoorScreens: 1, aliases: ['Lagerwal'] },
  { name: 'Café Schinkelhaven', area: 'Schinkel', outdoorScreens: 1, aliases: ['Schinkelhaven'] },
  { name: 'Café Nassau', area: 'Staatsliedenbuurt', outdoorScreens: 1 },
];

/**
 * Venues missing from terraces.json that we want to add specifically
 * for the World Cup launch. Coordinates from Nominatim / OSM (Klönneplein
 * geocode for the Westergasfabriek complex). Capacity / facing chosen
 * conservatively for large open-area venues — they're all big terraces
 * with seating in multiple directions, so 'All' facing is honest.
 *
 * Auto-applied by the script: appends these to terraces.json (if not
 * already there by name), then re-runs matching so they pick up their
 * outdoorScreens count from OUTDOOR_TV_VENUES above.
 */
const MISSING_TERRACES: Pick<
  Terrace,
  'name' | 'lat' | 'lng' | 'area' | 'facing' | 'capacity' | 'vibe' | 'address' | 'verified'
>[] = [
  {
    name: 'Westergasterras',
    lat: 52.3870141,
    lng: 4.8699152,
    area: 'Westerpark',
    facing: 'All',
    capacity: 'L',
    vibe: 'Cozy restaurant on the historic Westergasfabriek grounds, large terrace, big screen for matches',
    address: 'Klönneplein 4-6',
    verified: true,
  },
  {
    name: 'Westerunie',
    lat: 52.3868,
    lng: 4.8695,
    area: 'Westerpark',
    facing: 'All',
    capacity: 'L',
    vibe: 'Events venue with large outdoor terrace, big screen for international matches',
    address: 'Klönneplein 1',
    verified: true,
  },
  {
    name: 'Vondeltuin',
    lat: 52.3549253,
    lng: 4.8565105,
    area: 'Vondelpark',
    facing: 'SW',
    capacity: 'L',
    vibe: 'Café in southern Vondelpark, picnic tables, outdoor screen for big matches',
    address: 'Vondelpark 7',
    verified: true,
  },
  {
    name: 'Radio Radio',
    lat: 52.3860704,
    lng: 4.8740538,
    area: 'Westerpark',
    facing: 'S',
    capacity: 'M',
    vibe: 'Bar with outdoor terrace at Westergasfabriek, pizza and football on the screen',
    address: 'Pazzanistraat 3',
    verified: true,
  },
];

/** Normalise a name for fuzzy matching: NFD + drop accents + lowercase + keep alnum. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

interface Match {
  venue: SourceVenue;
  terrace: Terrace;
  reason: string;
}

function findMatch(venue: SourceVenue, terraces: Terrace[]): Match | null {
  const candidates = [venue.name, ...(venue.aliases ?? [])].map(fold);

  // Highest-confidence first: exact folded match on full name.
  for (const folded of candidates) {
    const hit = terraces.find((t) => fold(t.name) === folded);
    if (hit) return { venue, terrace: hit, reason: 'exact-name' };
  }

  // Substring with ≥ 5 matched chars + area sanity check (when provided).
  for (const folded of candidates) {
    if (folded.length < 5) continue;
    const hits = terraces.filter((t) => {
      const tn = fold(t.name);
      return tn.includes(folded) || folded.includes(tn);
    });
    if (hits.length === 0) continue;
    if (hits.length === 1) {
      return { venue, terrace: hits[0]!, reason: 'substring' };
    }
    // Multiple hits — disambiguate by area hint.
    if (venue.area) {
      const areaFolded = fold(venue.area);
      const areaMatch = hits.find((t) => {
        const af = fold(t.area);
        return af.includes(areaFolded) || areaFolded.includes(af);
      });
      if (areaMatch) {
        return { venue, terrace: areaMatch, reason: 'substring+area' };
      }
    }
  }

  return null;
}

function main(): void {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');

  const terraces = JSON.parse(readFileSync(TERRACES_PATH, 'utf-8')) as Terrace[];
  console.log(`Loaded ${terraces.length} terraces.`);
  console.log(`Source list: ${OUTDOOR_TV_VENUES.length} outdoor-TV venues.\n`);

  // Append any MISSING_TERRACES not already present by folded name.
  let nextId = Math.max(...terraces.map((t) => t.id)) + 1;
  let imported = 0;
  for (const m of MISSING_TERRACES) {
    const folded = fold(m.name);
    const exists = terraces.some((t) => fold(t.name) === folded);
    if (exists) continue;
    terraces.push({
      id: nextId++,
      ...m,
      coordSource: 'manual',
      verifiedAt: new Date().toISOString(),
    } as Terrace);
    imported++;
  }
  if (imported > 0) {
    console.log(`Imported ${imported} missing terraces (Westergasterras / Vondeltuin / etc).\n`);
  }

  const matched: Match[] = [];
  const unmatched: SourceVenue[] = [];

  for (const v of OUTDOOR_TV_VENUES) {
    const m = findMatch(v, terraces);
    if (m) matched.push(m);
    else unmatched.push(v);
  }

  console.log(`Matched: ${matched.length} / ${OUTDOOR_TV_VENUES.length}`);
  for (const m of matched) {
    console.log(
      `  [${m.reason.padEnd(15)}] ${m.venue.name} → id=${m.terrace.id} ${m.terrace.name} (${m.terrace.area}) — ${m.venue.outdoorScreens} outdoor screen(s)`,
    );
  }

  if (unmatched.length > 0) {
    console.log(`\nUnmatched (${unmatched.length}):`);
    for (const v of unmatched) {
      console.log(`  ${v.name} (${v.area ?? '?'}) — ${v.outdoorScreens} outdoor screen(s)`);
    }
    console.log(
      '  (these venues either aren\'t in terraces.json, or fuzzy match' +
        ' didn\'t catch them; add aliases or import them)',
    );
  }

  if (verbose) {
    console.log('\nAll terrace names containing "wester" / "strand" / "vondel":');
    for (const t of terraces) {
      const f = fold(t.name);
      if (f.includes('wester') || f.includes('strand') || f.includes('vondel')) {
        console.log(`  id=${t.id}  ${t.name}  (${t.area})`);
      }
    }
  }

  if (!apply) {
    console.log('\nDry-run; pass --apply to write changes.');
    return;
  }

  const verifiedAt = new Date().toISOString();
  let updated = 0;
  for (const m of matched) {
    const target = terraces.find((t) => t.id === m.terrace.id);
    if (!target) continue;
    target.outdoorScreens = m.venue.outdoorScreens;
    target.outdoorScreensVerifiedAt = verifiedAt;
    updated++;
  }

  writeFileSync(TERRACES_PATH, JSON.stringify(terraces, null, 2) + '\n');
  console.log(`\nWrote ${updated} updated terraces to ${TERRACES_PATH}.`);
}

main();
