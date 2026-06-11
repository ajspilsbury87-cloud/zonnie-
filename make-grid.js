/* Zonnie Instagram 3x3 grid generator.
 * Builds one 3240x3240 "sunset over Amsterdam" master, then slices it into
 * nine 1080x1080 tiles. Profile grid = one cohesive scene; each tile also
 * carries a standalone message. Pure SVG -> PNG via sharp.
 *
 * TEXT RENDERING: sharp's SVG rasteriser (resvg) has no font engine wired up
 * on this Windows box, so SVG <text> silently renders nothing. We instead
 * convert every glyph to a vector <path> up-front with opentype.js, which
 * needs no font engine at raster time. See textPath() below. */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');

const OUT = 'C:\\Users\\andys\\OneDrive\\Documents\\Zonnie-Marketing\\instagram-grid';
fs.mkdirSync(OUT, { recursive: true });

const W = 3240, T = 1080;

// --- palette (from src/theme/tokens.ts) ---
const C = {
  cream: '#FFE5C2', mustard: '#F4D58D', peach: '#FBA85A', orange: '#E89C5A',
  burnt: '#D9633E', terracotta: '#B14222', cocoa: '#7A2E14',
  ink: '#2A1F15', inkSoft: '#5A4A38', sand: '#FFF8F0', mist: '#E8DCC8',
};

// --- fonts (Windows system TTFs, parsed to outlines via opentype.js) ---
// opentype 2.x: loadSync is deprecated and returns undefined — use parse().
//   georgiab = Georgia Bold (display bold)      georgiai = Georgia Italic (display italic)
//   georgiaz = Georgia Bold Italic              georgia  = Georgia Regular (hero serif lines;
//                                                          not in the original 5-font brief but
//                                                          required by the existing copy)
//   seguisb  = Segoe UI Semibold (sans 600)     segoeui  = Segoe UI Regular (sans normal)
const FONT_DIR = 'C:\\Windows\\Fonts';
const loadFont = (file) => opentype.parse(fs.readFileSync(path.join(FONT_DIR, file)));
const FONTS = {
  gBold:       loadFont('georgiab.ttf'),
  gItalic:     loadFont('georgiai.ttf'),
  gBoldItalic: loadFont('georgiaz.ttf'),
  gReg:        loadFont('georgia.ttf'),
  sSemi:       loadFont('seguisb.ttf'),
  sReg:        loadFont('segoeui.ttf'),
};

// --- text -> vector path ---
// Renders `str` as a filled <path> using `font`, honouring text-anchor
// (start|middle|end) via getAdvanceWidth, mirroring the SVG semantics the
// old <text> elements relied on. `letterSpacing` (px) reproduces the one
// tracked line; 0 keeps the font's native kerning by drawing the whole
// string in a single getPath call.
function textPath(str, x, y, sizePx, font, fill, anchor = 'start', letterSpacing = 0) {
  const chars = Array.from(str);

  // Total advance so we can offset the start for middle/end anchoring.
  let totalWidth;
  if (letterSpacing === 0) {
    totalWidth = font.getAdvanceWidth(str, sizePx);
  } else {
    totalWidth =
      chars.reduce((sum, ch) => sum + font.getAdvanceWidth(ch, sizePx), 0) +
      letterSpacing * Math.max(0, chars.length - 1);
  }

  let startX = x;
  if (anchor === 'middle') startX = x - totalWidth / 2;
  else if (anchor === 'end') startX = x - totalWidth;

  let d;
  if (letterSpacing === 0) {
    d = font.getPath(str, startX, y, sizePx).toPathData(2);
  } else {
    let cursor = startX;
    d = '';
    for (const ch of chars) {
      d += font.getPath(ch, cursor, y, sizePx).toPathData(2);
      cursor += font.getAdvanceWidth(ch, sizePx) + letterSpacing;
    }
  }

  return `<path d="${d}" fill="${fill}"/>`;
}

// --- helpers ---
function pin(x, tipY, score, s) {
  // app-style teardrop: 40x56 box, tip at bottom-center (20,56), head ~ (20,20)
  const tx = x - 20 * s, ty = tipY - 56 * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})">
    <path d="M20 2C10 2 1.5 10.5 1.5 21c0 13.5 18.5 33 18.5 33s18.5-19.5 18.5-33C38.5 10.5 30 2 20 2z"
      fill="${C.burnt}" stroke="#FFFFFF" stroke-width="2.5"/>
    ${textPath(String(score), 20, 27, 17, FONTS.gBold, C.cream, 'middle')}
  </g>`;
}

function house(x, baseY, w, h, roof, fill) {
  // simple Amsterdam gable silhouette
  const topY = baseY - h;
  if (roof === 'point') {
    return `<path d="M${x} ${baseY} L${x} ${topY} L${x + w / 2} ${topY - w * 0.45} L${x + w} ${topY} L${x + w} ${baseY} Z" fill="${fill}"/>`;
  }
  if (roof === 'bell') {
    const m = x + w / 2;
    return `<path d="M${x} ${baseY} L${x} ${topY} Q${x} ${topY - w * 0.3} ${m} ${topY - w * 0.42} Q${x + w} ${topY - w * 0.3} ${x + w} ${topY} L${x + w} ${baseY} Z" fill="${fill}"/>`;
  }
  // step gable
  const u = w / 6;
  return `<path d="M${x} ${baseY} L${x} ${topY + u} L${x + u} ${topY + u} L${x + u} ${topY} L${x + 2.5 * u} ${topY} L${x + 2.5 * u} ${topY - u} L${x + 3.5 * u} ${topY - u} L${x + 3.5 * u} ${topY} L${x + 5 * u} ${topY} L${x + 5 * u} ${topY + u} L${x + w} ${topY + u} L${x + w} ${baseY} Z" fill="${fill}"/>`;
}

// --- skyline rows (back darker, front darker still) ---
function skyline(baseY, fill, seed) {
  const roofs = ['point', 'step', 'bell'];
  let s = '', x = -40;
  let r = seed;
  while (x < W + 40) {
    r = (r * 9301 + 49297) % 233280;
    const rnd = r / 233280;
    const w = 120 + Math.floor(rnd * 90);
    const h = 150 + Math.floor(((r >> 3) % 200));
    const roof = roofs[(x + seed) % 3];
    s += house(x, baseY, w, h, roof, fill);
    x += w + 18;
  }
  return s;
}

// --- sun rays ---
function rays(cx, cy, rIn, rOut, n, color, op) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * rIn, y1 = cy + Math.sin(a) * rIn;
    const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity="${op}"/>`;
  }
  return s;
}

const sunX = 1620, sunY = 1120, sunR = 470;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.sand}"/>
      <stop offset="12%" stop-color="#FFE9CC"/>
      <stop offset="26%" stop-color="${C.mustard}"/>
      <stop offset="44%" stop-color="${C.peach}"/>
      <stop offset="62%" stop-color="#E07E44"/>
      <stop offset="80%" stop-color="${C.terracotta}"/>
      <stop offset="100%" stop-color="${C.cocoa}"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF6DE"/>
      <stop offset="55%" stop-color="#FDC877"/>
      <stop offset="100%" stop-color="${C.peach}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFE9C0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#FFE9C0" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${W}" fill="url(#sky)"/>

  <!-- sun glow + rays + disc -->
  <circle cx="${sunX}" cy="${sunY}" r="${sunR + 320}" fill="url(#glow)"/>
  ${rays(sunX, sunY, sunR + 40, sunR + 180, 24, '#FFEFCB', 0.5)}
  <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="url(#sun)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR - 150}" fill="#FFF1CF" opacity="0.45"/>

  <!-- reflective water/canal bands near horizon -->
  <g opacity="0.9">
    <rect x="0" y="2070" width="${W}" height="22" fill="${C.cream}" opacity="0.5"/>
    <rect x="0" y="2120" width="${W}" height="70" fill="${C.terracotta}"/>
    <rect x="0" y="2196" width="${W}" height="16" fill="${C.cream}" opacity="0.45"/>
    <rect x="0" y="2218" width="${W}" height="64" fill="#9E3A1E"/>
    <rect x="0" y="2288" width="${W}" height="12" fill="${C.cream}" opacity="0.35"/>
  </g>

  <!-- skylines: back then front -->
  ${skyline(2120, '#8A331A', 7)}
  ${skyline(2120, '#5E230F', 13)}

  <!-- terrace pins on the skyline -->
  ${pin(1500, 2110, 78, 1.6)}
  ${pin(1840, 2070, 85, 1.8)}

  <!-- ===================== TEXT (per-tile, edge-safe) ===================== -->

  <!-- Tile 1 (TL): wordmark -->
  ${textPath('Zonnie', 150, 430, 172, FONTS.gBold, C.ink, 'start')}
  ${textPath('AMSTERDAM TERRACES', 158, 510, 46, FONTS.sReg, C.inkSoft, 'start', 8)}

  <!-- Tile 3 (TR): italic line -->
  ${textPath('Know before', 3090, 360, 92, FONTS.gItalic, C.cocoa, 'end')}
  ${textPath('you go.', 3090, 468, 92, FONTS.gItalic, C.cocoa, 'end')}

  <!-- Tile 4 (ML): big stat -->
  ${textPath('1,000+', 540, 1560, 172, FONTS.gBold, C.sand, 'middle')}
  ${textPath('terraces,', 540, 1660, 62, FONTS.sSemi, C.ink, 'middle')}
  ${textPath('scored for sun', 540, 1740, 62, FONTS.sSemi, C.ink, 'middle')}

  <!-- Tile 5 (C): HERO -->
  <rect x="1190" y="1410" width="860" height="430" rx="44" fill="${C.sand}" fill-opacity="0.93" stroke="${C.mist}" stroke-width="3"/>
  ${textPath('Find the terrace', 1620, 1545, 92, FONTS.gReg, C.ink, 'middle')}
  ${textPath("that's in the sun", 1620, 1660, 92, FONTS.gReg, C.ink, 'middle')}
  ${textPath('right now.', 1620, 1790, 104, FONTS.gBoldItalic, C.burnt, 'middle')}

  <!-- Tile 6 (MR): how -->
  ${textPath('Live weather', 2700, 1540, 64, FONTS.sSemi, C.ink, 'middle')}
  ${textPath('+ real building', 2700, 1632, 64, FONTS.sSemi, C.ink, 'middle')}
  ${textPath('shadows', 2700, 1724, 64, FONTS.sSemi, C.ink, 'middle')}

  <!-- Tile 7 (BL): pin + label -->
  ${pin(440, 2330, 92, 2.4)}
  ${textPath('Scored 0–100', 470, 2520, 60, FONTS.sSemi, C.sand, 'middle')}
  ${textPath('for sun', 470, 2598, 60, FONTS.sSemi, C.sand, 'middle')}

  <!-- Tile 8 (BC): caption under skyline -->
  ${textPath('every hour, every day', 1620, 3010, 74, FONTS.gItalic, C.cream, 'middle')}

  <!-- Tile 9 (BR): CTA -->
  ${textPath('Free', 2700, 2560, 130, FONTS.gBold, C.sand, 'middle')}
  ${textPath('on iOS', 2700, 2700, 130, FONTS.gBold, C.sand, 'middle')}
  ${textPath('search “Zonnie”', 2700, 2810, 56, FONTS.sReg, C.cream, 'middle')}
</svg>`;

(async () => {
  fs.writeFileSync(path.join(OUT, '_debug.svg'), svg, 'utf8');
  const masterPng = path.join(OUT, '_master.png');
  await sharp(Buffer.from(svg)).png().toFile(masterPng);

  // downscaled full preview
  await sharp(masterPng).resize(1080, 1080).png().toFile(path.join(OUT, '_preview-grid.png'));

  // slice into 9 tiles, named for IG posting order (see README)
  let n = 1;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      await sharp(masterPng)
        .extract({ left: col * T, top: row * T, width: T, height: T })
        .png()
        .toFile(path.join(OUT, `tile-${n}.png`));
      n++;
    }
  }
  console.log('DONE: wrote _master.png, _preview-grid.png, tile-1..9.png to ' + OUT);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
