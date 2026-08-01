// =============================================================================
// make-iap-promos.mjs — Zonnie App Store IAP promotional images (3 outputs)
// -----------------------------------------------------------------------------
// Apple Guideline 2.3.2: each promoted IAP needs a VISIBLY DISTINCT image.
// Three sibling designs, one brand system:
//   promo-monthly.png  — "A sunny month."     light morning sky, low rising sun
//   promo-yearly.png   — "Every golden hour." dotted sun-path arc with 3 suns
//   promo-lifetime.png — "Forever golden."    dark premium, one huge radiant sun
//
// Each output: EXACTLY 1024x1024 px, fully opaque PNG (verified in-script).
// NO pricing / currency / value claims — the store renders name+price itself.
// Critical content kept inside the outer ~80 px safe margin.
//
// Techniques (proven in make-frame6.mjs, sharp v0.34.5 only):
//   1. Scene = ONE SVG string rasterised via sharp(Buffer.from(svg)).
//   2. All TEXT rendered separately via sharp's Pango engine + brand fontfiles,
//      composited on top (SVG <text> renders nothing on this box).
//   3. Film-grain overlay rect to kill radial-gradient banding.
//
// Run:  node scripts/marketing/make-iap-promos.mjs
// =============================================================================

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const FRAUNCES_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const INTER_SEMIBOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const OUT_DIR = path.join(ROOT, 'marketing', 'iap-promos');

// Brand tokens (exact hex).
const C = {
  sand: '#FFF8F0', cream: '#FFE5C2', mist: '#E8DCC8', mustard: '#F4D58D',
  peach: '#FBA85A', orange: '#E89C5A', burnt: '#D9633E', terracotta: '#B14222',
  cocoa: '#7A2E14', ink: '#2A1F15', inkSoft: '#5A4A38', white: '#FFFFFF',
};

const S = 1024; // canvas is a 1024x1024 square
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function renderText({ markup, font, fontfile, dpi = 150, width, align = 'centre', spacing }) {
  const textSpec = { text: markup, font, fontfile, rgba: true, dpi, align };
  if (width) textSpec.width = width;
  if (spacing != null) textSpec.spacing = spacing;
  const buffer = await sharp({ text: textSpec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

function grainFilter() {
  return '<filter id="grain">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/>' +
    '</filter>';
}
const GRAIN_RECT = '<rect x="0" y="0" width="' + S + '" height="' + S + '" filter="url(#grain)" opacity="0.05"/>';
const PIN_DROP = '<filter id="pinDrop" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>';

// Amsterdam gable house silhouette (point / bell / step roofs) — same visual
// vocabulary as make-grid.js, scaled for a 1024 canvas.
function house(x, baseY, w, h, roof, fill) {
  const topY = baseY - h;
  if (roof === 'point') {
    return `<path d="M${r2(x)} ${baseY} L${r2(x)} ${r2(topY)} L${r2(x + w / 2)} ${r2(topY - w * 0.45)} L${r2(x + w)} ${r2(topY)} L${r2(x + w)} ${baseY} Z" fill="${fill}"/>`;
  }
  if (roof === 'bell') {
    const m = x + w / 2;
    return `<path d="M${r2(x)} ${baseY} L${r2(x)} ${r2(topY)} Q${r2(x)} ${r2(topY - w * 0.3)} ${r2(m)} ${r2(topY - w * 0.42)} Q${r2(x + w)} ${r2(topY - w * 0.3)} ${r2(x + w)} ${r2(topY)} L${r2(x + w)} ${baseY} Z" fill="${fill}"/>`;
  }
  const u = w / 6; // step gable
  return `<path d="M${r2(x)} ${baseY} L${r2(x)} ${r2(topY + u)} L${r2(x + u)} ${r2(topY + u)} L${r2(x + u)} ${r2(topY)} L${r2(x + 2.5 * u)} ${r2(topY)} L${r2(x + 2.5 * u)} ${r2(topY - u)} L${r2(x + 3.5 * u)} ${r2(topY - u)} L${r2(x + 3.5 * u)} ${r2(topY)} L${r2(x + 5 * u)} ${r2(topY)} L${r2(x + 5 * u)} ${r2(topY + u)} L${r2(x + w)} ${r2(topY + u)} L${r2(x + w)} ${baseY} Z" fill="${fill}"/>`;
}

// Deterministic skyline row (LCG, same recipe as make-grid.js).
function skyline(baseY, fill, seed, { minW = 70, maxW = 130, minH = 70, maxH = 160, gap = 12 } = {}) {
  const roofs = ['point', 'step', 'bell'];
  let out = '', x = -40, r = seed, i = seed;
  while (x < S + 40) {
    r = (r * 9301 + 49297) % 233280;
    const w = minW + (r / 233280) * (maxW - minW);
    r = (r * 9301 + 49297) % 233280;
    const h = minH + (r / 233280) * (maxH - minH);
    out += house(x, baseY, w, h, roofs[i % 3], fill);
    x += w + gap;
    i++;
  }
  return out;
}

// Solid-colour rays with round caps (direction-safe; gradient strokes misbehave
// on near-vertical lines because the objectBoundingBox degenerates).
function rays(cx, cy, rIn, rLong, rShort, count, color, opacity, wLong, wShort, angleOffset = 0) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = angleOffset + (i / count) * Math.PI * 2;
    const long = i % 2 === 0;
    const rOut = long ? rLong : rShort;
    const x1 = cx + Math.cos(a) * rIn, y1 = cy + Math.sin(a) * rIn;
    const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
    out += `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${long ? wLong : wShort}" stroke-linecap="round"/>`;
  }
  return out;
}

// Teardrop score pin — EXACT geometry of the live map / make-frame6.mjs:
// tail = 45-degree-rotated square (terracotta, NO border) drawn FIRST, head =
// circle with crisp white ring drawn ON TOP, cream score composited later.
function pinSvg(tipX, tipY, D) {
  const R = D / 2;
  const bw = 0.0625 * D;          // white ring width (2px at the app's 32px size)
  const s = 0.344 * D;            // tail square side
  const half = s / Math.SQRT2;    // half-diagonal of the rotated square
  const headCx = tipX;
  const headCy = tipY - R - half; // diamond bottom corner lands exactly on tipY
  const diamCy = headCy + R;
  const dTop = { x: headCx, y: diamCy - half };
  const dRight = { x: headCx + half, y: diamCy };
  const dBottom = { x: headCx, y: diamCy + half };
  const dLeft = { x: headCx - half, y: diamCy };
  const pts = [dTop, dRight, dBottom, dLeft];
  const diamondPts = pts.map((p) => r2(p.x) + ',' + r2(p.y)).join(' ');
  const shY = 8;
  const shadowPts = pts.map((p) => r2(p.x) + ',' + r2(p.y + shY)).join(' ');
  const shadow =
    '<g filter="url(#pinDrop)" opacity="0.25">' +
    '<polygon points="' + shadowPts + '" fill="#000000"/>' +
    '<circle cx="' + r2(headCx) + '" cy="' + r2(headCy + shY) + '" r="' + r2(R) + '" fill="#000000"/>' +
    '</g>';
  const pin =
    '<g shape-rendering="geometricPrecision">' +
    '<polygon points="' + diamondPts + '" fill="' + C.terracotta + '"/>' +
    '<circle cx="' + r2(headCx) + '" cy="' + r2(headCy) + '" r="' + r2(R - bw / 2) + '" fill="' + C.terracotta + '" stroke="' + C.white + '" stroke-width="' + r2(bw) + '"/>' +
    '</g>';
  return { svg: '<g>' + shadow + pin + '</g>', head: { cx: headCx, cy: headCy, r: R } };
}

// ---------------------------------------------------------------------------
// Design 1 — MONTHLY: "A sunny month." Morning light, low rising sun,
// small gable skyline, one pin. Light, airy, fresh.
// ---------------------------------------------------------------------------
function buildMonthly() {
  const sun = { cx: 512, cy: 700, r: 110 };
  const pin = pinSvg(730, 850, 120);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.sand}"/>
    <stop offset="36%" stop-color="${C.cream}"/>
    <stop offset="68%" stop-color="${C.mustard}"/>
    <stop offset="100%" stop-color="${C.peach}"/>
  </linearGradient>
  <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFF3D6" stop-opacity="0.85"/>
    <stop offset="45%" stop-color="#FFE7B8" stop-opacity="0.38"/>
    <stop offset="100%" stop-color="#FFE7B8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="core" cx="46%" cy="42%" r="60%">
    <stop offset="0%" stop-color="#FFFEF8"/>
    <stop offset="42%" stop-color="#FFF0C8"/>
    <stop offset="80%" stop-color="#FBC97E"/>
    <stop offset="100%" stop-color="${C.peach}"/>
  </radialGradient>
  ${PIN_DROP}
  ${grainFilter()}
</defs>
<rect width="${S}" height="${S}" fill="url(#sky)"/>
<g opacity="0.5">
  <ellipse cx="232" cy="372" rx="118" ry="20" fill="${C.white}"/>
  <ellipse cx="296" cy="346" rx="62" ry="13" fill="${C.white}"/>
  <ellipse cx="800" cy="300" rx="92" ry="16" fill="${C.white}"/>
  <ellipse cx="744" cy="326" rx="48" ry="10" fill="${C.white}"/>
</g>
<circle cx="${sun.cx}" cy="${sun.cy}" r="310" fill="url(#bloom)"/>
${rays(sun.cx, sun.cy, 134, 206, 172, 14, '#FFF6DC', 0.85, 6, 4)}
<circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r}" fill="url(#core)"/>
${skyline(S + 2, C.burnt, 7, { minH: 95, maxH: 165 })}
${skyline(S + 2, C.terracotta, 13, { minH: 55, maxH: 115, minW: 60, maxW: 110 })}
${pin.svg}
${GRAIN_RECT}
</svg>`;

  return {
    name: 'promo-monthly.png',
    svg,
    eyebrow: { text: 'MONTHLY', color: C.burnt, top: 118 },
    headline: { text: 'A month of sun.', color: C.ink, size: 44 },
    pinHead: pin.head,
    score: '82',
    scoreFont: 28,
  };
}

// ---------------------------------------------------------------------------
// Design 2 — YEARLY: "Every golden hour, all year." Full sunset spectrum,
// dotted sun-path arc (sunrise to noon to sunset) with three suns, pin centred.
// ---------------------------------------------------------------------------
function buildYearly() {
  // Quadratic sun path: P0(140,740) - P1(512,120) - P2(884,740); apex y=455.
  const arcPath = 'M 140 740 Q 512 120 884 740';
  const noon = { cx: 512, cy: 455 };     // t = 0.5 on the curve
  const sunrise = { cx: 214, cy: 628 };  // t = 0.1
  const sunset = { cx: 810, cy: 628 };   // t = 0.9
  const pin = pinSvg(512, 880, 120);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.mustard}"/>
    <stop offset="38%" stop-color="${C.peach}"/>
    <stop offset="70%" stop-color="${C.burnt}"/>
    <stop offset="100%" stop-color="${C.terracotta}"/>
  </linearGradient>
  <radialGradient id="bloomNoon" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFF3D6" stop-opacity="0.75"/>
    <stop offset="50%" stop-color="#FFE2A8" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#FFE2A8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="bloomSmall" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFF3D6" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="#FFF3D6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="coreNoon" cx="46%" cy="42%" r="60%">
    <stop offset="0%" stop-color="#FFFDF4"/>
    <stop offset="45%" stop-color="#FFE9B4"/>
    <stop offset="100%" stop-color="${C.peach}"/>
  </radialGradient>
  <radialGradient id="coreRise" cx="46%" cy="42%" r="60%">
    <stop offset="0%" stop-color="#FFF8E2"/>
    <stop offset="55%" stop-color="${C.mustard}"/>
    <stop offset="100%" stop-color="${C.orange}"/>
  </radialGradient>
  <radialGradient id="coreSet" cx="46%" cy="42%" r="60%">
    <stop offset="0%" stop-color="#FFE9C2"/>
    <stop offset="55%" stop-color="${C.peach}"/>
    <stop offset="100%" stop-color="${C.burnt}"/>
  </radialGradient>
  ${PIN_DROP}
  ${grainFilter()}
</defs>
<rect width="${S}" height="${S}" fill="url(#sky)"/>
<path d="${arcPath}" fill="none" stroke="${C.cream}" stroke-opacity="0.95" stroke-width="8.5" stroke-linecap="round" stroke-dasharray="0.01 27"/>
<circle cx="${noon.cx}" cy="${noon.cy}" r="170" fill="url(#bloomNoon)"/>
<circle cx="${sunrise.cx}" cy="${sunrise.cy}" r="92" fill="url(#bloomSmall)"/>
<circle cx="${sunset.cx}" cy="${sunset.cy}" r="108" fill="url(#bloomSmall)"/>
${rays(noon.cx, noon.cy, 62, 96, 80, 12, '#FFF3D6', 0.9, 5, 3.5)}
${rays(sunrise.cx, sunrise.cy, 46, 70, 58, 10, '#FFF6DC', 0.95, 4, 3)}
${rays(sunset.cx, sunset.cy, 54, 80, 66, 10, '#FFF0CC', 0.95, 4.5, 3.2)}
<circle cx="${noon.cx}" cy="${noon.cy}" r="48" fill="url(#coreNoon)"/>
<circle cx="${sunrise.cx}" cy="${sunrise.cy}" r="34" fill="url(#coreRise)"/>
<circle cx="${sunset.cx}" cy="${sunset.cy}" r="42" fill="url(#coreSet)"/>
${skyline(S + 2, '#8A331A', 21, { minH: 110, maxH: 185 })}
${skyline(S + 2, '#5E230F', 5, { minH: 65, maxH: 125, minW: 60, maxW: 110 })}
${pin.svg}
${GRAIN_RECT}
</svg>`;

  return {
    name: 'promo-yearly.png',
    svg,
    eyebrow: { text: 'YEARLY', color: C.cocoa, top: 118 },
    headline: { text: 'Every golden hour,\nall year.', color: C.ink, size: 36 },
    pinHead: pin.head,
    score: '91',
    scoreFont: 28,
  };
}

// ---------------------------------------------------------------------------
// Design 3 — LIFETIME: "Forever golden." Deep premium dark palette, one large
// radiant sun dominating the centre, tiny dark skyline, pin 99.
// ---------------------------------------------------------------------------
function buildLifetime() {
  const sun = { cx: 512, cy: 565, r: 165 };
  const pin = pinSvg(512, 930, 130);
  // Tiny star field in the dark upper sky (deterministic, kept off-centre).
  const stars = [
    [128, 168, 2.6, 0.7], [236, 300, 1.9, 0.5], [170, 452, 2.2, 0.55],
    [318, 152, 1.7, 0.45], [872, 188, 2.6, 0.7], [792, 320, 1.9, 0.5],
    [902, 440, 2.2, 0.55], [700, 150, 1.7, 0.45], [90, 600, 1.8, 0.4],
    [936, 590, 1.8, 0.4],
  ].map(([x, y, r, o]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.mustard + '" fill-opacity="' + o + '"/>').join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <radialGradient id="sky" gradientUnits="userSpaceOnUse" cx="${sun.cx}" cy="${sun.cy}" r="780">
    <stop offset="0%" stop-color="${C.terracotta}"/>
    <stop offset="48%" stop-color="${C.cocoa}"/>
    <stop offset="100%" stop-color="${C.ink}"/>
  </radialGradient>
  <radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="512" cy="512" r="740">
    <stop offset="62%" stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#1A120B" stop-opacity="0.55"/>
  </radialGradient>
  <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFE3B0" stop-opacity="0.7"/>
    <stop offset="38%" stop-color="#FBA85A" stop-opacity="0.3"/>
    <stop offset="70%" stop-color="#FBA85A" stop-opacity="0.1"/>
    <stop offset="100%" stop-color="#FBA85A" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="core" cx="44%" cy="40%" r="62%">
    <stop offset="0%" stop-color="#FFFFFF"/>
    <stop offset="30%" stop-color="#FFF3CE"/>
    <stop offset="68%" stop-color="${C.peach}"/>
    <stop offset="100%" stop-color="${C.burnt}"/>
  </radialGradient>
  ${PIN_DROP}
  ${grainFilter()}
</defs>
<rect width="${S}" height="${S}" fill="url(#sky)"/>
${stars}
<circle cx="${sun.cx}" cy="${sun.cy}" r="470" fill="url(#bloom)"/>
${rays(sun.cx, sun.cy, 198, 304, 250, 16, '#FFE7B0', 0.85, 5, 3.2, Math.PI / 16)}
<circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r}" fill="url(#core)"/>
${skyline(S + 2, '#140D08', 31, { minH: 45, maxH: 90, minW: 55, maxW: 100 })}
<rect width="${S}" height="${S}" fill="url(#vignette)"/>
${pin.svg}
${GRAIN_RECT}
</svg>`;

  return {
    name: 'promo-lifetime.png',
    svg,
    eyebrow: { text: 'LIFETIME', color: C.mustard, top: 112 },
    headline: { text: 'Forever golden.', color: C.cream, size: 44 },
    pinHead: pin.head,
    score: '99',
    scoreFont: 30,
  };
}

// ---------------------------------------------------------------------------
// Render pipeline: SVG scene, then Pango text layers, then flatten and strip
// alpha; verify 1024x1024 + opaque (3 channels, no alpha) or throw.
// ---------------------------------------------------------------------------
async function buildImage(design) {
  const base = await sharp(Buffer.from(design.svg)).png().toBuffer();
  const layers = [];

  // Eyebrow label: small uppercase Inter SemiBold, letter-spaced, centred.
  const eb = await renderText({
    markup: '<span foreground="' + design.eyebrow.color + '" letter_spacing="9000">' + design.eyebrow.text + '</span>',
    font: 'Inter SemiBold 12', fontfile: INTER_SEMIBOLD,
  });
  layers.push({ input: eb.buffer, left: Math.round((S - eb.width) / 2), top: design.eyebrow.top });

  // Headline: Fraunces Bold, centred below the eyebrow.
  const hl = await renderText({
    markup: '<span foreground="' + design.headline.color + '">' + design.headline.text + '</span>',
    font: 'Fraunces ' + design.headline.size, fontfile: FRAUNCES_BOLD, spacing: -4,
  });
  const hlTop = design.eyebrow.top + eb.height + 26;
  layers.push({ input: hl.buffer, left: Math.round((S - hl.width) / 2), top: hlTop });

  // Pin score: cream Fraunces, trimmed to glyph ink, dead-centred in the head.
  const sc = await renderText({
    markup: '<span foreground="' + C.cream + '">' + design.score + '</span>',
    font: 'Fraunces ' + design.scoreFont, fontfile: FRAUNCES_BOLD,
  });
  const scBuf = await sharp(sc.buffer).trim({ threshold: 10 }).png().toBuffer();
  const scMeta = await sharp(scBuf).metadata();
  layers.push({
    input: scBuf,
    left: Math.round(design.pinHead.cx - scMeta.width / 2),
    top: Math.round(design.pinHead.cy - scMeta.height / 2),
  });

  const outPath = path.join(OUT_DIR, design.name);
  const composed = await sharp(base).composite(layers).png().toBuffer();
  await sharp(composed).flatten({ background: C.ink }).removeAlpha().png().toFile(outPath);

  const meta = await sharp(outPath).metadata();
  if (meta.width !== S || meta.height !== S) {
    throw new Error(design.name + ': SIZE WRONG - got ' + meta.width + 'x' + meta.height + ', expected ' + S + 'x' + S);
  }
  if (meta.hasAlpha || meta.channels !== 3) {
    throw new Error(design.name + ': NOT OPAQUE - channels=' + meta.channels + ', hasAlpha=' + meta.hasAlpha);
  }
  console.log('OK  ' + design.name + '  ' + meta.width + 'x' + meta.height + '  channels=' + meta.channels + '  hasAlpha=' + meta.hasAlpha);
  return outPath;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const design of [buildMonthly(), buildYearly(), buildLifetime()]) {
    await buildImage(design);
  }
  console.log('All three IAP promos written to', OUT_DIR);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
