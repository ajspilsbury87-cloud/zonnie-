/**
 * Hidden-gem ranking helpers.
 *
 * When the 💎 chip is active, terraces are re-ranked by `gemScore` rather than
 * plain sun score. The goal is to surface "sunny AND not tourist-rammed" spots.
 *
 * Formula:
 *   gemScore = sunScore * 0.6 + (1 - touristProxy) * 0.25 + ratingNorm * 0.15
 *
 * Weight rationale: sun is still the primary signal (60 %) because that's the
 * core Zonnie promise. "Not tourist-y" gets 25 % — enough to meaningfully
 * reorder equal-sun terraces but not enough to surface a shaded alley over a
 * sunny Centrum terrace. Rating quality gets 15 % — a small nudge toward
 * well-regarded spots over no-name filler.
 *
 * touristProxy ∈ [0,1] is a blend of three independent signals:
 *   0.50 × reviewCountPercentile — how many people have reviewed this place?
 *        High review count ≈ high tourist footfall. Percentile bucketing keeps
 *        the signal comparable across the full dataset rather than raw counts,
 *        which are dominated by outliers (some venues have 30 000+ reviews).
 *   0.25 × proximityToCentrum — distance from the Dam/Centrum centroid
 *        (52.3727, 4.8936). Closer to Centrum ≈ more tourist traffic. Normalised
 *        and clamped over a 0–4 km practical range: a terrace at the Dam scores
 *        1.0, one 4 km or more away scores 0.0.
 *   0.25 × areaWeight — a small hardcoded per-neighbourhood weight that captures
 *        structural tourist footprint not visible from review counts alone.
 *        Calibrated from area average review counts and known Amsterdam tourist
 *        heatmaps. Falls back to AREA_WEIGHT_DEFAULT (0.4) for unlisted areas.
 *
 * DISPLAYED SCORE in the UI stays the plain sun score. gemScore only affects
 * LIST ORDER and MAP PIN ORDER when the chip is active. We do not lie about sun.
 */

import type { Terrace } from '@/src/engines/types';
import { TERRACES } from '@/src/data/terraces';

// ─── Area-weight table ────────────────────────────────────────────────────────
//
// Each value is the "tourist-footprint weight" for that neighbourhood.
// 0 = purely local enclave, 1 = fully tourist. Unlisted areas get
// AREA_WEIGHT_DEFAULT (0.4) — intentionally neutral, not penalising.
//
// Calibration (all 32 areas from terraces.json cross-checked):
//   - Area average Google review count computed from the full dataset
//   - Known Amsterdam tourist heatmaps (Dam, Red Light, Leidseplein, Vondelpark)
//   - De Wallen is contained in the "Centrum" area in the data; no separate key
//   - 9 Straatjes sits inside Centrum/Jordaan overlap; its per-area avg is ~1 700
//     reviews (top 3 in dataset) so it gets near-Centrum weight
//   - Rembrandtplein: highest avg review count in dataset (1 893) → 0.9
//   - Noord / Oost / West are outer residential; avg 500–900 reviews → 0.2
//   - Nieuw-West / Bos en Lommer: very local, avg 100–230 reviews → 0.1

export const AREA_WEIGHT_DEFAULT = 0.4;

export const AREA_WEIGHTS: Readonly<Record<string, number>> = {
  // High tourist footprint
  'Centrum':         0.9,
  'Rembrandtplein':  0.9,
  'Leidseplein':     0.85,
  '9 Straatjes':     0.8,
  // Mid-high — tourist-aware but still mixed
  'Jordaan':         0.55,
  'De Pijp':         0.5,
  'Plantage':        0.5,
  'Oud-West':        0.45,
  'Amstel':          0.45,
  // Mid — mostly local with some tourist spill
  'Westerpark':      0.35,
  'Haarlemmerbrt':   0.35,
  'Vondelpark':      0.35,
  'Oud-Zuid':        0.35,
  'Houthavens':      0.35,
  'Rivierenbuurt':   0.3,
  'Stadionbuurt':    0.3,
  'Spaarndammer':    0.3,
  'Zuid':            0.3,
  'Zuidas':          0.25,
  // Low tourist footprint — local neighbourhoods
  'Noord':           0.2,
  'Oost':            0.2,
  'West':            0.2,
  'De Baarsjes':     0.2,
  'IJburg':          0.2,
  'Indische Buurt':  0.2,
  'Zeeburgereiland': 0.2,
  'Amstelkwartier':  0.15,
  'Watergraafsmeer': 0.15,
  // Very local
  'Bos en Lommer':   0.1,
  'Nieuw-West':      0.1,
  'Buitenveldert':   0.1,
  'Sloterdijk':      0.1,
};

// ─── Centrum centroid ─────────────────────────────────────────────────────────
// Approximate centre of tourist-dense Amsterdam (near Dam Square / Nieuwendijk).
// Chosen as the "touristy gravity well" rather than the precise geographic centre.

const CENTRUM_LAT = 52.3727;
const CENTRUM_LNG = 4.8936;

// Practical normalisation range in metres. At 0 m → 1.0 (max touristy).
// At PROX_MAX_M or beyond → 0.0. 4 000 m covers the outer Amsterdam ring.
const PROX_MAX_M = 4000;

// ─── Distance helper ─────────────────────────────────────────────────────────
// Flat-earth formula matching useScoredTerraces — accurate to <0.5% within AMS.

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_AT_AMS = 111320 * Math.cos(52.37 * (Math.PI / 180));

function distanceMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lng2 - lng1) * M_PER_DEG_LNG_AT_AMS;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Tourist proxy components ─────────────────────────────────────────────────

/** Returns the area-weight for a terrace's neighbourhood, default 0.4. */
export function areaWeightForArea(area: string): number {
  return AREA_WEIGHTS[area] ?? AREA_WEIGHT_DEFAULT;
}

/**
 * proximityToCentrum ∈ [0,1].
 * 1.0 = right at the Centrum centroid (very touristy by location).
 * 0.0 = 4 km or more away (outer neighbourhoods).
 */
export function proximityToCentrum(lat: number, lng: number): number {
  const d = distanceMetres(lat, lng, CENTRUM_LAT, CENTRUM_LNG);
  return Math.max(0, 1 - d / PROX_MAX_M);
}

// ─── Review-count percentile map ─────────────────────────────────────────────
//
// Built once at module load time from the static TERRACES dataset.
//
// Percentile = fraction of terraces with review count ≤ this terrace's count.
// Terraces with no googleReviewCount are treated as count 0 (≈ percentile 0),
// which places them on the gem-friendly side — undiscovered, not penalised.

function buildReviewPercentileMap(terraces: readonly Terrace[]): Map<number, number> {
  const counts: Array<{ id: number; count: number }> = terraces.map((t) => ({
    id: t.id,
    count: t.googleReviewCount ?? 0,
  }));
  const sorted = [...counts].sort((a, b) => a.count - b.count);
  const n = sorted.length;
  const map = new Map<number, number>();
  let i = 0;
  while (i < n) {
    // Find the end of the current tie group (same count value).
    let j = i;
    const tieCount = sorted[i]!.count;
    while (j < n && sorted[j]!.count === tieCount) j++;
    // All members of the tie group get the percentile of the last member.
    const percentile = j / n;
    for (let k = i; k < j; k++) {
      map.set(sorted[k]!.id, percentile);
    }
    i = j;
  }
  return map;
}

/**
 * Percentile map keyed by terrace ID. Computed once on module load.
 * Look-up is O(1) at runtime.
 */
export const REVIEW_PERCENTILE_MAP: ReadonlyMap<number, number> =
  buildReviewPercentileMap(TERRACES);

// ─── Core scoring helpers ─────────────────────────────────────────────────────

/**
 * touristProxy ∈ [0,1].
 * Blends three independent signals; see module-level comment for rationale.
 * Weights: 0.50 × reviewCountPercentile + 0.25 × proximity + 0.25 × areaWeight.
 */
export function computeTouristProxy(terrace: Terrace): number {
  const reviewCountPercentile = REVIEW_PERCENTILE_MAP.get(terrace.id) ?? 0;
  const prox = proximityToCentrum(terrace.lat, terrace.lng);
  const areaW = areaWeightForArea(terrace.area);
  return (
    0.5 * reviewCountPercentile +
    0.25 * prox +
    0.25 * areaW
  );
}

/**
 * ratingNorm ∈ [0,1].
 * Normalises googleRating over [3.5, 5.0]. Ratings below 3.5 clamp to 0.
 * No rating → 0.5 (neutral: don't penalise unverified gems).
 */
export function ratingNorm(terrace: Terrace): number {
  if (terrace.googleRating == null) return 0.5;
  return Math.max(0, Math.min(1, (terrace.googleRating - 3.5) / 1.5));
}

/**
 * gemScore ∈ [0,1].
 * The sort key used when the 💎 chip is active.
 *
 * IMPORTANT: the displayed sun score is still `sunScore`, not `gemScore`.
 * This value is used purely for ordering and inclusion decisions — the user
 * always sees accurate sun information; gem mode only changes who appears first.
 */
export function computeGemScore(sunScore: number, terrace: Terrace): number {
  const proxy = computeTouristProxy(terrace);
  const rNorm = ratingNorm(terrace);
  return sunScore * 0.6 + (1 - proxy) * 0.25 + rNorm * 0.15;
}

/**
 * Tourist-trap floor. Terraces whose touristProxy exceeds this threshold are
 * excluded when gem mode is active — they are too tourist-heavy to qualify as
 * hidden gems regardless of sun score.
 *
 * Calibration (2026-06-18, 974 terraces):
 *   Distribution analysis showed:
 *     0.85 → 59 excluded  (6.1%)  — old value, far too permissive
 *     0.60 → 286 excluded (29.4%) — chosen: top ~30% most touristy cut
 *     0.65 → 228 excluded (23.4%) — runner-up
 *
 * At 0.60 the excluded venues are clearly tourist-saturated
 * (O'Reilly's, Pancakes Amsterdam, Bulldog, Café de Jaren, NEMO Rooftop…).
 * ~688 terraces remain — still a rich and useful hidden-gem list.
 *
 * TO REVERT: change 0.60 back to 0.85.
 */
export const TOURIST_TRAP_FLOOR = 0.60;
