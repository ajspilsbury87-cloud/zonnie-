#!/usr/bin/env tsx
/**
 * Rasterize the brand SVGs (`brand-assets/`) into the runtime PNGs Expo
 * actually consumes (`assets/images/`).
 *
 * Idempotent — re-run any time the source SVG changes. Outputs:
 *
 *   assets/images/icon.png              1024×1024 (app icon master)
 *   assets/images/icon-foreground.png   1024×1024 — Android adaptive (same art, padded)
 *   assets/images/splash-icon.png       1024×1024 (Expo splash uses this, scales itself)
 *   assets/images/favicon.png           48×48
 *   assets/images/pins/<state>.png      40×56 (@1x)
 *   assets/images/pins/<state>@2x.png   80×112
 *   assets/images/pins/<state>@3x.png   120×168
 *
 * Run with: `npm run rasterize-assets`
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const PROJECT_ROOT = process.cwd();
const SRC_DIR = join(PROJECT_ROOT, 'brand-assets');
const OUT_DIR = join(PROJECT_ROOT, 'assets', 'images');
const PINS_OUT_DIR = join(OUT_DIR, 'pins');

// ─── Pin SVG generator ──────────────────────────────────────────────────────
//
// v3 redesign (2026-05-08): Aperol spritz silhouette with sun overhead,
// per Andy's brand-handover spec at brand-assets/v2/. v2 (sun+pointer)
// was an overnight intermediate; this is the canonical pin design.
// Replaces the italic-T (v1, "looked like a Calvary cross"). The glass
// fill carries the score-band signal; foam + ice fade darker in shade
// states so the drink looks "in shadow". Sun glyph above is constant
// ink colour across states — separates the "what" (sun overhead) from
// the "how much" (glass brightness).

const COLORS = {
  ink: '#2A1F15',
  foam: '#FFE5C2',
  haloOuter: '#FBA85A',
  haloInner: '#FFE5C2',
  selectedFill: '#FF8A3D',
  // Pin score-band gradient. More saturated than the in-app warm
  // palette in `theme/tokens.ts` — deliberately, so pins read at
  // peripheral glance on a busy map. Score chips elsewhere keep
  // the warmer brand tones.
  fullSun: '#FF6B1A', // vivid bright orange
  mostlySunny: '#E55A1F', // amber orange
  partialSun: '#C04A1E', // deep orange
  mostlyShade: '#9A3A19', // rust brown
  shade: '#5A2410', // deep cocoa
} as const;

type PinStateKey = 'full' | 'mostly' | 'partial' | 'mshade' | 'shade' | 'selected';

interface PinConfig {
  fill: string;
  /** Foam (top of drink) opacity — fades in shade states. */
  foamOpacity: number;
  /** Ice cube opacity — fades alongside foam. */
  iceOpacity: number;
  selected: boolean;
}

/**
 * Five score bands + selected. Foam/ice fade in the bottom two bands so
 * the drink visibly "sits in shadow" when the score is low — extra
 * peripheral signal beyond the fill colour alone.
 */
const PIN_STATES: Record<PinStateKey, PinConfig> = {
  full:    { fill: COLORS.fullSun,    foamOpacity: 1.00, iceOpacity: 0.70, selected: false },
  mostly:  { fill: COLORS.mostlySunny, foamOpacity: 1.00, iceOpacity: 0.70, selected: false },
  partial: { fill: COLORS.partialSun, foamOpacity: 1.00, iceOpacity: 0.70, selected: false },
  mshade:  { fill: COLORS.mostlyShade, foamOpacity: 0.85, iceOpacity: 0.65, selected: false },
  shade:   { fill: COLORS.shade,      foamOpacity: 0.55, iceOpacity: 0.45, selected: false },
  selected:{ fill: COLORS.selectedFill, foamOpacity: 1.00, iceOpacity: 0.75, selected: true },
};

/**
 * Aperol spritz pin silhouette (v3 spec, brand-assets/v2/zonnie-pin.js).
 *
 * Tulip-glass body, cream foam top, ice cube, black straw. A small
 * hollow sun with 5 rays sits above the glass. Brightness gradient
 * across score bands tells the sun-rating story without needing to
 * read any text.
 *
 * Geometry (per the brand-handover SVG):
 *   ViewBox  -20 -38 40 56   (40 wide, 56 tall)
 *   Sun centre   (0, -26)
 *   Sun rays span y=-35 (top) to y=-30
 *   Glass top    y = -14
 *   Glass base   y =  9   ← lat/lng anchor
 *   Empty space  y =  9 to 18 (transparent — gives breathing room
 *                              below the anchor; ZonnieMap uses
 *                              anchor.y = 47/56 ≈ 0.84 to compensate)
 */
function sunOverGlassSvg(cfg: PinConfig): string {
  // Sun + rays match the glass fill colour so the marker reads as
  // one unified shape per score band. Earlier version used ink (dark
  // brown) for the sun, which felt visually disconnected from the
  // coloured glass below — Andy's feedback after on-device testing.
  const sunStrokeWidth = cfg.selected ? 1.2 : 1.0;
  const rayStrokeWidth = cfg.selected ? 1.0 : 0.9;
  return `
    <circle cx="0" cy="-26" r="3.5" fill="none" stroke="${cfg.fill}" stroke-width="${sunStrokeWidth}"/>
    <g stroke="${cfg.fill}" stroke-width="${rayStrokeWidth}" stroke-linecap="round" fill="none">
      <line x1="-9" y1="-26" x2="-6.5" y2="-26"/>
      <line x1="9" y1="-26" x2="6.5" y2="-26"/>
      <line x1="0" y1="-35" x2="0" y2="-32"/>
      <line x1="-6" y1="-32" x2="-5" y2="-30.5"/>
      <line x1="6" y1="-32" x2="5" y2="-30.5"/>
    </g>`;
}

function spritzGlassSvg(cfg: PinConfig): string {
  const strokeWidth = cfg.selected ? 1.4 : 1.2;
  return `
    <!-- Tulip glass bowl -->
    <path d="M -10 -14 L 10 -14 L 7 6 Q 7 9 4 9 L -4 9 Q -7 9 -7 6 Z"
          fill="${cfg.fill}" stroke="${COLORS.ink}" stroke-width="${strokeWidth}"/>
    <!-- Foam / liquid surface -->
    <ellipse cx="0" cy="-13" rx="10" ry="2"
             fill="${COLORS.foam}" opacity="${cfg.foamOpacity}"
             stroke="${COLORS.ink}" stroke-width="0.8"/>
    <!-- Ice cube -->
    <rect x="-3" y="-11" width="3" height="3"
          fill="${COLORS.foam}" opacity="${cfg.iceOpacity}"
          stroke="${COLORS.ink}" stroke-width="0.4"/>
    <!-- Straw (black, slight angle) -->
    <line x1="-3" y1="-18" x2="-1" y2="-10"
          stroke="${COLORS.ink}" stroke-width="1" stroke-linecap="round"/>`;
}

function pinSvg(state: PinStateKey): string {
  const cfg = PIN_STATES[state];
  const halo = cfg.selected
    ? `<ellipse cx="0" cy="-2" rx="20" ry="20" fill="${COLORS.haloOuter}" opacity="0.20"/>
       <ellipse cx="0" cy="-2" rx="14" ry="14" fill="${COLORS.haloInner}" opacity="0.55"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -38 40 56" width="40" height="56">
    <g>
      ${halo}
      ${sunOverGlassSvg(cfg)}
      ${spritzGlassSvg(cfg)}
    </g>
  </svg>`;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

async function renderSvgToPng(
  svgString: string,
  width: number,
  height: number,
  outPath: string,
  options: { roundedCorners?: number } = {},
) {
  let pipeline = sharp(Buffer.from(svgString), { density: 600 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

  if (options.roundedCorners != null && options.roundedCorners > 0) {
    // Apply iOS-style rounded corners by compositing a rounded-rectangle
    // mask. Apple's icon corner radius is ~22.37% of the icon's edge —
    // we match that so a square brand icon reads as a "real" iOS icon
    // on the launch screen without baking the radius into the source SVG.
    const r = options.roundedCorners;
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="white"/>` +
        `</svg>`,
    );
    pipeline = pipeline.composite([{ input: mask, blend: 'dest-in' }]);
  }

  const buf = await pipeline.png().toBuffer();
  writeFileSync(outPath, buf);
  console.log(`  ${outPath.replace(PROJECT_ROOT, '.')}  (${width}×${height})`);
}

async function renderSvgFileToPng(
  srcSvg: string,
  width: number,
  height: number,
  outPath: string,
  options: { roundedCorners?: number } = {},
) {
  const svg = readFileSync(srcSvg, 'utf-8');
  await renderSvgToPng(svg, width, height, outPath, options);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PINS_OUT_DIR, { recursive: true });

  console.log('App icon + splash');
  const iconSrc = join(SRC_DIR, 'icons', 'zonnie-icon-square-1024.svg');
  // App icon (Apple applies the OS-level corner mask so we ship square).
  await renderSvgFileToPng(iconSrc, 1024, 1024, join(OUT_DIR, 'icon.png'));
  // Splash icon — iOS does NOT mask this, so we bake in the corner
  // radius. ~22.4% of the edge length (=229 px on 1024) matches Apple's
  // canonical squircle so the launch icon reads as a real iOS app
  // icon, not a square brand mark on a sand background.
  await renderSvgFileToPng(
    iconSrc,
    1024,
    1024,
    join(OUT_DIR, 'splash-icon.png'),
    { roundedCorners: 229 },
  );
  await renderSvgFileToPng(iconSrc, 1024, 1024, join(OUT_DIR, 'android-icon-foreground.png'));
  await renderSvgFileToPng(iconSrc, 48, 48, join(OUT_DIR, 'favicon.png'));

  console.log('Pin states');
  // Size-by-score: pin physical size scales with sun quality. Sunny
  // pins are ~2.5× the area of shaded ones — the size differential is
  // an extra peripheral signal beyond the colour gradient. Aspect
  // ratio matches the SVG viewBox (~0.714) so Sharp doesn't pad.
  const SIZES: Record<PinStateKey, [number, number]> = {
    shade:    [22, 31],   // smallest — least sun
    mshade:   [27, 38],
    partial:  [32, 45],
    mostly:   [38, 53],
    full:     [44, 62],   // largest non-selected
    selected: [50, 70],   // biggest overall — focused state
  };
  const STATES: PinStateKey[] = ['full', 'mostly', 'partial', 'mshade', 'shade', 'selected'];
  for (const state of STATES) {
    const svg = pinSvg(state);
    const [w, h] = SIZES[state];
    await renderSvgToPng(svg, w, h, join(PINS_OUT_DIR, `${state}.png`));
    await renderSvgToPng(svg, w * 2, h * 2, join(PINS_OUT_DIR, `${state}@2x.png`));
    await renderSvgToPng(svg, w * 3, h * 3, join(PINS_OUT_DIR, `${state}@3x.png`));
  }

  console.log('\nDone. Re-run after editing brand-assets/.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
