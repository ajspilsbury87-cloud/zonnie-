#!/usr/bin/env tsx
/**
 * A2 — Coordinate sanity.
 *
 * Three sub-sections:
 *
 *   (1) Bounding-box check. Flag any terrace whose (lat, lng) falls
 *       outside the Amsterdam box defined in validate-coords.ts (widened per A2-1),
 *       reproduced verbatim in _placesLookupReadOnly.ts to keep audit
 *       and validator in lock-step.
 *
 *   (2) Distance to nearest building. For each terrace, find the
 *       minimum distance to any building in `getBuildings()` and
 *       histogram. Terraces > 100 m from any building are suspicious
 *       (wrong coords or missing building data).
 *
 *   (3) Places cross-check (auto-run when env is set).
 *       Triggered when `GOOGLE_MAPS_API_KEY` is set. Caps at
 *       `MAX_PLACES_LOOKUPS` (default 100) to avoid quota burn during
 *       routine audit re-runs. Samples terraces with `placeId` already
 *       stored (the strongest cross-check candidates). Compares stored
 *       lat/lng to Places-resolved lat/lng; flags distances > 75 m.
 *
 * Read-only. Writes audit-output/coords.{json,md}.
 *
 * Run: npx tsx scripts/audit/02-coords.ts
 *      (with Places X-check)
 *      $env:GOOGLE_MAPS_API_KEY = "AIza..."; npx tsx scripts/audit/02-coords.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERRACES } from '../../src/data/terraces';
import { getBuildings } from '../../src/data/buildings';
import {
  AMSTERDAM_BOUNDS,
  distanceMeters,
  placesLookupReadOnly,
  FATAL_STATUSES,
  type LookupOutcome,
} from './_placesLookupReadOnly';
import type { Terrace } from '../../src/engines/types';

const OUT_DIR = join(process.cwd(), 'audit-output');
mkdirSync(OUT_DIR, { recursive: true });

const NEAREST_BUILDING_SUSPICIOUS_M = 100;
const PLACES_THRESHOLD_M = 75;
const DEFAULT_MAX_PLACES_LOOKUPS = 100;
const REQUEST_DELAY_MS = 150;

// ── (1) Bounding box check ──────────────────────────────────────────────

interface BboxViolation {
  id: number;
  name: string;
  area: string;
  lat: number;
  lng: number;
}
const bboxViolations: BboxViolation[] = [];
for (const t of TERRACES) {
  if (
    t.lat < AMSTERDAM_BOUNDS.minLat ||
    t.lat > AMSTERDAM_BOUNDS.maxLat ||
    t.lng < AMSTERDAM_BOUNDS.minLng ||
    t.lng > AMSTERDAM_BOUNDS.maxLng
  ) {
    bboxViolations.push({ id: t.id, name: t.name, area: t.area, lat: t.lat, lng: t.lng });
  }
}

// ── (2) Distance to nearest building ────────────────────────────────────
//
// O(N × B) — N=947 terraces, B can be tens of thousands. We trim by
// pre-bucketing buildings into a coarse lat/lng grid (0.005° ≈ 350 m).
// For each terrace, only consider buildings in its bucket + 8 neighbours.

const buildings = getBuildings();
const GRID_DEG = 0.005;
const grid = new Map<string, { lat: number; lng: number }[]>();
for (const b of buildings) {
  const k = `${Math.floor(b.lat / GRID_DEG)}:${Math.floor(b.lng / GRID_DEG)}`;
  (grid.get(k) ?? grid.set(k, []).get(k)!).push({ lat: b.lat, lng: b.lng });
}

function nearestBuildingDist(t: Terrace): number {
  const baseY = Math.floor(t.lat / GRID_DEG);
  const baseX = Math.floor(t.lng / GRID_DEG);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const k = `${baseY + dy}:${baseX + dx}`;
      const bs = grid.get(k);
      if (!bs) continue;
      for (const b of bs) {
        const d = distanceMeters(t.lat, t.lng, b.lat, b.lng);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

interface DistRow { id: number; name: string; area: string; nearestM: number }
const dists: DistRow[] = [];
for (const t of TERRACES) {
  const d = nearestBuildingDist(t);
  dists.push({ id: t.id, name: t.name, area: t.area, nearestM: Number(d.toFixed(2)) });
}
dists.sort((a, b) => b.nearestM - a.nearestM);

// Histogram in 10-metre buckets up to 100, then "100+".
const buckets: Record<string, number> = {};
for (const k of ['0-10', '10-20', '20-30', '30-50', '50-100', '100+']) buckets[k] = 0;
for (const d of dists) {
  if (d.nearestM < 10) buckets['0-10']!++;
  else if (d.nearestM < 20) buckets['10-20']!++;
  else if (d.nearestM < 30) buckets['20-30']!++;
  else if (d.nearestM < 50) buckets['30-50']!++;
  else if (d.nearestM < 100) buckets['50-100']!++;
  else buckets['100+']!++;
}

const suspiciousByDist = dists.filter((d) => d.nearestM > NEAREST_BUILDING_SUSPICIOUS_M);

// ── (3) Places cross-check ──────────────────────────────────────────────

const apiKey = process.env.GOOGLE_MAPS_API_KEY;
const maxLookups = Number.parseInt(process.env.MAX_PLACES_LOOKUPS ?? '', 10) || DEFAULT_MAX_PLACES_LOOKUPS;

interface PlacesCheckResult {
  id: number;
  name: string;
  storedLat: number;
  storedLng: number;
  outcome: 'hit' | 'zero_results' | 'out_of_bounds' | 'api_error' | 'skipped';
  resolvedLat?: number;
  resolvedLng?: number;
  distanceM?: number;
  exceedsThreshold?: boolean;
  errorStatus?: string;
}

const placesResults: PlacesCheckResult[] = [];
let placesSection: 'ran' | 'skipped_no_key' | 'aborted_fatal' = 'skipped_no_key';
let placesAbortReason: string | undefined;

async function runPlacesCheck(): Promise<void> {
  if (!apiKey) {
    placesSection = 'skipped_no_key';
    return;
  }
  placesSection = 'ran';
  // Sample: terraces with stored placeId, capped at maxLookups.
  // Sorted by id for deterministic ordering across runs.
  const candidates = TERRACES.filter((t) => isPresent(t.placeId)).sort((a, b) => a.id - b.id);
  const sample = candidates.slice(0, maxLookups);
  console.log(
    `Places X-check: ${candidates.length} candidates with placeId; sampling ${sample.length} (cap ${maxLookups}).`,
  );
  for (const t of sample) {
    const query = `${t.name} ${t.area}`.trim();
    let outcome: LookupOutcome;
    try {
      outcome = await placesLookupReadOnly(query, apiKey);
    } catch (e) {
      outcome = { kind: 'api_error', error: { status: 'FETCH_FAILED', errorMessage: String(e) } };
    }
    const row: PlacesCheckResult = {
      id: t.id,
      name: t.name,
      storedLat: t.lat,
      storedLng: t.lng,
      outcome: outcome.kind,
    };
    if (outcome.kind === 'hit') {
      const d = distanceMeters(t.lat, t.lng, outcome.result.lat, outcome.result.lng);
      row.resolvedLat = outcome.result.lat;
      row.resolvedLng = outcome.result.lng;
      row.distanceM = Number(d.toFixed(2));
      row.exceedsThreshold = d > PLACES_THRESHOLD_M;
    } else if (outcome.kind === 'out_of_bounds') {
      row.resolvedLat = outcome.lat;
      row.resolvedLng = outcome.lng;
    } else if (outcome.kind === 'api_error') {
      row.errorStatus = outcome.error.status;
      if (FATAL_STATUSES.has(outcome.error.status)) {
        placesSection = 'aborted_fatal';
        placesAbortReason = `${outcome.error.status}: ${outcome.error.errorMessage ?? ''}`;
        placesResults.push(row);
        return;
      }
    }
    placesResults.push(row);
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }
}

function isPresent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.length > 0;
  return true;
}

// ── Run and output ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  await runPlacesCheck();

  const placesHits = placesResults.filter((r) => r.outcome === 'hit');
  const placesOver = placesResults.filter((r) => r.exceedsThreshold);
  const placesErrors = placesResults.filter((r) => r.outcome === 'api_error');
  const placesZero = placesResults.filter((r) => r.outcome === 'zero_results');

  writeFileSync(
    join(OUT_DIR, 'coords.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        bbox: AMSTERDAM_BOUNDS,
        bboxViolations,
        distHistogram: buckets,
        suspiciousByDistance: suspiciousByDist.slice(0, 200),
        places: {
          status: placesSection,
          abortReason: placesAbortReason,
          threshold: PLACES_THRESHOLD_M,
          maxLookups,
          sampleSize: placesResults.length,
          hits: placesHits.length,
          exceedsThreshold: placesOver.length,
          zeroResults: placesZero.length,
          apiErrors: placesErrors.length,
          results: placesResults,
        },
      },
      null,
      2,
    ),
  );

  const md: string[] = [];
  md.push('# A2 — Coordinate sanity');
  md.push('');
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Total terraces: **${TERRACES.length}**`);
  md.push('');

  md.push('## 1. Bounding box check');
  md.push('');
  md.push(
    `Box: lat [${AMSTERDAM_BOUNDS.minLat}, ${AMSTERDAM_BOUNDS.maxLat}], lng [${AMSTERDAM_BOUNDS.minLng}, ${AMSTERDAM_BOUNDS.maxLng}] — kept in sync with validate-coords.ts (widened per audit A2-1).`,
  );
  md.push('');
  if (bboxViolations.length === 0) {
    md.push('**Status:** ✅ All terraces inside Amsterdam bbox.');
  } else {
    md.push(`**Status:** ❌ ${bboxViolations.length} terraces outside the bbox.`);
    md.push('');
    md.push('| ID | Name | Area | Lat | Lng |');
    md.push('| ---: | --- | --- | ---: | ---: |');
    for (const v of bboxViolations.slice(0, 20)) {
      md.push(`| ${v.id} | ${v.name} | ${v.area} | ${v.lat} | ${v.lng} |`);
    }
  }
  md.push('');

  md.push('## 2. Distance to nearest building');
  md.push('');
  md.push(`Threshold: > ${NEAREST_BUILDING_SUSPICIOUS_M} m flagged as suspicious.`);
  md.push('');
  md.push('| Bucket | Count |');
  md.push('| --- | ---: |');
  for (const k of Object.keys(buckets)) md.push(`| ${k} m | ${buckets[k]} |`);
  md.push('');
  md.push(`**${suspiciousByDist.length}** terraces are > ${NEAREST_BUILDING_SUSPICIOUS_M} m from the nearest building.`);
  md.push('');
  if (suspiciousByDist.length > 0) {
    md.push('### Top 20 farthest');
    md.push('');
    md.push('| ID | Name | Area | Nearest building (m) |');
    md.push('| ---: | --- | --- | ---: |');
    for (const r of suspiciousByDist.slice(0, 20)) {
      md.push(`| ${r.id} | ${r.name} | ${r.area} | ${r.nearestM} |`);
    }
    md.push('');
  }

  md.push('## 3. Places cross-check');
  md.push('');
  if (placesSection === 'skipped_no_key') {
    md.push('**Status:** SKIPPED — `GOOGLE_MAPS_API_KEY` is not set in the environment.');
    md.push('');
    md.push('To run this section: `$env:GOOGLE_MAPS_API_KEY = "AIza…"; npm run audit:coords`');
  } else if (placesSection === 'aborted_fatal') {
    md.push(`**Status:** ABORTED — fatal API error \`${placesAbortReason}\`. Stopped early.`);
  } else {
    md.push(`**Status:** RAN — ${placesResults.length} terraces sampled (cap ${maxLookups}, threshold ${PLACES_THRESHOLD_M} m).`);
  }
  md.push('');
  if (placesResults.length > 0) {
    md.push('| Outcome | Count |');
    md.push('| --- | ---: |');
    md.push(`| hit | ${placesHits.length} |`);
    md.push(`| of which exceed ${PLACES_THRESHOLD_M} m | ${placesOver.length} |`);
    md.push(`| zero_results | ${placesZero.length} |`);
    md.push(`| api_error | ${placesErrors.length} |`);
    md.push('');
    if (placesOver.length > 0) {
      md.push('### Terraces whose stored coord disagrees with Places by > threshold');
      md.push('');
      md.push('| ID | Name | Stored | Places | Δm |');
      md.push('| ---: | --- | --- | --- | ---: |');
      for (const r of placesOver.slice(0, 30)) {
        md.push(`| ${r.id} | ${r.name} | (${r.storedLat}, ${r.storedLng}) | (${r.resolvedLat}, ${r.resolvedLng}) | ${r.distanceM} |`);
      }
    }
  }

  writeFileSync(join(OUT_DIR, 'coords.md'), md.join('\n'));

  console.log(
    `coords.md written: bbox-violations=${bboxViolations.length}, far-from-bldg=${suspiciousByDist.length}, places=${placesSection}.`,
  );
}

main().catch((e) => {
  console.error('coord audit failed:', e);
  process.exit(1);
});
