/**
 * Zonnie design tokens — 70s sunset palette.
 *
 * Source: `brand-assets/README.md` and `brand-assets/docs/ASSET-SPECS.md`.
 * The icon and pin SVGs are the visual source of truth; this file mirrors
 * those colors so in-app UI (chips, badges, score bars) stays brand-aligned.
 *
 * Old naming (`amber`, `amberDeep`) is preserved as deprecated aliases so
 * existing imports don't break, but new code should use the named tokens
 * (`peach`, `terracotta`, etc.).
 */

export const palette = {
  // 70s sunset — primary brand
  cream: '#FFE5C2',
  mustard: '#F4D58D',
  peach: '#FBA85A',
  orange: '#E89C5A',
  burnt: '#D9633E',
  terracotta: '#B14222',
  cocoa: '#7A2E14',
  ink: '#2A1F15',
  inkSoft: '#5A4A38',

  // Surfaces (warm-toned to sit alongside the sunset palette)
  sand: '#FFF8F0',
  sandDeep: '#F4ECE0',
  mist: '#E8DCC8',
  mistDeep: '#C8B89A',
  white: '#FFFFFF',
  black: '#000000',

  // Deprecated aliases — keep until callsites migrate.
  amber: '#FBA85A', // → peach
  amberDeep: '#D9633E', // → burnt
  blue: '#2D5CF6',
  blueDeep: '#1E40D8',
  leaf: '#0EA66C',
} as const;

export const lightTheme = {
  bg: palette.sand,
  bgElevated: palette.white,
  text: palette.ink,
  textMuted: palette.inkSoft,
  border: palette.mist,
  accent: palette.peach,
  accentSecondary: palette.burnt,
  positive: palette.leaf,
} as const;

export const darkTheme = {
  bg: palette.ink,
  bgElevated: '#1A2236',
  text: palette.sand,
  textMuted: palette.mistDeep,
  border: '#2A3349',
  accent: palette.peach,
  accentSecondary: palette.burnt,
  positive: '#22D38F',
} as const;

export type ThemeColors = typeof lightTheme;

export const fonts = {
  display: 'Fraunces_500Medium',
  displayItalic: 'Fraunces_500Medium_Italic',
  displayBold: 'Fraunces_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  display: 36,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * Sun-score → score band color.
 *
 * These are the same colors used as pin T-fills in the brand-asset SVGs —
 * keeping in-app score chips/bars visually consistent with map markers.
 * Score band thresholds match `engines/scoring.ts#scoreLabel`.
 */
export function scoreToColor(score: number): string {
  if (score > 0.7) return palette.burnt; // Full sun — terracotta
  if (score > 0.5) return palette.orange; // Mostly sunny — peach
  if (score > 0.3) return palette.mustard; // Partial sun
  if (score > 0.1) return palette.cocoa; // Mostly shade
  return palette.ink; // In shadow
}
