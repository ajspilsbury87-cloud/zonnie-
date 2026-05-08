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
// v2 redesign: smaller pins (32×44), per-state contrast outline (light fills
// get a dark outline, dark fills get a light outline), and the sun glyph
// adopts the same fill+outline as the T so the marker reads as one unified
// shape. Diverges from the original brand-asset module (which always used
// ink-coloured strokes) — that lost contrast on dark fills against dim map
// regions, and the sun looking different from the T felt visually
// disconnected at small sizes.

const COLORS = {
  ink: '#2A1F15',
  cream: '#FFE5C2',
  fullSun: '#D9633E', // terracotta — medium-dark
  mostlySunny: '#E89C5A', // peach — medium
  partialSun: '#F4D58D', // mustard — light
  shade: '#7A2E14', // cocoa — dark
  selected: '#FBA85A', // warm orange — medium
  haloOuter: '#FBA85A',
  haloInner: '#FFE5C2',
} as const;

type PinStateKey = 'full' | 'mostly' | 'partial' | 'shade' | 'selected';

interface PinConfig {
  fill: string;
  /** Contrast outline color — opposite tonal value of the fill. */
  outline: string;
  selected: boolean;
}

/**
 * Outline rule (Andy's call): dark fills get a light outline, light fills
 * get a dark outline. Always-visible regardless of map region brightness.
 */
const PIN_STATES: Record<PinStateKey, PinConfig> = {
  full: { fill: COLORS.fullSun, outline: COLORS.cream, selected: false }, // dark fill → cream outline
  mostly: { fill: COLORS.mostlySunny, outline: COLORS.ink, selected: false }, // medium → ink reads better against most map tiles
  partial: { fill: COLORS.partialSun, outline: COLORS.ink, selected: false }, // light → ink
  shade: { fill: COLORS.shade, outline: COLORS.cream, selected: false }, // dark → cream
  selected: { fill: COLORS.selected, outline: COLORS.cream, selected: true }, // halo + cream outline
};

/**
 * Pin silhouette redesign (v3, 2026-05-08): a sun glyph (filled circle
 * + 7 rays) sitting above a short triangular pointer.
 *
 * Earlier design used an italic-T silhouette — a horizontal score-chip
 * cap above a long descender. User feedback: at small sizes on a
 * busy map, that read as a Christian cross / crucifix shape. Replaced
 * with the brand sun motif (consistent with the splash + landing page
 * + app icon) plus a small downward triangle to communicate "this is
 * the location".
 *
 * Anchoring is unchanged: viewBox `-16 -22 32 44`, anchor at
 * (0, 22). The triangle's tip is the anchor, so the pin still
 * touches lat/lng cleanly.
 */
function sunGlyphSvg(cfg: PinConfig): string {
  // 7 rays around the sun (skipping the bottom one — that's where the
  // pointer triangle goes). Drawn as fat lines for visibility at @1x.
  const rayStrokeWidth = cfg.selected ? 1.4 : 1.2;
  const sunStrokeWidth = cfg.selected ? 1.0 : 0.8;
  return `
    <g stroke="${cfg.outline}" stroke-width="${rayStrokeWidth}" stroke-linecap="round" fill="none">
      <line x1="0" y1="-19" x2="0" y2="-15.5"/>
      <line x1="-13.5" y1="-5" x2="-10.5" y2="-5"/>
      <line x1="10.5" y1="-5" x2="13.5" y2="-5"/>
      <line x1="-9.4" y1="-14.4" x2="-7.4" y2="-12.4"/>
      <line x1="7.4" y1="-12.4" x2="9.4" y2="-14.4"/>
      <line x1="-9.4" y1="4.4" x2="-7.4" y2="2.4"/>
      <line x1="7.4" y1="2.4" x2="9.4" y2="4.4"/>
    </g>
    <circle cx="0" cy="-5" r="9.5" fill="${cfg.fill}" stroke="${cfg.outline}" stroke-width="${sunStrokeWidth}"/>`;
}

/** Small triangular pointer below the sun whose tip sits on the lat/lng. */
function pointerSvg(cfg: PinConfig): string {
  const strokeWidth = cfg.selected ? 1.0 : 0.8;
  return `
    <path d="M -3.6 5.5 L 0 22 L 3.6 5.5 Z"
          fill="${cfg.fill}"
          stroke="${cfg.outline}"
          stroke-width="${strokeWidth}"
          stroke-linejoin="round"/>`;
}

function pinSvg(state: PinStateKey): string {
  const cfg = PIN_STATES[state];
  const halo = cfg.selected
    ? `<ellipse cx="0" cy="-5" rx="17" ry="17" fill="${COLORS.haloOuter}" opacity="0.20"/>
       <ellipse cx="0" cy="-5" rx="12" ry="12" fill="${COLORS.haloInner}" opacity="0.55"/>`
    : '';
  // ViewBox unchanged: -16 -22 32 44. Anchor at (0, 22) is now the
  // tip of the pointer triangle (was the base of the T descender).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -22 32 44" width="32" height="44">
    <g>
      ${halo}
      ${pointerSvg(cfg)}
      ${sunGlyphSvg(cfg)}
    </g>
  </svg>`;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

async function renderSvgToPng(svgString: string, width: number, height: number, outPath: string) {
  const buf = await sharp(Buffer.from(svgString), { density: 600 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(outPath, buf);
  console.log(`  ${outPath.replace(PROJECT_ROOT, '.')}  (${width}×${height})`);
}

async function renderSvgFileToPng(srcSvg: string, width: number, height: number, outPath: string) {
  const svg = readFileSync(srcSvg, 'utf-8');
  await renderSvgToPng(svg, width, height, outPath);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PINS_OUT_DIR, { recursive: true });

  console.log('App icon + splash');
  const iconSrc = join(SRC_DIR, 'icons', 'zonnie-icon-square-1024.svg');
  await renderSvgFileToPng(iconSrc, 1024, 1024, join(OUT_DIR, 'icon.png'));
  await renderSvgFileToPng(iconSrc, 1024, 1024, join(OUT_DIR, 'splash-icon.png'));
  await renderSvgFileToPng(iconSrc, 1024, 1024, join(OUT_DIR, 'android-icon-foreground.png'));
  await renderSvgFileToPng(iconSrc, 48, 48, join(OUT_DIR, 'favicon.png'));

  console.log('Pin states');
  // Size-by-score: pin physical size scales with sun quality. The
  // earlier pass (24/28/32/36) was too subtle on-device — sun pins
  // didn't visibly stand out from shaded ones. Widened the range so
  // a full-sun pin is ~2.5× the area of a shaded one. Aspect ratio
  // (~0.727) preserved across states.
  const SIZES: Record<PinStateKey, [number, number]> = {
    shade: [20, 28], // smallest — least sun
    partial: [28, 38],
    mostly: [38, 52],
    full: [50, 68], // largest non-selected — most sun, ~2.5× area of shade
    selected: [56, 76], // biggest overall — focused state
  };
  for (const state of ['full', 'mostly', 'partial', 'shade', 'selected'] as PinStateKey[]) {
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
