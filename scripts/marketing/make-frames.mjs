// =============================================================================
// make-frames.mjs  —  Zonnie App Store screenshots, frames 1-5
// -----------------------------------------------------------------------------
// Sibling set to "frame 6" (see make-frame6.mjs). Shares its warm grained
// gradient, eyebrow / Fraunces headline / Inter subhead typography, and glass
// device language. Each frame shows a real app screenshot as a clean phone
// mockup (NO hardware bezel) on the warm background.
//
// Output: five PNGs, each EXACTLY 1290 x 2796 px (iPhone 6.7"). Verified per file.
//
// TECHNIQUES (sharp v0.34.5 ONLY - no extra packages):
//   1. Warm gradient + grain scene = one SVG string rasterised by sharp.
//   2. Phone mockup (rounded screenshot + shadow + inner edge) = SVG.
//   3. Marketing TEXT rendered with sharp font engine (Pango markup).
//   4. STATUS-BAR NORMALISATION (added): each raw iOS status bar is cleaned in
//      memory before compositing - "9:41" left, full signal/Wi-Fi/battery right,
//      TestFlight label / stray arrow removed. See that section below.
//
// Run:  node scripts/marketing/make-frames.mjs
// =============================================================================

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const FRAUNCES_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const INTER_REGULAR = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const INTER_SEMIBOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const RAW_DIR = path.join(ROOT, 'marketing/screenshots/raw');
const OUT_DIR = path.join(ROOT, 'marketing/screenshots/store');

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

const SHOT_W = 1206;
const SHOT_H = 2622;
const SHOT_RADIUS = 96;

async function renderText({ markup, font, fontfile, dpi, width, align = 'centre', spacing }) {
  const textSpec = { text: markup, font, fontfile, rgba: true, dpi, align };
  if (width) textSpec.width = width;
  if (spacing != null) textSpec.spacing = spacing;
  const buffer = await sharp({ text: textSpec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

const MOCK = { top: BAND_BOTTOM + 28, bottom: H - 70, marginX: 150 };
MOCK.maxW = W - MOCK.marginX * 2;
MOCK.maxH = MOCK.bottom - MOCK.top;
{
  const fit = Math.min(MOCK.maxW / SHOT_W, MOCK.maxH / SHOT_H);
  MOCK.w = Math.round(SHOT_W * fit);
  MOCK.h = Math.round(SHOT_H * fit);
  MOCK.x = Math.round((W - MOCK.w) / 2);
  MOCK.y = Math.round(MOCK.top + (MOCK.maxH - MOCK.h) / 2);
  MOCK.radius = Math.round(SHOT_RADIUS * fit);
}

function buildGrainFilter() {
  return '<filter id="grain">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/>' +
  '</filter>';
}

function buildBandMark() {
  const cx = W / 2, cy = 138;
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
    '<rect x="' + (cx - 70) + '" y="' + (BAND_BOTTOM - 150) + '" width="140" height="2" rx="1" fill="' + C.burnt + '" fill-opacity="0.22"/>';
}

function buildBackgroundSvg() {
  return '' +
'<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
'<defs>' +
  '<linearGradient id="bg" x1="0" y1="0" x2="0.12" y2="1">' +
    '<stop offset="0%" stop-color="' + C.sand + '"/>' +
    '<stop offset="32%" stop-color="' + C.cream + '"/>' +
    '<stop offset="62%" stop-color="#FCD9AE"/>' +
    '<stop offset="100%" stop-color="#FAC98F"/>' +
  '</linearGradient>' +
  '<radialGradient id="bgBloom" cx="78%" cy="14%" r="62%">' +
    '<stop offset="0%" stop-color="#FFF3DF" stop-opacity="0.9"/>' +
    '<stop offset="60%" stop-color="#FFF3DF" stop-opacity="0.0"/>' +
  '</radialGradient>' +
  '<filter id="mockShadow" x="-25%" y="-25%" width="150%" height="160%">' +
    '<feDropShadow dx="0" dy="26" stdDeviation="40" flood-color="#000000" flood-opacity="0.22"/>' +
  '</filter>' +
  buildGrainFilter() +
'</defs>' +
  '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
  '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#bgBloom)"/>' +
  buildBandMark() +
  '<rect x="' + MOCK.x + '" y="' + MOCK.y + '" width="' + MOCK.w + '" height="' + MOCK.h + '" rx="' + MOCK.radius + '" ry="' + MOCK.radius + '" fill="' + C.sand + '" filter="url(#mockShadow)"/>' +
  '<rect x="0" y="0" width="' + W + '" height="' + H + '" filter="url(#grain)" opacity="0.05"/>' +
'</svg>';
}

function buildMockOverlaySvg() {
  const x = MOCK.x, y = MOCK.y, w = MOCK.w, h = MOCK.h, rad = MOCK.radius;
  return '' +
'<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
  '<rect x="' + (x + 0.75) + '" y="' + (y + 0.75) + '" width="' + (w - 1.5) + '" height="' + (h - 1.5) + '" rx="' + (rad - 1) + '" ry="' + (rad - 1) + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="1.4"/>' +
  '<path d="M ' + (x + rad) + ' ' + (y + 1.5) + ' H ' + (x + w - rad) + '" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>' +
'</svg>';
}

function roundedMaskSvg(w, h, radius) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + radius + '" ry="' + radius + '" fill="#ffffff"/>' +
  '</svg>';
}

async function roundScreenshot(srcBuffer) {
  const scaled = await sharp(srcBuffer).resize(MOCK.w, MOCK.h, { fit: 'fill' }).png().toBuffer();
  const mask = Buffer.from(roundedMaskSvg(MOCK.w, MOCK.h, MOCK.radius));
  return sharp(scaled).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// editPaywall - covers the three prices + CTA label, draws "Start now".
// The raw file on disk is never touched (we operate on a buffer).
async function editPaywall(rawPath) {
  const base = sharp(rawPath);

  const label = await renderText({
    markup: '<span foreground="#FBE6C8">Start now</span>',
    font: 'Inter SemiBold 30', fontfile: INTER_SEMIBOLD, dpi: 150, align: 'centre',
  });
  const labelBuf = await sharp(label.buffer).trim({ threshold: 8 }).png().toBuffer();
  const labelMeta = await sharp(labelBuf).metadata();

  const cover =
'<svg xmlns="http://www.w3.org/2000/svg" width="' + SHOT_W + '" height="' + SHOT_H + '">' +
  '<rect x="158" y="1862" width="166" height="62" fill="#f5ece0"/>' +
  '<rect x="520" y="1882" width="164" height="62" fill="#ffe5c2"/>' +
  '<rect x="870" y="1862" width="188" height="62" fill="#f5ece0"/>' +
  '<rect x="200" y="2112" width="806" height="100" fill="#2a1f16"/>' +
'</svg>';

  const buttonCx = 603;
  const buttonCy = 2161;

  return base
    .composite([
      { input: Buffer.from(cover), top: 0, left: 0 },
      { input: labelBuf, left: Math.round(buttonCx - labelMeta.width / 2), top: Math.round(buttonCy - labelMeta.height / 2) },
    ])
    .png()
    .toBuffer();
}

// =============================================================================
// STATUS-BAR NORMALISATION  (added step - runs on each raw IN MEMORY, before the
// screenshot is composited; the raw files on disk are untouched).
// -----------------------------------------------------------------------------
// Every frame gets the SAME clean iOS status bar: time "9:41" on the left, and a
// full cluster on the right (4 ascending signal bars, Wi-Fi arc, 100% battery).
// We also erase the stray "TestFlight" label + location arrow that the TestFlight
// build painted top-left on some frames (frame 5 / Paywall especially).
//
// HOW (per raw, coordinates in the 1206x2622 raw pixel space):
//   1. The status-bar row is consistent across these captures: time at x~133..255,
//      right cluster ending at x~1096, both centred on y~97 with ~36px glyphs.
//      There is NO Dynamic Island in these captures (verified centre-top), so the
//      middle needs no protecting.
//   2. Sample the LOCAL background just around each cluster (median of a nearby
//      strip) and lay a flat patch of that tone over the OLD glyphs: left patch =
//      time + arrow + TestFlight line; right patch = old signal/Wi-Fi/battery (incl
//      the yellow low-power pill). A local-tone patch reads as the app own scrim.
//   3. Foreground colour from that background luminance: light bg -> DARK ink
//      glyphs; dark bg -> LIGHT white glyphs (per-frame contrast choice).
//   4. Redraw "9:41" (Inter SemiBold, scaled to the original time cap height + left
//      edge) and clean vector icons (signal / Wi-Fi / battery) on top.
// =============================================================================

const SB = {
  rowCy: 97,
  glyphH: 36,
  timeLeft: 133,
  timeBaselineY: 116,
  leftPatch:  { left: 24, top: 44, width: 320, height: 108 },
  rightPatch: { left: 846, top: 60, width: 272, height: 78 },
  batteryRight: 1096,
};

async function medianColor(rawBuffer, { left, top, width, height }) {
  const { data, info } = await sharp(rawBuffer).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < data.length; i += ch) { rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); }
  const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  return [med(rs), med(gs), med(bs)];
}

const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// statusBarIconsSvg - RIGHT cluster: 4 ascending cellular bars, a 2-arc Wi-Fi
// mark + dot, and a fully-charged battery (outline + full fill + nub).
function statusBarIconsSvg(color, h) {
  const gap = Math.round(h * 0.42);

  const barW = Math.round(h * 0.18);
  const barGap = Math.round(h * 0.12);
  const barHeights = [0.42, 0.62, 0.82, 1.0].map((f) => Math.round(h * f));
  const signalW = barW * 4 + barGap * 3;
  let sx = 0;
  let bars = '';
  for (let i = 0; i < 4; i++) {
    const bh = barHeights[i];
    bars += '<rect x="' + sx + '" y="' + (h - bh) + '" width="' + barW + '" height="' + bh + '" rx="' + Math.round(barW * 0.35) + '" fill="' + color + '"/>';
    sx += barW + barGap;
  }

  const wifiW = Math.round(h * 0.92);
  const wcx = wifiW / 2;
  const wcy = h * 0.92;
  const sw = Math.max(2, Math.round(h * 0.10));
  const arc = (r) => {
    const x0 = wcx - r * Math.SQRT1_2, y0 = wcy - r * Math.SQRT1_2;
    const x1 = wcx + r * Math.SQRT1_2, y1 = wcy - r * Math.SQRT1_2;
    return '<path d="M ' + r2(x0) + ' ' + r2(y0) + ' A ' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(x1) + ' ' + r2(y1) + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
  };
  const wifi = arc(h * 0.66) + arc(h * 0.42) + '<circle cx="' + r2(wcx) + '" cy="' + r2(wcy) + '" r="' + r2(sw * 0.9) + '" fill="' + color + '"/>';

  const batW = Math.round(h * 1.30);
  const batH = Math.round(h * 0.62);
  const batY = Math.round((h - batH) / 2);
  const stroke = Math.max(2, Math.round(h * 0.06));
  const pad = Math.max(2, Math.round(h * 0.10));
  const fillW = batW - pad * 2 - stroke;
  const nubW = Math.max(2, Math.round(h * 0.07));
  const battery =
    '<rect x="' + (stroke / 2) + '" y="' + (batY + stroke / 2) + '" width="' + (batW - stroke) + '" height="' + (batH - stroke) + '" rx="' + Math.round(batH * 0.32) + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-opacity="0.5"/>' +
    '<rect x="' + (pad + stroke / 2) + '" y="' + (batY + pad) + '" width="' + fillW + '" height="' + (batH - pad * 2) + '" rx="' + Math.round(batH * 0.18) + '" fill="' + color + '"/>' +
    '<rect x="' + (batW + 1) + '" y="' + r2(batY + batH * 0.30) + '" width="' + nubW + '" height="' + r2(batH * 0.40) + '" rx="' + Math.round(h * 0.035) + '" fill="' + color + '" fill-opacity="0.5"/>';

  const total = signalW + gap + wifiW + gap + batW + nubW + 1;
  const wifiX = signalW + gap;
  const batX = wifiX + wifiW + gap;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + total + '" height="' + h + '">' +
      '<g>' + bars + '</g>' +
      '<g transform="translate(' + wifiX + ' 0)">' + wifi + '</g>' +
      '<g transform="translate(' + batX + ' 0)">' + battery + '</g>' +
    '</svg>';
  return { svg, width: total };
}

// featheredPatch - build a soft-edged cover patch: an opaque core of `fillHex`
// over the whole `box` (so it fully hides the old glyphs), surrounded by a
// `feather`-px margin whose alpha fades to 0. The soft edge melts into busy
// map/photo backgrounds so the patch never reads as a hard rectangle. Returns a
// composite layer { input, left, top } positioned in the raw pixel space.
async function featheredPatch(fillHex, box, feather) {
  const W2 = box.width + feather * 2;
  const H2 = box.height + feather * 2;
  // Solid fill the full padded size.
  const fill = await sharp({ create: { width: W2, height: H2, channels: 4,
    background: fillHex } }).png().toBuffer();
  // Alpha mask: a white rect that fills almost the whole padded canvas (the box
  // PLUS most of the feather margin), then a SMALL Gaussian blur. The blur ramp
  // lives only in the outermost few px, so the entire box interior stays fully
  // opaque (alpha 255) and the old glyphs underneath are completely hidden; only
  // the thin outer halo fades, melting the edge into busy backgrounds.
  const inset = Math.round(feather * 0.5);
  const maskSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W2 + '" height="' + H2 + '">' +
      '<rect x="' + inset + '" y="' + inset + '" width="' + (W2 - inset * 2) +
        '" height="' + (H2 - inset * 2) + '" rx="' + Math.round(feather * 0.5) + '" fill="#ffffff"/>' +
    '</svg>';
  const mask = await sharp(Buffer.from(maskSvg)).blur(feather * 0.5).png().toBuffer();
  const patch = await sharp(fill)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return { input: patch, left: box.left - feather, top: box.top - feather };
}

// cleanStatusBar - per-raw normalisation. Returns a new 1206x2622 PNG buffer.
async function cleanStatusBar(rawBuffer, label) {
  // Sample each patch fill from the median of its OWN footprint, so the flat cover
  // box matches the local average tone it replaces (blends on busy map/photo bgs).
  const leftBg = await medianColor(rawBuffer, SB.leftPatch);
  const rightBg = await medianColor(rawBuffer, SB.rightPatch);

  const DARK = C.ink;
  const LIGHT = '#FFFFFF';
  const leftFg = luminance(leftBg) > 150 ? DARK : LIGHT;
  const rightFg = luminance(rightBg) > 150 ? DARK : LIGHT;

  const time = await renderText({
    markup: '<span foreground="' + leftFg + '">9:41</span>',
    font: 'Inter SemiBold 40', fontfile: INTER_SEMIBOLD, dpi: 150, align: 'left',
  });
  const timeTrimmed = await sharp(time.buffer).trim({ threshold: 8 }).png().toBuffer();
  const tMeta = await sharp(timeTrimmed).metadata();
  const timeH = SB.glyphH;
  const timeW = Math.round(tMeta.width * (timeH / tMeta.height));
  const timeBuf = await sharp(timeTrimmed).resize(timeW, timeH, { fit: 'fill' }).png().toBuffer();
  const timeTop = Math.round(SB.timeBaselineY - timeH);

  const icons = statusBarIconsSvg(rightFg, SB.glyphH);
  const iconsTop = Math.round(SB.rowCy - SB.glyphH / 2);
  const iconsLeft = Math.round(SB.batteryRight - icons.width);

  // Soft-edged cover patches in the locally-sampled tones (left + right clusters).
  const FEATHER = 20;
  const leftCover = await featheredPatch(toHex(leftBg), SB.leftPatch, FEATHER);
  const rightCover = await featheredPatch(toHex(rightBg), SB.rightPatch, FEATHER);

  console.log('  status-bar [' + label + ']  leftBg ' + toHex(leftBg) + ' -> ' + (leftFg === DARK ? 'dark' : 'light') + '   rightBg ' + toHex(rightBg) + ' -> ' + (rightFg === DARK ? 'dark' : 'light'));

  return sharp(rawBuffer)
    .composite([
      leftCover,
      rightCover,
      { input: timeBuf, left: SB.timeLeft, top: timeTop },
      { input: Buffer.from(icons.svg), left: iconsLeft, top: iconsTop },
    ])
    .png()
    .toBuffer();
}

async function buildMarketingText({ eyebrow, headline, subhead, headlineSize = 52 }) {
  const layers = [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  eyebrow = esc(eyebrow); headline = esc(headline); subhead = esc(subhead);

  const eb = await renderText({
    markup: '<span foreground="' + C.burnt + '" letter_spacing="9000">' + eyebrow + '</span>',
    font: 'Inter SemiBold 13', fontfile: INTER_SEMIBOLD, dpi: 150, width: 1130, align: 'centre',
  });
  const eyebrowTop = 196;
  layers.push({ input: eb.buffer, left: Math.round((W - eb.width) / 2), top: eyebrowTop });

  const hl = await renderText({
    markup: '<span foreground="' + C.ink + '">' + headline + '</span>',
    font: 'Fraunces ' + headlineSize, fontfile: FRAUNCES_BOLD, dpi: 150, width: 1220, align: 'centre', spacing: -6,
  });
  const headlineTop = eyebrowTop + eb.height + 36;
  layers.push({ input: hl.buffer, left: Math.round((W - hl.width) / 2), top: headlineTop });

  const sh = await renderText({
    markup: '<span foreground="' + C.inkSoft + '">' + subhead + '</span>',
    font: 'Inter 21', fontfile: INTER_REGULAR, dpi: 150, width: 1080, align: 'centre', spacing: 4,
  });
  const subheadTop = headlineTop + hl.height + 30;
  layers.push({ input: sh.buffer, left: Math.round((W - sh.width) / 2), top: subheadTop });

  return layers;
}

async function renderFrame({ outName, screenshotBuffer, eyebrow, headline, subhead, headlineSize }) {
  const background = sharp(Buffer.from(buildBackgroundSvg())).png();
  const roundedShot = await roundScreenshot(screenshotBuffer);
  const overlay = Buffer.from(buildMockOverlaySvg());
  const textLayers = await buildMarketingText({ eyebrow, headline, subhead, headlineSize });

  const outPath = path.join(OUT_DIR, outName);
  await background
    .composite([
      { input: roundedShot, left: MOCK.x, top: MOCK.y },
      { input: overlay, left: 0, top: 0 },
      ...textLayers,
    ])
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  if (meta.width !== W || meta.height !== H) {
    throw new Error('OUTPUT SIZE WRONG for ' + outName + ': got ' + meta.width + 'x' + meta.height + ', expected ' + W + 'x' + H);
  }
  console.log('OK  ' + outName + '  (' + meta.width + ' x ' + meta.height + ')  "' + eyebrow + '"  /  ' + headline.replace(/\n/g, ' '));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Helper: load a raw screenshot, THEN normalise its status bar in memory.
  const raw = async (name) => cleanStatusBar(await sharp(path.join(RAW_DIR, name)).png().toBuffer(), name);

  // v1.3.0 set — new home (Today's Verdict + top picks), live map, terrace
  // detail with Chase the Sun, and the Perfect For shortcuts. No paywall frame
  // (Pro is fully unlocked). Source PNGs must be 1206x2622 in RAW_DIR.
  await renderFrame({
    outName: '01-home.png',
    screenshotBuffer: await raw('Home.png'),
    eyebrow: "TODAY'S VERDICT",
    headline: 'Is it a\nterrace day?',
    subhead: "A daily read on the sun — plus\ntoday's sunniest picks.",
  });

  await renderFrame({
    outName: '02-map.png',
    screenshotBuffer: await raw('Map.png'),
    eyebrow: 'THE LIVE MAP',
    headline: 'Every terrace.\nOn one map.',
    subhead: 'Live sun scores across Amsterdam,\nupdated by the minute.',
  });

  await renderFrame({
    outName: '03-detail.png',
    screenshotBuffer: await raw('Detail.png'),
    eyebrow: 'CHASE THE SUN',
    headline: 'Follow the sun,\nspot to spot.',
    subhead: 'Sun by the hour, the best time to go,\nand a crawl that chases the light.',
    headlineSize: 48,
  });

  await renderFrame({
    outName: '04-sunniest.png',
    screenshotBuffer: await raw('Perfect for.png'),
    eyebrow: 'SUNNIEST RIGHT NOW',
    headline: 'The sunniest spots,\nby neighbourhood.',
    subhead: 'Top picks across Jordaan, Zuid, Oost\nand every corner of Amsterdam.',
  });

  console.log('\nAll frames written to ' + OUT_DIR);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
