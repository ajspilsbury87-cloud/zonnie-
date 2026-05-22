/**
 * Tree data for canopy shadow modelling.
 *
 * Source: Gemeente Amsterdam Bomenkaart (municipal tree registry).
 * Populated by `python scripts/fetch-bomenkaart-trees.py`, which
 * downloads every tree from the WFS service at data.amsterdam.nl,
 * matches each to nearby terraces (within 150 m), and writes the
 * keyed output here.
 *
 * Schema: { "<terraceId>": [{ lat, lng, height, crownRadius, trunkHeight? }, ...] }
 *
 * Empty object ({}) is the valid "no data yet" state — the shadow engine
 * returns 0 tree coverage when the array is empty, so scores are unaffected
 * until the data pipeline has been run.
 *
 * Why pre-compute per terrace: same rationale as buildings.ts — scanning
 * ~70K Amsterdam trees on every score calculation would be prohibitive.
 * Pre-computing the nearby subset at data-prep time keeps runtime cost
 * constant per terrace.
 */

import type { Tree } from '@/src/engines/types';

let treesByTerrace: Record<string, Tree[]> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require('./trees.json');
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    treesByTerrace = raw as Record<string, Tree[]>;
  }
} catch {
  // trees.json missing — treat as empty; no tree shadow contribution.
}

/**
 * Trees nearby to a specific terrace (within 150 m), as pre-computed by
 * the Bomenkaart fetch script. Returns an empty array when no data is
 * available for this terrace (either the script hasn't been run, or there
 * are genuinely no trees within range).
 */
export function getTreesForTerrace(terraceId: number): Tree[] {
  if (!treesByTerrace) return [];
  return treesByTerrace[String(terraceId)] ?? [];
}

/** Returns true if real Bomenkaart data is loaded (vs no-tree fallback). */
export function isUsingRealTreeData(): boolean {
  return treesByTerrace != null && Object.keys(treesByTerrace).length > 0;
}
