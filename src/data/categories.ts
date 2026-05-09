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
 * Bar evidence is split into "strong" (definitely a bar) vs "ambiguous"
 * (café-ish terms — cafés in Amsterdam are often actually restaurants).
 * The tiebreaker logic uses this distinction:
 *
 *   - STRONG bar terms always mark the venue as `bar`.
 *   - AMBIGUOUS bar terms mark `bar` only if no `restaurant` term hit.
 *     If a venue matches both "café" AND "restaurant", we treat the
 *     restaurant signal as authoritative and drop the bar mark.
 *
 * Examples this fixes:
 *   "Eetcafé van Houten" → was bar+restaurant; now restaurant only
 *   "Restaurant Café Hans" → was bar+restaurant; now restaurant only
 *   "Café Brix" (no restaurant terms) → still bar ✓
 *   "Brasserie Margaux" (no bar terms) → still restaurant ✓
 *   "Bar & Brasserie XYZ" (strong bar AND restaurant) → bar+restaurant ✓
 */
const BAR_STRONG_TERMS = [
  // Word-boundary matched below — both "bar " and " bar" pass through
  // a single \bbar\b regex.
  'bar',
  'lounge',
  'cocktail',
  'distillery',
  'brewery',
  'brouwerij',
  'beer garden',
  'wine bar',
  'speakeasy',
  'jazz',
  'nightclub',
  'sky bar',
  'pub',
  'kroeg',
] as const;

const BAR_AMBIGUOUS_TERMS = [
  'café',
  'cafe',
  'koffie',
  'coffee',
  'bakery',
  'tearoom',
  'tasting room',
] as const;

const RESTAURANT_TERMS = [
  'restaurant',
  'brasserie',
  'eetcafé',
  'eetcafe',
  'kitchen',
  'pizza',
  'seafood',
  'italian',
  'dining',
  'bistro',
  'trattoria',
  'osteria',
  'ristorante',
  'sushi',
  'thai',
  'indian',
  'mexican',
  'burger',
  'steakhouse',
  'tapas',
] as const;

/**
 * Word-boundary substring check that's Unicode-safe. Matches `bar` in
 * "bar Bonnie" but not "bargain"; matches `eetcafé` in "Eetcafé X" — the
 * `é` is not an ASCII word character so `\b` doesn't form a boundary
 * there, hence this uses `(?:^|\W)` / `(?:$|\W)` instead. The captured
 * non-word character isn't part of the term, so we use lookahead to
 * keep it out of the match (and out of any future use).
 */
function hasTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\W)${escaped}(?=$|\\W)`, 'i').test(haystack);
}

/**
 * Categorise a single terrace. Returns ALL matching categories — order
 * not significant, callers iterate the set or check membership.
 *
 * Tiebreaker: when ambiguous bar terms (café, coffee) overlap with
 * restaurant terms, restaurant wins.
 */
export function categoriesForTerrace(
  t: Pick<Terrace, 'name' | 'vibe' | 'facing'>,
): Set<VenueCategory> {
  const haystack = `${t.name} ${t.vibe ?? ''}`.toLowerCase();
  const matches = new Set<VenueCategory>();

  const hasBarStrong = BAR_STRONG_TERMS.some((t) => hasTerm(haystack, t));
  const hasBarAmbiguous = BAR_AMBIGUOUS_TERMS.some((t) => hasTerm(haystack, t));
  const hasRestaurant = RESTAURANT_TERMS.some((t) => hasTerm(haystack, t));

  if (hasRestaurant) matches.add('restaurant');
  if (hasBarStrong) matches.add('bar');
  if (hasBarAmbiguous && !hasRestaurant) {
    // Café-ish only counts as bar when there's no clearer restaurant
    // signal in the name/vibe. "Eetcafé" + restaurant terms → restaurant
    // only; pure "Café Brix" → bar.
    matches.add('bar');
  }

  return matches;
}
