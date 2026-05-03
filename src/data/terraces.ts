/**
 * Typed terrace data loader.
 *
 * Source: `src/data/terraces.json` (453 entries, 361 verified, 92 estimated).
 * Schema: see `src/engines/types.ts` Terrace.
 *
 * Read-only — never mutate the array. Mutation belongs in the validation
 * pipeline (`scripts/validate-coords.ts`).
 */

import type { Terrace } from '@/src/engines/types';
import raw from './terraces.json';

export const TERRACES: readonly Terrace[] = raw as readonly Terrace[];

/**
 * Distinct area names, alphabetically sorted, with 'All' prepended for the UI filter.
 */
export function getAreas(): string[] {
  const set = new Set<string>();
  for (const t of TERRACES) set.add(t.area);
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  return ['All', ...sorted];
}

/**
 * Case-insensitive search across name, area, vibe, and address.
 * Empty/whitespace query → all terraces.
 */
export function searchTerraces(query: string): readonly Terrace[] {
  const q = query.trim().toLowerCase();
  if (!q) return TERRACES;
  return TERRACES.filter((t) => {
    return (
      t.name.toLowerCase().includes(q) ||
      t.area.toLowerCase().includes(q) ||
      t.vibe.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  });
}

export function getTerraceById(id: number): Terrace | undefined {
  return TERRACES.find((t) => t.id === id);
}

export function getTerracesByArea(area: string): readonly Terrace[] {
  if (area === 'All') return TERRACES;
  return TERRACES.filter((t) => t.area === area);
}
