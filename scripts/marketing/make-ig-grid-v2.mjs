// =============================================================================
// make-ig-grid-v2.mjs — Zonnie Instagram grid refresh (9 tiles) + og social card
// -----------------------------------------------------------------------------
// Brings the feed in line with the redesigned website: Fraunces/Inter type,
// warm grained gradient, the terrace-scene illustration, real map screenshots
// and real dataset numbers — replacing the old flat-sun / basic-skyline tiles.
//
// Output:
//   marketing/instagram/v2/01..09-*.png   (1080x1350, post in REVERSE order)
//   marketing/instagram/v2/_contact-sheet.png  (3x3 preview of the grid)
//   docs/assets/social-card.jpg           (1200x630 og:image for zonnie.app)
//
// Run:  node scripts/marketing/make-ig-grid-v2.mjs
// =============================================================================

import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'marketing/instagram/v2');
mkdirSync(OUT, { recursive: true });

const F_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const F_ITAL = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/500Medium_Italic/Fraunces_500Medium_Italic.ttf');
const I_REG = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const I_SEMI = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const HERO = path.join(ROOT, 'docs/assets/terrace-hero.webp');   // 2800x860
const ICON = path.join(ROOT, 'docs/assets/app-icon.png');
const SHOT_MAP = path.join(ROOT, 'marketing/screenshots/raw/Map.png'); // 1206x2622

const C = {
  cream: '#FFE5C2', mustard: '#F4D58D', peach: '#FBA85A', orange: '#E89C5A',
  burnt: '#D9633E', terracotta: '#B14222', cocoa: '#7A2E14', ink: '#2A1F15',
  inkSoft: '#5A4A38', sand: '#FFF8F0', sandDeep: '#F4ECE0', mist: '#E8DCC8',
  white: '#FFFFFF', shadeGrey: '#8B8378',
};

const W = 1080, H = 1350;

async function text({ markup, font, fontfile, dpi = 150, width, align = 'centre', spacing }) {
  const spec = { text: markup, font, fontfile, rgba: true, dpi, align };
  if (width) spec.width = width;
  if (spacing != null) spec.spacing = spacing;
  const buffer = await sharp({ text: spec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

const GRAIN = '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>' +
  '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/></filter>';

function bgSvg(w = W, h = H, warm = false) {
  const stops = warm
    ? `<stop offset="0" stop-color="${C.cream}"/><stop offset="0.55" stop-color="#FCD9A8"/><stop offset="1" stop-color="${C.peach}"/>`
    : `<stop offset="0" stop-color="${C.sand}"/><stop offset="0.6" stop-color="${C.cream}"/><stop offset="1" stop-color="#FBCF9C"/>`;
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${GRAIN}` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>` +
    `<rect width="${w}" height="${h}" filter="url(#g)" opacity="0.05"/></svg>`);
}

async function rounded(buf, w, h, r) {
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
  return sharp(buf).resize(w, h).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// Score pin, app-map style: ring + disc + pointer + score numeral.
function pinSvg(score, size, fill, ring = C.white) {
  const r = size / 2, tip = size * 0.32;
  return `<g><path d="M ${r} ${size + tip} L ${r - size * 0.16} ${size * 0.92} A ${r} ${r} 0 1 1 ${r + size * 0.16} ${size * 0.92} Z" fill="${ring}"/>` +
    `<circle cx="${r}" cy="${r}" r="${r * 0.82}" fill="${fill}"/>` +
    `<text x="${r}" y="${r + size * 0.115}" font-family="sans-serif" font-weight="bold" font-size="${size * 0.34}" fill="${C.white}" text-anchor="middle">${score}</text></g>`;
}

function eyebrowLayer(eb, top, layers) {
  return text({ markup: `<span foreground="${C.terracotta}" letter_spacing="9500">${eb}</span>`, font: 'Inter SemiBold 15', fontfile: I_SEMI, width: 980 })
    .then((t) => layers.push({ input: t.buffer, left: Math.round((W - t.width) / 2), top }));
}

async function stack(layers, { eyebrow, headline, hlSize = 52, hlWidth = 900, sub, subWidth = 760, top = 150, italic = false }) {
  let y = top;
  if (eyebrow) {
    const t = await text({ markup: `<span foreground="${C.terracotta}" letter_spacing="9500">${eyebrow}</span>`, font: 'Inter SemiBold 15', fontfile: I_SEMI });
    layers.push({ input: t.buffer, left: Math.round((W - t.width) / 2), top: y });
    y += t.height + 34;
  }
  if (headline) {
    const t = await text({
      markup: `<span foreground="${C.ink}">${headline}</span>`,
      font: italic ? `Fraunces Italic ${hlSize}` : `Fraunces ${hlSize}`,
      fontfile: italic ? F_ITAL : F_BOLD, width: hlWidth, spacing: -4,
    });
    layers.push({ input: t.buffer, left: Math.round((W - t.width) / 2), top: y });
    y += t.height + 30;
  }
  if (sub) {
    const t = await text({ markup: `<span foreground="${C.inkSoft}">${sub}</span>`, font: 'Inter 21', fontfile: I_REG, width: subWidth, spacing: 6 });
    layers.push({ input: t.buffer, left: Math.round((W - t.width) / 2), top: y });
    y += t.height;
  }
  return y;
}

async function footer(layers, dark = false) {
  const t = await text({
    markup: `<span foreground="${dark ? C.cocoa : C.inkSoft}">zonnie.app  ·  free on iOS</span>`,
    font: 'Inter SemiBold 16', fontfile: I_SEMI,
  });
  layers.push({ input: t.buffer, left: Math.round((W - t.width) / 2), top: H - 92 });
}

async function save(name, layers, warm = false) {
  await sharp(bgSvg(W, H, warm)).composite(layers).png().toFile(path.join(OUT, name));
  console.log('  ✓', name);
}

// ---------------------------------------------------------------- tile builds
async function tile01_hero() {
  const layers = [];
  const icon = await rounded(readFileSync(ICON), 108, 108, 26);
  layers.push({ input: icon, left: Math.round((W - 108) / 2), top: 130 });
  await stack(layers, {
    headline: 'Find your place\nin the sun.', hlSize: 60, top: 300,
    sub: '1,029 Amsterdam terraces, scored for sun — live, every hour.',
  });
  const hw = 960, hh = Math.round(hw * 860 / 2800);
  const hero = await rounded(await sharp(HERO).resize(hw).png().toBuffer(), hw, hh, 26);
  layers.push({ input: hero, left: Math.round((W - hw) / 2), top: H - hh - 150 });
  await footer(layers);
  await save('01-hero.png', layers);
}

async function tile02_map() {
  const layers = [];
  await stack(layers, {
    eyebrow: 'THE LIVE MAP', headline: 'One glance.\nEvery sunny terrace.', hlSize: 44, hlWidth: 1000, top: 120,
  });
  const mw = 560, mh = Math.round(mw * 2622 / 1206);   // tall — crop bottom
  const crop = 770;
  const shotFull = await sharp(SHOT_MAP).resize(mw, mh).png().toBuffer();
  const shotCropped = await sharp(shotFull).extract({ left: 0, top: 0, width: mw, height: crop }).png().toBuffer();
  const shot = await rounded(shotCropped, mw, crop, 44);
  const shadow = Buffer.from(`<svg width="${mw + 120}" height="${crop + 120}"><rect x="60" y="70" width="${mw}" height="${crop}" rx="44" fill="#7A2E14" opacity="0.28"/></svg>`);
  layers.push({ input: await sharp(shadow).blur(26).png().toBuffer(), left: Math.round((W - mw) / 2) - 60, top: H - crop - 130 - 55 });
  layers.push({ input: shot, left: Math.round((W - mw) / 2), top: H - crop - 130 });
  await save('02-map.png', layers);
}

async function tile03_lidar() {
  const layers = [];
  const y = await stack(layers, {
    eyebrow: 'HOW IT WORKS', headline: 'We built Amsterdam\nin 3D.', hlSize: 50, top: 130,
    sub: 'LIDAR rooftops cast real shadows — so scores know the moment your table goes dark.', subWidth: 820,
  });
  // Flat diagram: sun top-left, canal gables right, shadow polygon, lit table.
  const gw = 900, gh = 500;
  const g = `<svg width="${gw}" height="${gh}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="120" cy="105" r="64" fill="${C.peach}"/>
    <circle cx="120" cy="105" r="46" fill="${C.mustard}"/>
    <!-- gables: step + bell + neck -->
    <g fill="${C.terracotta}">
      <path d="M560 430 V210 h24 v-26 h24 v-26 h24 v26 h24 v26 h24 v220 Z"/>
      <path d="M710 430 V240 q0 -52 40 -52 q40 0 40 52 v190 Z" fill="${C.burnt}"/>
      <path d="M810 430 V250 l30 -60 h20 l30 60 v180 Z" fill="${C.cocoa}"/>
    </g>
    <g fill="${C.sand}" opacity="0.85">
      <rect x="585" y="250" width="26" height="38" rx="4"/><rect x="625" y="250" width="26" height="38" rx="4"/>
      <rect x="736" y="260" width="26" height="38" rx="4"/><rect x="828" y="280" width="24" height="34" rx="4"/>
    </g>
    <!-- cast shadow from the row, angled away from sun -->
    <path d="M560 430 L330 470 L620 470 L900 430 Z" fill="${C.cocoa}" opacity="0.22"/>
    <rect x="0" y="428" width="${gw}" height="4" rx="2" fill="${C.cocoa}" opacity="0.25"/>
    <!-- sunlit table just outside the shadow -->
    <g>
      <line x1="150" y1="360" x2="150" y2="428" stroke="${C.cocoa}" stroke-width="7"/>
      <ellipse cx="150" cy="356" rx="64" ry="12" fill="${C.burnt}"/>
      <path d="M86 356 Q150 320 214 356" fill="${C.burnt}"/>
      <circle cx="105" cy="400" r="16" fill="${C.cocoa}"/><circle cx="195" cy="400" r="16" fill="${C.cocoa}"/>
    </g>
  </svg>`;
  layers.push({ input: Buffer.from(g), left: Math.round((W - gw) / 2), top: Math.min(y + 24, H - gh - 200) });
  await footer(layers);
  await save('03-lidar.png', layers);
}

async function tile04_score() {
  const layers = [];
  await stack(layers, {
    eyebrow: 'SUN SCORES', headline: 'Every terrace.\n0–100, every hour.', hlSize: 52, top: 130,
  });
  const gw = 760, gh = 560;
  const g = `<svg width="${gw}" height="${gh}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(70,240) scale(0.9)">${pinSvg(31, 200, C.shadeGrey)}</g>
    <g transform="translate(330,60)">${pinSvg(92, 300, C.burnt)}</g>
    <text x="215" y="530" font-family="sans-serif" font-size="26" fill="${C.inkSoft}" text-anchor="middle">in the shade</text>
    <text x="490" y="530" font-family="sans-serif" font-size="26" fill="${C.cocoa}" text-anchor="middle" font-weight="bold">full sun</text>
  </svg>`;
  layers.push({ input: Buffer.from(g), left: Math.round((W - gw) / 2), top: 490 });
  const s = await text({ markup: `<span foreground="${C.inkSoft}">Sun, shade — and exactly when it flips.</span>`, font: 'Inter 21', fontfile: I_REG, width: 700 });
  layers.push({ input: s.buffer, left: Math.round((W - s.width) / 2), top: H - 200 });
  await footer(layers);
  await save('04-score.png', layers);
}

async function tile05_know() {
  const layers = [];
  const sun = `<svg width="150" height="150"><circle cx="75" cy="75" r="40" fill="${C.peach}"/><g stroke="${C.peach}" stroke-width="9" stroke-linecap="round">` +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r1 = 54, r2 = 70, x = Math.cos(a * Math.PI / 180), y = Math.sin(a * Math.PI / 180); return `<line x1="${75 + r1 * x}" y1="${75 + r1 * y}" x2="${75 + r2 * x}" y2="${75 + r2 * y}"/>`; }).join('') + '</g></svg>';
  layers.push({ input: Buffer.from(sun), left: Math.round((W - 150) / 2), top: 320 });
  await stack(layers, { headline: 'Know before\nyou go.', hlSize: 76, top: 520, italic: true });
  const s = await text({ markup: `<span foreground="${C.inkSoft}">Pick your hour. See who's still in the sun.</span>`, font: 'Inter 22', fontfile: I_REG });
  layers.push({ input: s.buffer, left: Math.round((W - s.width) / 2), top: 890 });
  await footer(layers);
  await save('05-know.png', layers, true);
}

async function tile06_depijp() {
  const lite = JSON.parse(readFileSync(path.join(ROOT, 'docs/terraces-lite.json'), 'utf-8'));
  const top3 = lite.filter((t) => t.area === 'De Pijp')
    .map((t) => ({ name: t.name, peak: Math.max(...t.h) }))
    .sort((a, b) => b.peak - a.peak).slice(0, 3);
  const layers = [];
  await stack(layers, {
    eyebrow: 'NEIGHBOURHOOD SPOTLIGHT', headline: "De Pijp's sunniest.", hlSize: 54, top: 150,
    sub: 'Clear-sky afternoon peak, from the live dataset.',
  });
  let ry = 560;
  for (let i = 0; i < top3.length; i++) {
    const t = top3[i];
    const name = t.name.length > 24 ? t.name.slice(0, 23) + '…' : t.name;
    const row = `<svg width="880" height="128" xmlns="http://www.w3.org/2000/svg">
      <rect width="880" height="112" rx="28" fill="${C.white}" opacity="0.72"/>
      <text x="52" y="72" font-family="serif" font-weight="bold" font-size="44" fill="${C.terracotta}">${i + 1}</text>
      <text x="110" y="70" font-family="sans-serif" font-weight="600" font-size="33" fill="${C.ink}">${name}</text>
      <circle cx="796" cy="56" r="38" fill="${C.burnt}"/>
      <text x="796" y="68" font-family="sans-serif" font-weight="bold" font-size="30" fill="${C.white}" text-anchor="middle">${t.peak}</text>
    </svg>`;
    layers.push({ input: Buffer.from(row), left: 100, top: ry });
    ry += 150;
  }
  const s = await text({ markup: `<span foreground="${C.inkSoft}">Your buurt next — tell us where to point the sun.</span>`, font: 'Inter 20', fontfile: I_REG });
  layers.push({ input: s.buffer, left: Math.round((W - s.width) / 2), top: ry + 40 });
  await footer(layers);
  await save('06-depijp.png', layers);
}

async function tile07_chase() {
  const layers = [];
  await stack(layers, {
    eyebrow: 'CHASE THE SUN', headline: 'When your table\ngoes dark, we know\nwhere the light went.', hlSize: 46, top: 130,
  });
  const gw = 960, gh = 520;
  const g = `<svg width="${gw}" height="${gh}" xmlns="http://www.w3.org/2000/svg">
    <path d="M180 400 C 330 160, 590 140, 730 320" fill="none" stroke="${C.burnt}" stroke-width="8" stroke-dasharray="4 26" stroke-linecap="round"/>
    <g transform="translate(90,300)">${pinSvg(24, 170, C.shadeGrey)}</g>
    <g transform="translate(620,180)">${pinSvg(88, 230, C.burnt)}</g>
    <text x="175" y="510" font-family="sans-serif" font-size="25" fill="${C.inkSoft}" text-anchor="middle">17:40 — shade arrives</text>
    <text x="700" y="480" font-family="sans-serif" font-size="25" font-weight="bold" fill="${C.cocoa}" text-anchor="middle">3 min walk — sun till 21:00</text>
  </svg>`;
  layers.push({ input: Buffer.from(g), left: Math.round((W - gw) / 2), top: 560 });
  await footer(layers);
  await save('07-chase.png', layers);
}

async function tile08_web() {
  const layers = [];
  await stack(layers, {
    eyebrow: 'NO IPHONE? NO PROBLEM', headline: 'Try it in\nyour browser.', hlSize: 56, top: 140,
    sub: 'The live demo runs at zonnie.app — map, scores and all. No download.',
  });
  // Browser-chrome card with a mini sun-map inside.
  const bw = 820, bh = 560;
  const g = `<svg width="${bw}" height="${bh}" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="${bw - 12}" height="${bh - 12}" rx="30" fill="${C.white}" opacity="0.9"/>
    <rect x="6" y="6" width="${bw - 12}" height="74" rx="30" fill="${C.sandDeep}"/>
    <rect x="6" y="44" width="${bw - 12}" height="36" fill="${C.sandDeep}"/>
    <circle cx="52" cy="43" r="9" fill="${C.burnt}"/><circle cx="82" cy="43" r="9" fill="${C.peach}"/><circle cx="112" cy="43" r="9" fill="${C.mustard}"/>
    <rect x="150" y="24" width="380" height="40" rx="20" fill="${C.white}"/>
    <text x="176" y="51" font-family="sans-serif" font-size="24" fill="${C.cocoa}" font-weight="600">zonnie.app</text>
    <!-- abstract canal map -->
    <g stroke="${C.mist}" stroke-width="10" fill="none" opacity="0.9">
      <path d="M60 200 Q 410 130 760 210"/><path d="M60 300 Q 410 230 760 310"/><path d="M60 400 Q 410 330 760 410"/>
      <path d="M300 110 L 250 520" /><path d="M520 110 L 560 520"/>
    </g>
    <g transform="translate(180,220)">${pinSvg(84, 110, C.burnt)}</g>
    <g transform="translate(430,160)">${pinSvg(91, 130, C.terracotta)}</g>
    <g transform="translate(620,300)">${pinSvg(45, 100, C.shadeGrey)}</g>
    <g transform="translate(320,360)">${pinSvg(77, 110, C.orange)}</g>
  </svg>`;
  layers.push({ input: Buffer.from(g), left: Math.round((W - bw) / 2), top: 620 });
  await footer(layers);
  await save('08-web.png', layers);
}

async function tile09_brand() {
  const layers = [];
  const icon = await rounded(readFileSync(ICON), 300, 300, 68);
  const shadow = Buffer.from(`<svg width="420" height="420"><rect x="60" y="80" width="300" height="300" rx="68" fill="#7A2E14" opacity="0.3"/></svg>`);
  layers.push({ input: await sharp(shadow).blur(24).png().toBuffer(), left: Math.round((W - 300) / 2) - 60, top: 200 });
  layers.push({ input: icon, left: Math.round((W - 300) / 2), top: 250 });
  await stack(layers, { headline: 'Zonnie', hlSize: 72, top: 640 });
  const s = await text({ markup: `<span foreground="${C.inkSoft}">Amsterdam terraces, scored for sun.\nBuilt with the city's 3D LIDAR data.</span>`, font: 'Inter 21', fontfile: I_REG, width: 920, spacing: 8 });
  layers.push({ input: s.buffer, left: Math.round((W - s.width) / 2), top: 810 });
  const cta = await text({ markup: `<span foreground="${C.white}">  Free on iOS  →  </span>`, font: 'Inter SemiBold 24', fontfile: I_SEMI });
  const pillW = cta.width + 90, pillH = 84;
  const pill = Buffer.from(`<svg width="${pillW}" height="${pillH}"><rect width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${C.ink}"/></svg>`);
  layers.push({ input: pill, left: Math.round((W - pillW) / 2), top: 1010 });
  layers.push({ input: cta.buffer, left: Math.round((W - cta.width) / 2), top: 1010 + Math.round((pillH - cta.height) / 2) });
  await footer(layers);
  await save('09-brand.png', layers, true);
}

// ------------------------------------------------------------- og social card
async function socialCard() {
  const cw = 1200, ch = 630;
  const layers = [];
  const icon = await rounded(readFileSync(ICON), 84, 84, 20);
  layers.push({ input: icon, left: 70, top: 56 });
  const brand = await text({ markup: `<span foreground="${C.ink}">Zonnie</span>`, font: 'Fraunces 30', fontfile: F_BOLD });
  layers.push({ input: brand.buffer, left: 174, top: 72 });
  // Headline: render unwrapped, then scale down to fit one line if needed.
  const hl = await text({ markup: `<span foreground="${C.ink}">Find your place in the sun.</span>`, font: 'Fraunces 44', fontfile: F_BOLD, align: 'left', spacing: -4 });
  let hlBuf = hl.buffer, hlW = hl.width;
  if (hlW > 1060) {
    hlBuf = await sharp(hl.buffer).resize({ width: 1060 }).png().toBuffer();
    hlW = 1060;
  }
  layers.push({ input: hlBuf, left: 70, top: 178 });
  const sub = await text({ markup: `<span foreground="${C.inkSoft}">1,029 Amsterdam terraces, scored for sun — live.</span>`, font: 'Inter 22', fontfile: I_REG, align: 'left' });
  layers.push({ input: sub.buffer, left: 70, top: 300 });
  // Bottom strip: lower two-thirds of the terrace scene (ground, people, houses).
  const strip = await sharp(HERO).extract({ left: 0, top: 230, width: 2800, height: 630 }).resize(1200, 270).png().toBuffer();
  layers.push({ input: strip, left: 0, top: ch - 270 });
  await sharp(bgSvg(cw, ch)).composite(layers).jpeg({ quality: 88 }).toFile(path.join(ROOT, 'docs/assets/social-card.jpg'));
  console.log('  ✓ docs/assets/social-card.jpg');
}

// -------------------------------------------------------------- contact sheet
async function contactSheet() {
  const names = ['01-hero', '02-map', '03-lidar', '04-score', '05-know', '06-depijp', '07-chase', '08-web', '09-brand'];
  const tw = 340, th = Math.round(tw * H / W), gap = 8;
  const layers = [];
  for (let i = 0; i < names.length; i++) {
    const buf = await sharp(path.join(OUT, names[i] + '.png')).resize(tw, th).png().toBuffer();
    layers.push({ input: buf, left: (i % 3) * (tw + gap), top: Math.floor(i / 3) * (th + gap) });
  }
  const sw = tw * 3 + gap * 2, sh = th * 3 + gap * 2;
  await sharp({ create: { width: sw, height: sh, channels: 3, background: '#ffffff' } })
    .composite(layers).png().toFile(path.join(OUT, '_contact-sheet.png'));
  console.log('  ✓ _contact-sheet.png');
}

console.log('Rendering IG grid v2…');
await tile01_hero();
await tile02_map();
await tile03_lidar();
await tile04_score();
await tile05_know();
await tile06_depijp();
await tile07_chase();
await tile08_web();
await tile09_brand();
await socialCard();
await contactSheet();
console.log('Done →', OUT);
