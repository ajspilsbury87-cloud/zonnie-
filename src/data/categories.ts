/**
 * Venue-type categorisation derived from a terrace's explicit
 * `category` field if present, falling back to regex inference over
 * name + vibe text.
 *
 * Three filter chips: Bar, Restaurant, Coffee. The Coffee chip surfaces
 * specialty / third-wave coffee shops (Lot Sixty One, White Label,
 * Bocca, etc.) — it is NOT a synonym for "café", because in Amsterdam
 * "Café X" usually means a bruine kroeg (a brown bar serving beer),
 * which we want under Bar. The two categories cannot be reliably
 * distinguished from name/vibe text alone, so coffee shops are tagged
 * explicitly via the `category` field on the data side. Existing
 * "Café"/"koffie" name signals continue to flow into Bar through the
 * ambiguous-bar fallback so we don't break the 800+ pre-existing
 * entries.
 *
 * "Outdoor Screen" lives outside this category system as a separate
 * mode toggle (it ANDs with the categories); the World Cup framing
 * doesn't fit a venue type.
 *
 * Each terrace can match MULTIPLE categories — e.g., a brasserie with
 * a cocktail menu is both Bar and Restaurant; a coffee roaster that
 * also serves natural wine is both Coffee and Bar. Filter semantics: a
 * terrace passes if it matches ANY selected category (OR), so multi-
 * select widens the result set. Empty selection = no category filter.
 */

import type { Terrace } from '@/src/engines/types';

export type VenueCategory = 'bar' | 'restaurant' | 'coffee';

export const CATEGORIES_ORDERED: readonly VenueCategory[] = [
  'bar',
  'restaurant',
  'coffee',
];

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  coffee: 'Koffie',
};

export const CATEGORY_GLYPHS: Record<VenueCategory, string> = {
  bar: '🍸',
  restaurant: '🍽',
  coffee: '☕',
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
 * Resolution order:
 *   1. If `t.category` is set (explicit data tag from import scripts),
 *      use it verbatim. This is how specialty coffee shops land in
 *      `coffee` — text inference can't tell "Lot Sixty One" from
 *      "Café Lot" reliably, so we don't try.
 *   2. Otherwise fall back to text inference over name + vibe.
 *
 * Tiebreaker for inference: when ambiguous bar terms (café, koffie)
 * overlap with restaurant terms, restaurant wins.
 */
export function categoriesForTerrace(
  t: Pick<Terrace, 'name' | 'vibe' | 'facing' | 'category'>,
): Set<VenueCategory> {
  // Explicit category tag wins. Filter to known values so a stale
  // string in the data file (e.g. legacy 'café') doesn't propagate as
  // an unrenderable filter chip.
  if (t.category && t.category.length > 0) {
    const valid = t.category.filter((c): c is VenueCategory =>
      (CATEGORIES_ORDERED as readonly string[]).includes(c),
    );
    if (valid.length > 0) return new Set(valid);
  }

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
    // only; pure "Café Brix" → bar. Specialty coffee shops are NOT
    // captured here — they need an explicit `category: ['coffee']` tag
    // from the import script (we can't reliably tell a third-wave
    // coffee shop from a brown bar by name alone).
    matches.add('bar');
  }

  return matches;
}
