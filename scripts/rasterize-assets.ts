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

// ─── Pin SVG generator (ported from brand-assets/pins/zonnie-pin.js) ────────

const COLORS = {
  ink: '#2a1f15',
  fullSun: '#D9633E',
  mostlySunny: '#E89C5A',
  partialSun: '#F4D58D',
  shade: '#7A2E14',
  selected: '#FBA85A',
  haloOuter: '#FBA85A',
  haloInner: '#FFE5C2',
} as const;

type PinStateKey = 'full' | 'mostly' | 'partial' | 'shade' | 'selected';

const PIN_STATES: Record<PinStateKey, { fill: string; outline: boolean; selected: boolean }> = {
  full: { fill: COLORS.fullSun, outline: false, selected: false },
  mostly: { fill: COLORS.mostlySunny, outline: false, selected: false },
  partial: { fill: COLORS.partialSun, outline: true, selected: false },
  shade: { fill: COLORS.shade, outline: false, selected: false },
  selected: { fill: COLORS.selected, outline: true, selected: true },
};

function sunOnTopSvg({ strokeWidth = 1.0, sunStrokeWidth = 1.2 } = {}): string {
  return `
    <circle cx="4" cy="-12" r="3" fill="none" stroke="${COLORS.ink}" stroke-width="${sunStrokeWidth}"/>
    <g stroke="${COLORS.ink}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none">
      <line x1="-5" y1="-12" x2="-3" y2="-12"/>
      <line x1="13" y1="-12" x2="11" y2="-12"/>
      <line x1="4" y1="-20" x2="4" y2="-18"/>
      <line x1="-2" y1="-18" x2="-1" y2="-17"/>
      <line x1="10" y1="-18" x2="9" y2="-17"/>
    </g>`;
}

function italicTSvg(fill: string, outline: boolean, strokeWidth = 0.5): string {
  const stroke = outline ? `stroke="${COLORS.ink}" stroke-width="${strokeWidth}"` : 'stroke="none"';
  return `
    <g transform="skewX(-16)" fill="${fill}" ${stroke}>
      <rect x="-13" y="-1" width="26" height="4"/>
      <rect x="-2" y="-1" width="4" height="29"/>
    </g>`;
}

function pinSvg(state: PinStateKey): string {
  const cfg = PIN_STATES[state];
  const halo = cfg.selected
    ? `<ellipse cx="0" cy="6" rx="22" ry="22" fill="${COLORS.haloOuter}" opacity="0.20"/>
       <ellipse cx="0" cy="6" rx="16" ry="16" fill="${COLORS.haloInner}" opacity="0.55"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -28 40 56" width="40" height="56">
    <g>
      ${halo}
      ${sunOnTopSvg({
        strokeWidth: cfg.selected ? 1.2 : 1.0,
        sunStrokeWidth: cfg.selected ? 1.4 : 1.2,
      })}
      ${italicTSvg(cfg.fill, cfg.outline, cfg.selected ? 0.8 : 0.5)}
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
  const states: PinStateKey[] = ['full', 'mostly', 'partial', 'shade', 'selected'];
  for (const state of states) {
    const svg = pinSvg(state);
    await renderSvgToPng(svg, 40, 56, join(PINS_OUT_DIR, `${state}.png`));
    await renderSvgToPng(svg, 80, 112, join(PINS_OUT_DIR, `${state}@2x.png`));
    await renderSvgToPng(svg, 120, 168, join(PINS_OUT_DIR, `${state}@3x.png`));
  }

  console.log('\nDone. Re-run after editing brand-assets/.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
