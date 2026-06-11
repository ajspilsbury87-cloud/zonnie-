// =============================================================================
// make-frame6.mjs  —  Zonnie App Store screenshot "frame 6 / 06-lidar"
// -----------------------------------------------------------------------------
// HIGH-END rebuild. Target: Apple-keynote / premium architecture-studio polish.
// Output: EXACTLY 1290 x 2796 px PNG (iPhone 6.7"). Verified in-script.
//
// TWO PROVEN TECHNIQUES ONLY (sharp v0.34.5 only, no extra packages):
//   1. The whole scene is ONE big SVG string rasterised via sharp(Buffer).
//   2. All TEXT is rendered separately with sharp's font engine (Pango markup)
//      using the real brand fonts, then composited on top.
//
// LIGHTING: sun is TOP-RIGHT; light travels down-and-left. Roofs lighten toward
// the sun; the sun-facing wall is mid tone, the away wall darkest; sun-facing
// rooftop edges get a warm amber rim; cast shadows fall AWAY from the sun
// (lower-left), soft/feathered, fading to transparent at the tips.
//
// Run:  node scripts/marketing/make-frame6.mjs
// =============================================================================

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const FRAUNCES_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const INTER_REGULAR = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const INTER_MEDIUM = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf');
const INTER_SEMIBOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const BUILDINGS_JSON = path.join(ROOT, 'src/data/buildings.json');
const OUT_DIR = path.join(ROOT, 'marketing/screenshots/store');
const OUT_PATH = path.join(OUT_DIR, '06-lidar.png');

// Brand tokens (exact hex from src/theme/tokens.ts — read-only source).
const C = {
  cream: '#FFE5C2', mustard: '#F4D58D', peach: '#FBA85A', orange: '#E89C5A',
  burnt: '#D9633E', terracotta: '#B14222', cocoa: '#7A2E14', ink: '#2A1F15',
  inkSoft: '#5A4A38', sand: '#FFF8F0', sandDeep: '#F4ECE0', mist: '#E8DCC8',
  mistDeep: '#C8B89A', white: '#FFFFFF', black: '#000000',
};

const W = 1290;
const H = 2796;
const BAND_BOTTOM = 880;
const r2 = (n) => Math.round(n * 100) / 100;

async function renderText({ markup, font, fontfile, dpi, width, align = 'centre', spacing }) {
  const textSpec = { text: markup, font, fontfile, rgba: true, dpi, align };
  if (width) textSpec.width = width;
  if (spacing != null) textSpec.spacing = spacing;
  const buffer = await sharp({ text: textSpec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

const DEVICE = { x: 64, y: BAND_BOTTOM + 24, w: W - 128, radius: 56 };
DEVICE.h = H - DEVICE.y - 64;
DEVICE.right = DEVICE.x + DEVICE.w;
DEVICE.bottom = DEVICE.y + DEVICE.h;
DEVICE.cx = DEVICE.x + DEVICE.w / 2;

const SUN = { cx: DEVICE.right - 150, cy: DEVICE.y + 175, r: 66 };

const SCENE = { left: DEVICE.x + 90, right: DEVICE.right - 95, top: DEVICE.y + 300, bottom: DEVICE.bottom - 560 };
SCENE.w = SCENE.right - SCENE.left;
SCENE.h = SCENE.bottom - SCENE.top;

function loadBuildings() {
  const all = JSON.parse(readFileSync(BUILDINGS_JSON, 'utf8'));
  const cluster = all['45'];
  if (!cluster || !Array.isArray(cluster)) throw new Error('buildings.json: terrace id 45 not found or not an array');
  const seen = new Set();
  const unique = [];
  for (const b of cluster) {
    const sig = JSON.stringify(b.poly);
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(b);
  }
  const sorted = unique.slice().sort((a, b) => b.height - a.height);
  const target = Math.min(20, sorted.length);
  const step = sorted.length / target;
  const picked = [];
  for (let i = 0; i < target; i++) picked.push(sorted[Math.floor(i * step)]);
  return picked;
}

function makeProjector(buildings) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const b of buildings) for (const [lat, lng] of b.poly) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  const latMid = (minLat + maxLat) / 2;
  const mPerLat = 111000;
  const mPerLng = 111000 * Math.cos((latMid * Math.PI) / 180);
  const worldWidthM = (maxLng - minLng) * mPerLng;
  const worldHeightM = (maxLat - minLat) * mPerLat;
  const fit = 0.86;
  const scale = Math.min((SCENE.w * fit) / worldWidthM, (SCENE.h * fit) / worldHeightM);
  const drawnW = worldWidthM * scale;
  const drawnH = worldHeightM * scale;
  const offX = SCENE.left + (SCENE.w - drawnW) / 2;
  const offY = SCENE.top + (SCENE.h - drawnH) * 0.32;
  function project(lat, lng) {
    const xM = (lng - minLng) * mPerLng;
    const yM = (maxLat - lat) * mPerLat;
    return { x: offX + xM * scale, y: offY + yM * scale };
  }
  return { project, scale, bbox: { minLat, maxLat, minLng, maxLng } };
}

function polyPointsAttr(points) { return points.map((p) => r2(p.x) + ',' + r2(p.y)).join(' '); }

function buildSceneSvg(buildings, projector) {
  const { project } = projector;

  const shadowDirX = -0.66, shadowDirY = 0.75, shadowPerMetre = 6.4;
  const extPerMetreX = 1.7, extPerMetreY = 3.0;

  const prepared = buildings.map((b) => {
    const footprint = b.poly.map(([lat, lng]) => project(lat, lng));
    const anchorY = Math.max(...footprint.map((p) => p.y));
    const cx = footprint.reduce((s, p) => s + p.x, 0) / footprint.length;
    const cy = footprint.reduce((s, p) => s + p.y, 0) / footprint.length;
    return { b, footprint, anchorY, cx, cy };
  });
  prepared.sort((a, b) => a.anchorY - b.anchorY);

  // Soft cast shadows (one smear per building, blurred together, fading), plus
  // a tight contact smear at the base for grounding / ambient occlusion.
  const longShadowParts = [];
  const contactParts = [];
  for (const { b, footprint } of prepared) {
    const sLen = b.height * shadowPerMetre;
    const tip = footprint.map((p) => ({ x: p.x + shadowDirX * sLen, y: p.y + shadowDirY * sLen }));
    longShadowParts.push('<polygon points="' + polyPointsAttr([...footprint, ...tip.slice().reverse()]) + '" fill="url(#shadowFade)"/>');
    const cl = Math.min(22, sLen * 0.28);
    const ct = footprint.map((p) => ({ x: p.x + shadowDirX * cl, y: p.y + shadowDirY * cl }));
    contactParts.push('<polygon points="' + polyPointsAttr([...footprint, ...ct.slice().reverse()]) + '" fill="#05070C" fill-opacity="0.5"/>');
  }

  // Extruded, lit blocks. Walls toned by sun-facing; roof gradient; amber rim.
  const sunVx = 0.6, sunVy = -0.8;
  const buildingParts = [];
  for (const { b, footprint, cx, cy } of prepared) {
    const h = b.height;
    const dx = h * extPerMetreX, dy = -h * extPerMetreY;
    const roof = footprint.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    const n = footprint.length;
    const faces = [];
    const rimEdges = [];
    for (let i = 0; i < n; i++) {
      const a = footprint[i], c = footprint[(i + 1) % n];
      const ar = roof[i], cr = roof[(i + 1) % n];
      const ex = c.x - a.x, ey = c.y - a.y;
      let nx = ey, ny = -ex;
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const facing = nx * sunVx + ny * sunVy;
      const wallGrad = facing > 0.15 ? 'wallSun' : (facing < -0.15 ? 'wallDark' : 'wallMid');
      // Crisp solid edge stroke on every wall face — thin, fully opaque, sharp.
      faces.push('<polygon points="' + polyPointsAttr([a, c, cr, ar]) + '" fill="url(#' + wallGrad + ')" stroke="#141C26" stroke-width="1.1" stroke-linejoin="round"/>');
      if (facing > 0.2) rimEdges.push('<line x1="' + r2(ar.x) + '" y1="' + r2(ar.y) + '" x2="' + r2(cr.x) + '" y2="' + r2(cr.y) + '" stroke="url(#rimGrad)" stroke-width="2.4" stroke-linecap="round"/>');
    }
    // Crisp roof: solid fill, thin fully-opaque edge so the cap reads as a sharp plane.
    const roofPoly = '<polygon points="' + polyPointsAttr(roof) + '" fill="url(#roofGrad)" stroke="#B7C8D6" stroke-width="1.1" stroke-linejoin="round"/>';
    buildingParts.push('<g>' + faces.join('') + roofPoly + rimEdges.join('') + '</g>');
  }

  // Sun: white-hot core -> amber -> transparent bloom, with refined rays.
  const rays = [];
  const rayCount = 16;
  for (let i = 0; i < rayCount; i++) {
    const ang = (i / rayCount) * Math.PI * 2;
    const long = i % 2 === 0;
    const rInner = SUN.r + 18, rOuter = SUN.r + (long ? 70 : 44);
    const x1 = SUN.cx + Math.cos(ang) * rInner, y1 = SUN.cy + Math.sin(ang) * rInner;
    const x2 = SUN.cx + Math.cos(ang) * rOuter, y2 = SUN.cy + Math.sin(ang) * rOuter;
    rays.push('<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="url(#rayGrad)" stroke-width="' + (long ? 5 : 3.5) + '" stroke-linecap="round"/>');
  }
  const sunGlyph = '<g>' +
    '<circle cx="' + SUN.cx + '" cy="' + SUN.cy + '" r="' + (SUN.r + 150) + '" fill="url(#sunBloom)"/>' +
    rays.join('') +
    '<circle cx="' + SUN.cx + '" cy="' + SUN.cy + '" r="' + SUN.r + '" fill="url(#sunCore)"/></g>';

  // Faint long light streaks raking from the sun toward lower-left.
  const streaks = [];
  const streakCount = 5;
  for (let i = 0; i < streakCount; i++) {
    const t = i / (streakCount - 1);
    const sx = SUN.cx - 40 - t * 360, sy = SUN.cy + 10 + t * 110;
    streaks.push('<line x1="' + r2(sx) + '" y1="' + r2(sy) + '" x2="' + r2(sx - 720) + '" y2="' + r2(sy + 560) + '" stroke="url(#streakGrad)" stroke-width="' + (10 - i) + '"/>');
  }

  // Hero pin in an open sunlit gap below-and-right of the cluster.
  const pinGeo = project(52.37982, 4.88846);
  const pin = makePinSvg(pinGeo.x, pinGeo.y);

  // Annotation: slim low-opacity dark pill near the bottom of the card.
  const annoH = 92, annoW = DEVICE.w - 150;
  const annoX = DEVICE.x + (DEVICE.w - annoW) / 2;
  const annoY = DEVICE.bottom - 70 - annoH;
  const annoBox = '<rect x="' + r2(annoX) + '" y="' + r2(annoY) + '" width="' + r2(annoW) + '" height="' + annoH + '" rx="' + (annoH / 2) + '" ry="' + (annoH / 2) + '" fill="#070B12" fill-opacity="0.55" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1"/>';
  buildSceneSvg.anno = { x: annoX, y: annoY, w: annoW, h: annoH };

  const svg =
'<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
'<defs>' +
  '<linearGradient id="bandGrad" x1="0" y1="0" x2="0.15" y2="1">' +
    '<stop offset="0%" stop-color="' + C.sand + '"/><stop offset="42%" stop-color="' + C.cream + '"/>' +
    '<stop offset="80%" stop-color="#FCD9AE"/><stop offset="100%" stop-color="#FAC98F"/></linearGradient>' +
  '<radialGradient id="bandBloom" cx="78%" cy="20%" r="60%">' +
    '<stop offset="0%" stop-color="#FFF3DF" stop-opacity="0.9"/><stop offset="60%" stop-color="#FFF3DF" stop-opacity="0.0"/></radialGradient>' +
  '<linearGradient id="cardBase" x1="0" y1="0" x2="0.3" y2="1">' +
    '<stop offset="0%" stop-color="#1B2738"/><stop offset="100%" stop-color="#0C1320"/></linearGradient>' +
  '<radialGradient id="cardGlow" gradientUnits="userSpaceOnUse" cx="' + SUN.cx + '" cy="' + SUN.cy + '" r="' + (DEVICE.w * 0.95) + '">' +
    '<stop offset="0%" stop-color="#5A6E7E" stop-opacity="0.55"/><stop offset="22%" stop-color="#33455A" stop-opacity="0.40"/>' +
    '<stop offset="55%" stop-color="#16202E" stop-opacity="0.12"/><stop offset="100%" stop-color="#0A0F18" stop-opacity="0.0"/></radialGradient>' +
  '<radialGradient id="cardVignette" gradientUnits="userSpaceOnUse" cx="' + DEVICE.cx + '" cy="' + (DEVICE.y + DEVICE.h * 0.5) + '" r="' + (DEVICE.h * 0.62) + '">' +
    '<stop offset="55%" stop-color="#000000" stop-opacity="0.0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.45"/></radialGradient>' +
  '<linearGradient id="roofGrad" x1="0" y1="0" x2="1" y2="0.5">' +
    '<stop offset="0%" stop-color="#7E94A8"/><stop offset="60%" stop-color="#9FB4C6"/><stop offset="100%" stop-color="#C2D3E0"/></linearGradient>' +
  '<linearGradient id="wallSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#566C80"/><stop offset="100%" stop-color="#33424F"/></linearGradient>' +
  '<linearGradient id="wallMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3E4F5E"/><stop offset="100%" stop-color="#27323D"/></linearGradient>' +
  '<linearGradient id="wallDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2B3742"/><stop offset="100%" stop-color="#19222B"/></linearGradient>' +
  '<linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#FFB870" stop-opacity="0.35"/><stop offset="100%" stop-color="#FFD9A8" stop-opacity="0.95"/></linearGradient>' +
  '<linearGradient id="shadowFade" x1="0" y1="0" x2="-0.66" y2="0.75"><stop offset="0%" stop-color="#03050A" stop-opacity="0.62"/><stop offset="70%" stop-color="#03050A" stop-opacity="0.18"/><stop offset="100%" stop-color="#03050A" stop-opacity="0.0"/></linearGradient>' +
  '<radialGradient id="sunCore" cx="42%" cy="40%" r="62%">' +
    '<stop offset="0%" stop-color="#FFFDF6"/><stop offset="35%" stop-color="#FFE7B0"/>' +
    '<stop offset="72%" stop-color="' + C.peach + '"/><stop offset="100%" stop-color="' + C.burnt + '"/></radialGradient>' +
  '<radialGradient id="sunBloom" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#FFE3B0" stop-opacity="0.55"/><stop offset="30%" stop-color="#FFC987" stop-opacity="0.22"/>' +
    '<stop offset="62%" stop-color="' + C.peach + '" stop-opacity="0.08"/><stop offset="100%" stop-color="' + C.peach + '" stop-opacity="0.0"/></radialGradient>' +
  '<linearGradient id="rayGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#FFE7B0" stop-opacity="0.9"/><stop offset="100%" stop-color="#FFCB84" stop-opacity="0.0"/></linearGradient>' +
  '<linearGradient id="streakGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFE3B0" stop-opacity="0.16"/><stop offset="100%" stop-color="#FFE3B0" stop-opacity="0.0"/></linearGradient>' +
  '<filter id="cardShadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="44" flood-color="#000000" flood-opacity="0.32"/></filter>' +
  '<filter id="shadowBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>' +
  '<filter id="contactBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter>' +
  // Pin shadow = a plain modest blur. Offset + low opacity are applied on the
  // shadow group itself (see makePinSvg), keeping the pin\'s own edges sharp.
  '<filter id="pinDrop" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>' +
  '<clipPath id="cardClip"><rect x="' + DEVICE.x + '" y="' + DEVICE.y + '" width="' + DEVICE.w + '" height="' + DEVICE.h + '" rx="' + DEVICE.radius + '" ry="' + DEVICE.radius + '"/></clipPath>' +
  buildGrainFilter() +
'</defs>' +
  '<rect x="0" y="0" width="' + W + '" height="' + BAND_BOTTOM + '" fill="url(#bandGrad)"/>' +
  '<rect x="0" y="0" width="' + W + '" height="' + BAND_BOTTOM + '" fill="url(#bandBloom)"/>' +
  '<rect x="0" y="' + BAND_BOTTOM + '" width="' + W + '" height="' + (H - BAND_BOTTOM) + '" fill="' + C.sandDeep + '"/>' +
  buildBandMark() +
  '<rect x="' + DEVICE.x + '" y="' + DEVICE.y + '" width="' + DEVICE.w + '" height="' + DEVICE.h + '" rx="' + DEVICE.radius + '" ry="' + DEVICE.radius + '" fill="url(#cardBase)" filter="url(#cardShadow)"/>' +
  '<g clip-path="url(#cardClip)">' +
    '<rect x="' + DEVICE.x + '" y="' + DEVICE.y + '" width="' + DEVICE.w + '" height="' + DEVICE.h + '" fill="url(#cardGlow)"/>' +
    streaks.join('') +
    '<g filter="url(#shadowBlur)">' + longShadowParts.join('') + '</g>' +
    '<g filter="url(#contactBlur)">' + contactParts.join('') + '</g>' +
    '<g shape-rendering="geometricPrecision">' + buildingParts.join('') + '</g>' + sunGlyph + pin +
    '<rect x="' + DEVICE.x + '" y="' + DEVICE.y + '" width="' + DEVICE.w + '" height="' + DEVICE.h + '" fill="url(#cardVignette)"/>' +
    annoBox +
  '</g>' +
  '<rect x="' + (DEVICE.x + 0.75) + '" y="' + (DEVICE.y + 0.75) + '" width="' + (DEVICE.w - 1.5) + '" height="' + (DEVICE.h - 1.5) + '" rx="' + (DEVICE.radius - 1) + '" ry="' + (DEVICE.radius - 1) + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="1.4"/>' +
  '<path d="M ' + (DEVICE.x + DEVICE.radius) + ' ' + (DEVICE.y + 1.5) + ' H ' + (DEVICE.right - DEVICE.radius) + '" stroke="#FFFFFF" stroke-opacity="0.20" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="0" y="0" width="' + W + '" height="' + H + '" filter="url(#grain)" opacity="0.05"/>' +
'</svg>';
  return svg;
}

function buildGrainFilter() {
  return '<filter id="grain">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/>' +
  '</filter>';
}

// Hero pin: the EXACT shape the live map draws (src/components/ZonnieMap.tsx).
// Geometry mirrors the RN layout precisely:
//   • Head  = circle, diameter D, fill terracotta #B14222 (full-sun band, score>70),
//            crisp WHITE border, borderWidth = 0.0625·D  (2px at the app's 32px size).
//   • Tail  = square, side = 0.344·D (11px at 32px), SAME terracotta fill, NO border,
//            rotated 45°, centred under the head and pulled UP by side/2 so its top
//            half merges into the head — the lower corner becomes the teardrop point.
//   • Draw order: tail FIRST (behind), then head ON TOP. So the white ring only
//            traces the circle's exposed arc; the diamond's exposed lower edges are
//            bare terracotta with NO white outline — exactly like the app.
//   • Shadow: one subtle soft drop shadow under the whole pin. The pin's own edges
//            (circle border + diamond edges) stay SHARP (no blur on the pin itself).
// No gloss, no halo, no pulse ring — those embellishments are removed.
//
// Coordinate math (tip = the diamond's bottom corner sits on tipX,tipY):
//   The unrotated tail's top is pulled up by s/2 into the head bottom; rotating the
//   square 45° about its own centre leaves that centre on the head's bottom edge
//   (layout y = D, i.e. R below the head centre). The diamond's bottom corner then
//   sits s/√2 below that centre. Hence, from the head centre:
//     diamond centre  = headCy + R
//     diamond tip      = headCy + R + s/√2  = tipY
function makePinSvg(tipX, tipY) {
  const D = 170;                     // head diameter — clear hero focal point
  const R = D / 2;                   // head radius = 85
  const bw = 0.0625 * D;             // white border width (= 2px at 32px) = 10.625
  const s = 0.344 * D;               // tail square side (= 11px at 32px) = 58.48
  const half = s / Math.SQRT2;       // half-diagonal of the rotated square (diamond)

  const headCx = tipX;
  const headCy = tipY - R - half;    // so the diamond's bottom corner lands on tipY
  const diamCy = headCy + R;         // diamond centre sits on the head's bottom edge

  // Diamond corners (square rotated 45° → axis-aligned diamond).
  const dTop    = { x: headCx,        y: diamCy - half };
  const dRight  = { x: headCx + half, y: diamCy };
  const dBottom = { x: headCx,        y: diamCy + half }; // == (tipX, tipY)
  const dLeft   = { x: headCx - half, y: diamCy };
  const diamondPts = [dTop, dRight, dBottom, dLeft].map((p) => r2(p.x) + ',' + r2(p.y)).join(' ');

  // Stash the head circle so the "87" can be centred fully inside it.
  makePinSvg.head = { cx: headCx, cy: headCy, r: R };

  // Subtle soft drop shadow beneath the whole pin (blurred + nudged down a touch),
  // drawn behind so it never softens the pin's own crisp edges. Modelled on the
  // map's shadow: small downward offset, low opacity (~0.25), modest blur.
  const shY = 9; // small downward offset
  const shadowGroup =
    '<g filter="url(#pinDrop)" opacity="0.25">' +
      '<polygon points="' + [dTop, dRight, dBottom, dLeft].map((p) => r2(p.x) + ',' + r2(p.y + shY)).join(' ') + '" fill="#000000"/>' +
      '<circle cx="' + r2(headCx) + '" cy="' + r2(headCy + shY) + '" r="' + r2(R) + '" fill="#000000"/>' +
    '</g>';

  // SHARP pin: tail (diamond) first/behind, then head on top.
  // shape-rendering=geometricPrecision keeps the outlines crisp, not antialias-fuzzy.
  const pin =
    '<g shape-rendering="geometricPrecision">' +
      // Tail: terracotta diamond, NO border.
      '<polygon points="' + diamondPts + '" fill="' + C.terracotta + '"/>' +
      // Head: terracotta circle with crisp white border, drawn ON TOP of the tail.
      '<circle cx="' + r2(headCx) + '" cy="' + r2(headCy) + '" r="' + r2(R - bw / 2) + '" ' +
        'fill="' + C.terracotta + '" stroke="' + C.white + '" stroke-width="' + r2(bw) + '"/>' +
    '</g>';

  return '<g>' + shadowGroup + pin + '</g>';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const buildings = loadBuildings();
  const projector = makeProjector(buildings);
  const svg = buildSceneSvg(buildings, projector);
  const base = sharp(Buffer.from(svg)).png();
  const layers = [];

  // Eyebrow / kicker: small uppercase, letter-spaced, burnt.
  const eyebrow = await renderText({
    markup: '<span foreground="' + C.burnt + '" letter_spacing="9000">PRECISION SHADOW MAPPING</span>',
    font: 'Inter SemiBold 13', fontfile: INTER_SEMIBOLD, dpi: 150, width: 1130, align: 'centre',
  });
  const eyebrowTop = 196;
  layers.push({ input: eyebrow.buffer, left: Math.round((W - eyebrow.width) / 2), top: eyebrowTop });

  // Headline (Fraunces bold, ink) on TWO lines, tightened.
  const headline = await renderText({
    markup: '<span foreground="' + C.ink + '">Built on Amsterdam’s\nown data.</span>',
    font: 'Fraunces 52', fontfile: FRAUNCES_BOLD, dpi: 150, width: 1220, align: 'centre', spacing: -6,
  });
  const headlineTop = eyebrowTop + eyebrow.height + 36;
  layers.push({ input: headline.buffer, left: Math.round((W - headline.width) / 2), top: headlineTop });

  // Subhead (Inter regular, muted inkSoft), wraps to 2 lines.
  const subhead = await renderText({
    markup: '<span foreground="' + C.inkSoft + '">LIDAR-scanned buildings. Half-metre accuracy.\nReal shadow physics.</span>',
    font: 'Inter 21', fontfile: INTER_REGULAR, dpi: 150, width: 1080, align: 'centre', spacing: 4,
  });
  const subheadTop = headlineTop + headline.height + 30;
  layers.push({ input: subhead.buffer, left: Math.round((W - subhead.width) / 2), top: subheadTop });

  // Score "87" centred FULLY inside the pin head (Fraunces 700Bold, cream #FFE5C2 —
  // the live app's exact band-text token for strict map parity).
  // Sized at ~0.44·D so it sits comfortably within the circle, never on the seam.
  // We render, then trim() to the actual glyph ink so we centre the real digits
  // (Pango adds leading above/below; trimming removes that so the number lands
  // dead-centre in the circle rather than riding high).
  const pinHead = makePinSvg.head;
  const scoreRaw = await renderText({
    markup: '<span foreground="#FFE5C2">87</span>',
    font: 'Fraunces 40', fontfile: FRAUNCES_BOLD, dpi: 150, align: 'centre',
  });
  const scoreBuf = await sharp(scoreRaw.buffer).trim({ threshold: 10 }).png().toBuffer();
  const scoreMeta = await sharp(scoreBuf).metadata();
  layers.push({
    input: scoreBuf,
    left: Math.round(pinHead.cx - scoreMeta.width / 2),
    top: Math.round(pinHead.cy - scoreMeta.height / 2),
  });

  // Annotation text (Inter medium, letter-spaced) — verified building count swapped in.
  const anno = buildSceneSvg.anno;
  const annoText = await renderText({
    markup: '<span foreground="#E9DCC6" letter_spacing="1400">1,000+ terraces<span foreground="#FFB870">  ·  </span>65,000+ buildings<span foreground="#FFB870">  ·  </span>0.5 m accuracy</span>',
    font: 'Inter Medium 16', fontfile: INTER_MEDIUM, dpi: 150, align: 'centre',
  });
  layers.push({ input: annoText.buffer, left: Math.round(anno.x + (anno.w - annoText.width) / 2), top: Math.round(anno.y + (anno.h - annoText.height) / 2) });

  await base.composite(layers).png().toFile(OUT_PATH);

  const meta = await sharp(OUT_PATH).metadata();
  if (meta.width !== W || meta.height !== H) {
    throw new Error('OUTPUT SIZE WRONG: got ' + meta.width + 'x' + meta.height + ', expected ' + W + 'x' + H);
  }
  console.log('OK - wrote', OUT_PATH);
  console.log('Dimensions verified: ' + meta.width + ' x ' + meta.height);
  console.log('Buildings used: ' + buildings.length);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });

// Small refined brand sun-glyph mark + a thin hairline rule, both centred in
// the marketing band. Anchors the top of the composition; on-brand (Zonnie = sun).
function buildBandMark() {
  const cx = DEVICE.cx, cy = 138;
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rays.push('<line x1="' + r2(Math.cos(a) * 23) + '" y1="' + r2(Math.sin(a) * 23) + '" x2="' + r2(Math.cos(a) * 32) + '" y2="' + r2(Math.sin(a) * 32) + '" stroke="' + C.burnt + '" stroke-width="3" stroke-linecap="round" stroke-opacity="0.85"/>');
  }
  return '<g transform="translate(' + cx + ' ' + cy + ')">' +
    '<circle cx="0" cy="0" r="15" fill="' + C.burnt + '"/>' +
    '<circle cx="-4" cy="-4" r="7" fill="#FFFFFF" fill-opacity="0.22"/>' +
    rays.join('') +
    '</g>' +
    // thin hairline rule low in the band
    '<rect x="' + (cx - 70) + '" y="' + (BAND_BOTTOM - 150) + '" width="140" height="2" rx="1" fill="' + C.burnt + '" fill-opacity="0.22"/>';
}
