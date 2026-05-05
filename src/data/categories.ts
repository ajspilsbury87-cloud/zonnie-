/**
 * Venue-type categorisation derived from terrace name + vibe text.
 *
 * Filter chips are deliberately just two: Bar and Restaurant. Earlier
 * iterations had four (Café / Bar / Restaurant / Outdoor) but in
 * practice:
 *   - Café vs Bar is a fuzzy distinction in Amsterdam — most "cafés"
 *     here are bruine kroegen serving beer, and most "bars" serve
 *     coffee. Splitting them caused mis-classifications and the user
 *     had to tap both to get what they meant. Folded into "Bar".
 *   - "Outdoor" was redundant — every terrace in this app is by
 *     definition outdoor. The category was leaking signal from the
 *     facing data (`All`) and adding noise. Removed.
 *
 * Each terrace can match BOTH remaining categories — e.g., a brasserie
 * with a cocktail menu is both Bar and Restaurant. Filter semantics: a
 * terrace passes if it matches ANY selected category (OR), so multi-
 * select widens the result set. Empty selection = no filter.
 */

import type { Terrace } from '@/src/engines/types';

export type VenueCategory = 'bar' | 'restaurant';

export const CATEGORIES_ORDERED: readonly VenueCategory[] = ['bar', 'restaurant'];

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
};

export const CATEGORY_GLYPHS: Record<VenueCategory, string> = {
  bar: '🍸',
  restaurant: '🍽',
};

/**
 * Match terms (lowercase, substring search) per category. The "bar"
 * bucket absorbs the old café terms (coffee / koffie / bakery / tearoom)
 * since the cafe/bar split caused user confusion.
 */
const CATEGORY_TERMS: Record<VenueCategory, string[]> = {
  bar: [
    // Café-ish (folded in)
    'café',
    'cafe',
    'koffie',
    'coffee',
    'bakery',
    'tearoom',
    'tasting room',
    // Classic bar
    'bar ',
    ' bar',
    'lounge',
    'cocktail',
    'distillery',
    'brewery',
    'brouwerij',
    'beer garden',
    'wine',
    'speakeasy',
    'jazz',
    'nightclub',
    'club terrace',
    'sky bar',
    'pub',
    'kroeg',
  ],
  restaurant: [
    'restaurant',
    'brasserie',
    'eetcafé',
    'eetcafe',
    'kitchen',
    'pizza',
    'seafood',
    'italian terrace',
    'dining',
    'fine dining',
    'bistro',
    'trattoria',
    'osteria',
  ],
};

/**
 * Categorise a single terrace. Returns ALL matching categories — order
 * not significant, callers iterate the set or check membership.
 *
 * No facing-based heuristic any more: the old `facing === 'All'` →
 * 'outdoor' rule is gone with the Outdoor category.
 */
export function categoriesForTerrace(
  t: Pick<Terrace, 'name' | 'vibe' | 'facing'>,
): Set<VenueCategory> {
  const matches = new Set<VenueCategory>();
  const haystack = `${t.name} ${t.vibe ?? ''}`.toLowerCase();

  for (const cat of CATEGORIES_ORDERED) {
    for (const term of CATEGORY_TERMS[cat]) {
      if (haystack.includes(term)) {
        matches.add(cat);
        break;
      }
    }
  }

  return matches;
}
