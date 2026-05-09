#!/usr/bin/env tsx
/**
 * Compose App Store marketing screenshots from real iPhone captures.
 *
 * Andy captured 5 screenshots from his TestFlight 1.0.0 install
 * (`assets/marketing/IMG_2790..2794`). They're 1206×2622 — iPhone Pro
 * 6.1" resolution at 3x — too small for Apple's 6.9" tab requirement
 * (1320×2868). This script composes each capture inside a 1320×2868
 * marketing canvas with a brand-styled headline + subhead above the
 * phone screen, and a soft drop shadow + rounded corners on the
 * screenshot itself.
 *
 * Output: `assets/marketing/composed/01-05.png` — drag straight into
 * App Store Connect's 6.9" Display tab. ASC accepts the same 6.9"
 * file for the optional 6.5" tab too (downscaled server-side), so one
 * set covers both.
 *
 * Run: npm run compose-screenshots
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { palette } from '../src/theme/tokens';

const ROOT = process.cwd();
const IN_DIR = join(ROOT, 'assets', 'marketing');
const OUT_DIR = join(ROOT, 'assets', 'marketing', 'composed');

// App Store Connect 6.9" iPhone — 1320×2868.
const W = 1320;
const H = 2868;

// Marketing header zone height. Below this, the phone screenshot
// renders. 600px gives room for a 1- or 2-line headline (~96pt) + 44pt
// subhead + breathing space without crowding the screenshot.
const HEADER_H = 600;
// Padding around the phone screen inside the canvas.
const SIDE_PAD = 80;
const BOTTOM_PAD = 48;
// Phone-corner radius (matches iPhone Pro's ~55pt screen radius scaled
// to our compose-time pixel grid).
const PHONE_CORNER_R = 56;

mkdirSync(OUT_DIR, { recursive: true });

interface ShotSpec {
  /** Source PNG/JPEG file, in `assets/marketing/`. */
  source: string;
  /** Output filename in `assets/marketing/composed/`. */
  out: string;
  /** Marketing headline — top line, bold serif, ~100pt. */
  headline: string;
  /** Marketing subhead — second line, sans, ~44pt. */
  subhead: string;
}

// Headlines may use `\n` for an explicit line break — Georgia bold is
// wide, so anything past ~18 chars wants to wrap onto two lines rather
// than shrink to a tiny font.
const SHOTS: ShotSpec[] = [
  {
    source: 'IMG_2790.PNG',
    out: '01-landing.png',
    headline: 'Sunniest spots,\nby neighbourhood.',
    subhead: 'Top three terraces per region, ranked live.',
  },
  {
    source: 'IMG_2791.PNG',
    out: '02-map.png',
    headline: 'Sun strength, modelled.',
    subhead: 'Custom shadow algorithm. LIDAR building data.',
  },
  {
    source: 'IMG_2792.PNG',
    out: '03-detail.png',
    headline: 'Hour by hour.',
    subhead: 'Sun, weather, wind — everything you need.',
  },
  {
    source: 'IMG_2793.PNG',
    out: '04-scrubber.png',
    headline: 'Plan your stop.',
    subhead: 'Pick a time. Filter by area. Find sun.',
  },
  {
    source: 'IMG_2794.jpg',
    out: '05-widget.png',
    headline: 'On your home screen.',
    subhead: 'Top three sunny spots, one glance away.',
  },
];

/** Escape a string for safe inclusion inside an SVG <text> element. */
function escapeSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the canvas background (sand → cream gradient) + top header
 * (headline + subhead) as a single SVG. Returns the SVG bytes ready
 * to feed into Sharp.
 *
 * Headlines may carry `\n` to break onto multiple lines — each line
 * renders as a `<tspan dy>` so SVG doesn't try to auto-wrap (it can't).
 * Font size auto-shrinks for the longest line so even a single-line
 * headline never overruns the 1320-px viewport. Subhead sits below the
 * headline with a fixed gap, so two-line headlines push the subhead
 * down without overlapping it.
 *
 * The header zone is the top HEADER_H px of the 1320×2868 canvas; the
 * rest is left transparent for the phone screenshot to be composited
 * on top.
 */
function backgroundSvg(headline: string, subhead: string): string {
  const lines = headline.split('\n');
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
  // Georgia bold at 96pt fits ~22 chars wide on a 1320px canvas; below
  // 18 chars we can push to 108pt; longer single lines go to 84pt.
  const headlineSize =
    longest <= 14 ? 108 : longest <= 18 ? 96 : longest <= 22 ? 84 : 72;
  const headlineLineHeight = Math.round(headlineSize * 1.05);
  const headlineTopY = 220;
  // Subhead sits below the last headline line with a 56-px gap.
  const subheadY = headlineTopY + headlineLineHeight * (lines.length - 1) + 88;

  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : headlineLineHeight;
      return `<tspan x="${W / 2}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${palette.cream}"/>
          <stop offset="35%" stop-color="${palette.sand}"/>
          <stop offset="100%" stop-color="${palette.sandDeep}"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g text-anchor="middle">
        <text y="${headlineTopY}"
              font-family="Georgia, 'Times New Roman', serif"
              font-weight="700"
              font-size="${headlineSize}"
              fill="${palette.ink}"
              letter-spacing="-2">${tspans}</text>
        <text x="${W / 2}" y="${subheadY}"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="500"
              font-size="42"
              fill="${palette.inkSoft}">${escapeSvg(subhead)}</text>
      </g>
    </svg>`;
}

/** Build a rounded-rectangle mask SVG of the given dimensions. */
function roundedRectMask(w: number, h: number, r: number): Buffer {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>
    </svg>`;
  return Buffer.from(svg);
}

/** Build a soft-shadow SVG sized to the phone screen's bounding box. */
function shadowSvg(w: number, h: number, r: number): Buffer {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w + 80}" height="${h + 80}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="20" stdDeviation="32" flood-color="#2A1F15" flood-opacity="0.30"/>
        </filter>
      </defs>
      <rect x="40" y="40" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#2A1F15" filter="url(#shadow)" opacity="0.85"/>
    </svg>`;
  return Buffer.from(svg);
}

/**
 * Compose one shot — load the iPhone capture, scale to fit the canvas,
 * apply rounded corners, drop a soft shadow under it, paste onto the
 * sand-gradient + headline canvas, write PNG.
 */
async function composeShot(spec: ShotSpec): Promise<void> {
  const sourcePath = join(IN_DIR, spec.source);
  const sourceMeta = await sharp(sourcePath).metadata();
  const srcW = sourceMeta.width!;
  const srcH = sourceMeta.height!;

  // Available space for the phone screenshot, below the header.
  const availW = W - SIDE_PAD * 2;
  const availH = H - HEADER_H - BOTTOM_PAD;

  // Scale-to-fit, preserving the source aspect ratio.
  const scaleByW = availW / srcW;
  const scaleByH = availH / srcH;
  const scale = Math.min(scaleByW, scaleByH);
  const phoneW = Math.round(srcW * scale);
  const phoneH = Math.round(srcH * scale);

  // Centre the phone horizontally; pin to top of the phone area
  // (so the screenshot sits just under the header rather than
  // floating mid-canvas).
  const phoneX = Math.round((W - phoneW) / 2);
  const phoneY = HEADER_H;

  // Resize the source + apply the rounded-corner mask.
  const resized = await sharp(sourcePath)
    .resize(phoneW, phoneH, { fit: 'fill' })
    .composite([
      {
        input: roundedRectMask(phoneW, phoneH, PHONE_CORNER_R),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // Build the base canvas: gradient + header text. Sharp's default
  // 72-DPI render is what we want here — the SVG already declares its
  // size in pixels (W×H), so any density override would scale the
  // canvas. (Earlier `density: 144` produced a 2640×5736 output.)
  const base = sharp(Buffer.from(backgroundSvg(spec.headline, spec.subhead)));

  // Composite shadow first (behind the screenshot), then the screenshot
  // itself. Shadow buffer is 80px wider than the phone — center it 40px
  // up-left of the phone's position.
  const shadow = await sharp(shadowSvg(phoneW, phoneH, PHONE_CORNER_R))
    .png()
    .toBuffer();

  const finalBuf = await base
    .composite([
      { input: shadow, top: phoneY - 40, left: phoneX - 40 },
      { input: resized, top: phoneY, left: phoneX },
    ])
    .png()
    .toBuffer();

  const outPath = join(OUT_DIR, spec.out);
  writeFileSync(outPath, finalBuf);
  console.log(`  ${outPath.replace(ROOT, '.')}  (${W}×${H})`);
}

async function main(): Promise<void> {
  console.log(`Composing screenshots → ${OUT_DIR}`);
  for (const spec of SHOTS) {
    await composeShot(spec);
  }
  console.log('\nDone. Drag the 5 PNGs into App Store Connect → 6.9" Display.');
}

void main();
