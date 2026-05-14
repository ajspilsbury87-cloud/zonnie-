/**
 * Six-region rollup of Amsterdam's 27 fine-grained `area` names.
 *
 * The terrace data carries detailed neighborhood labels (e.g. "De Pijp",
 * "Stadionbuurt", "9 Straatjes") because that level of detail matters for
 * future search/filtering. But for the UI's neighborhood chip row, 27 chips
 * is too many — Andy's call: condense to 6 macro-regions matching how
 * Amsterdammers actually carve up the city.
 *
 * `terrace.area` is preserved unchanged in the JSON; this module is the
 * single source of truth for the rollup. If a new neighborhood appears in
 * the data and isn't mapped here, `regionForArea` returns null and that
 * terrace is filtered out of region-scoped queries — visible in dev via
 * the unit-test parity check on `__tests__` (worth adding when this is
 * locked).
 *
 * Order: local-favorite first → tourist hub → niche, matching the same
 * principle as the previous 5-tier curated list. Reorder by editing
 * REGIONS_ORDERED.
 */

export type Region = 'Jordaan' | 'Zuid' | 'Oost' | 'West' | 'Centrum' | 'Noord';

export const REGIONS_ORDERED: readonly Region[] = [
  'Jordaan',
  'Zuid',
  'Oost',
  'West',
  'Centrum',
  'Noord',
];

/** Fine-grained area name → macro region. Update when terrace data adds new areas. */
export const AREA_TO_REGION: Readonly<Record<string, Region>> = {
  // Jordaan & adjacent
  'Jordaan': 'Jordaan',
  'Haarlemmerbrt': 'Jordaan',

  // Zuid (De Pijp + Vondelpark + Olympic + business)
  'De Pijp': 'Zuid',
  'Oud-Zuid': 'Zuid',
  'Zuid': 'Zuid',
  'Zuidas': 'Zuid',
  'Rivierenbuurt': 'Zuid',
  'Stadionbuurt': 'Zuid',
  'Buitenveldert': 'Zuid',

  // Oost
  'Oost': 'Oost',
  'Amstel': 'Oost',
  'Watergraafsmeer': 'Oost',
  'Indische Buurt': 'Oost',
  'Amstelkwartier': 'Oost',
  'IJburg': 'Oost',
  'Plantage': 'Oost',

  // West
  'Oud-West': 'West',
  'West': 'West',
  'De Baarsjes': 'West',
  'Westerpark': 'West',
  'Spaarndammer': 'West',
  'Houthavens': 'West',
  'Bos en Lommer': 'West',
  'Nieuw-West': 'West',

  // Centrum (historic core + canal belt)
  'Centrum': 'Centrum',
  'Leidseplein': 'Centrum',
  'Rembrandtplein': 'Centrum',
  '9 Straatjes': 'Centrum',

  // Noord
  'Noord': 'Noord',
};

export function regionForArea(area: string): Region | null {
  return AREA_TO_REGION[area] ?? null;
}
