/**
 * Venue-type categorisation derived from terrace name + vibe text.
 *
 * Used for the "Café / Bar / Restaurant / Outdoor" filter chips. Each
 * terrace can match multiple categories — e.g., a brouwerij with a
 * canal terrace is both Bar and Outdoor. Filter semantics: a terrace
 * passes if it matches ANY selected category (OR), so multi-select
 * widens the result set.
 *
 * Categorisation is heuristic — no perfect categorisation field in our
 * dataset. We combine name-prefix matching (Dutch venue conventions
 * like "Café X", "Brasserie Y", "Eetcafé Z") with vibe-text scanning
 * (the human-curated tag we already store, e.g. "Beer garden",
 * "Rooftop bar", "Bakery café"). Together they classify ~95% of our
 * 378 terraces; the remaining ~5% match no category and only appear
 * when the filter is empty.
 */

import type { Terrace } from '@/src/engines/types';

export type VenueCategory = 'cafe' | 'bar' | 'restaurant' | 'outdoor';

export const CATEGORIES_ORDERED: readonly VenueCategory[] = [
  'cafe',
  'bar',
  'restaurant',
  'outdoor',
];

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  cafe: 'Café',
  bar: 'Bar',
  restaurant: 'Restaurant',
  outdoor: 'Outdoor',
};

export const CATEGORY_GLYPHS: Record<VenueCategory, string> = {
  cafe: '☕',
  bar: '🍸',
  restaurant: '🍽',
  outdoor: '🌳',
};

/** Match terms (lowercase, substring search) per category. */
const CATEGORY_TERMS: Record<VenueCategory, string[]> = {
  cafe: ['café', 'cafe', 'koffie', 'coffee', 'bakery', 'tearoom', 'tasting room'],
  bar: [
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
  ],
  outdoor: [
    'rooftop',
    'park',
    'garden',
    'square',
    'canal',
    'waterfront',
    'waterside',
    'beach',
    'strand',
    'amstel terrace',
    'urban garden',
    'sunny square',
    'park-side',
    'boat',
    'hidden courtyard',
    'courtyard',
    'medieval tower',
  ],
};

/**
 * Categorise a single terrace. Returns ALL matching categories — order
 * not significant, callers iterate the set or check membership.
 */
export function categoriesForTerrace(t: Pick<Terrace, 'name' | 'vibe' | 'facing'>): Set<VenueCategory> {
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

  // Outdoor signal: 'All' facing implies rooftop / open square / 360°
  // exposure even if no name/vibe term hits.
  if (t.facing === 'All') matches.add('outdoor');

  return matches;
}
