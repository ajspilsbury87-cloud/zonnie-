/**
 * Single source of truth for score-band thresholds.
 *
 * Previously the >0.7 / >0.5 / >0.3 / >0.1 cascade was independently
 * hardcoded in four files (scoring.ts, ZonnieMap.tsx, TerraceDetailSheet.tsx,
 * tokens.ts). Any threshold drift between them would produce label/colour
 * disagreements that are invisible in tests but very visible to users (e.g.
 * a pin coloured "Full Sun" while the detail sheet says "Mostly Sunny").
 *
 * All four call sites now import `bandForScore` from here and switch on its
 * return value to derive their own string / colour / UI treatment. The band
 * boundaries must NOT be changed without also reviewing all four consumers.
 *
 * No imports — this file is pure so it can be imported from anywhere in the
 * tree (engine, component, theme) without creating circular dependencies.
 */

/** Five mutually-exclusive sun-quality bands. */
export type ScoreBand = 'full' | 'mostly' | 'partial' | 'mshade' | 'shade';

/**
 * Map a normalised score [0, 1] to a band.
 *
 * Boundary semantics: strict `>` — a score exactly at a threshold falls to
 * the band below.
 *
 * CALIBRATION (2026-06, audit finding 20 — "everything reads Volle zon"):
 * the original cascade (0.7/0.5/0.3/0.1) predates the shadow + openness
 * factors and put 54–58% of all pins in the top band on a sunny day,
 * destroying the map's discriminating power. Re-measured against the full
 * engine on a sunny June day (scripts/audit/21-band-quantiles.ts):
 *
 *   threshold 0.85 → 'full' ≈ 18% of terraces at 14:00 peak (was 56%)
 *                  → ≈ 3% at 17:00 golden hour — top label is now EARNED.
 *   'mostly' > 0.65 keeps genuinely good evening terraces in the second
 *   band (p50 at 17:00 ≈ 0.64); partial/mshade rescale proportionally.
 *
 * The bands are labels/colours only — raw scores and ranking are untouched.
 *
 * @param score  0–1 normalised sun score (NaN-safe: NaN → 'shade')
 */
export function bandForScore(score: number): ScoreBand {
  if (score > 0.85) return 'full';
  if (score > 0.65) return 'mostly';
  if (score > 0.4) return 'partial';
  if (score > 0.15) return 'mshade';
  return 'shade';
}
