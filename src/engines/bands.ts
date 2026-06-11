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
 * Boundary semantics: strict `>` — a score of exactly 0.7 is NOT 'full'.
 * This matches the original `scoreLabel()` / `bandForScore()` implementations
 * in each of the four call sites; preserving strict > keeps behaviour
 * identical after the consolidation.
 *
 * @param score  0–1 normalised sun score (NaN-safe: NaN → 'shade')
 */
export function bandForScore(score: number): ScoreBand {
  if (score > 0.7) return 'full';
  if (score > 0.5) return 'mostly';
  if (score > 0.3) return 'partial';
  if (score > 0.1) return 'mshade';
  return 'shade';
}
