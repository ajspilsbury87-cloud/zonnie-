// make-parade-map-tile.mjs — "Follow the rainbow" Canal Parade feature tile
// (1080x1350). The map card draws the REAL parade route from
// src/data/prideRouteGeo.json in the six flag colours — the post shows the
// actual feature, same honesty rule as the in-app rainbow.
// Run: node scripts/marketing/make-parade-map-tile.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'marketing/instagram/v2/12-parademap.png');
const GEO = JSON.parse(readFileSync(path.join(ROOT, 'src/data/prideRouteGeo.json'), 'utf8'));
const VENUES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/prideVenues.json'), 'utf8'));

const F_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const I_REG = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const I_SEMI = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const C = {
  cream: '#FFE5C2', peach: '#FBA85A', burnt: '#D9633E', terracotta: '#B14222',
  cocoa: '#7A2E14', ink: '#2A1F15', inkSoft: '#5A4A38', sand: '#FFF8F0',
  mist: '#E8DCC8', white: '#FFFFFF',
};
const FLAG = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];
const W = 1080, H = 1350;

async function text({ markup, font, fontfile, width, align = 'centre', spacing }) {
  const spec = { text: markup, font, fontfile, rgba: true, dpi: 150, align };
  if (width) spec.width = width;
  if (spacing != null) spec.spacing = spacing;
  const buffer = await sharp({ text: spec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.sand}"/><stop offset="0.6" stop-color="${C.cream}"/><stop offset="1" stop-color="#FBCF9C"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`);

// ── Map card: project the real route into the card, draw rainbow stripes ──────
const M_LAT = 110540, M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
const route = GEO.route.map(([lat, lng]) => ({ x: lng * M_LNG, y: lat * M_LAT }));
const xs = route.map((p) => p.x), ys = route.map((p) => p.y);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);

const CARD_X = 110, CARD_Y = 600, CARD_W = 860, CARD_H = 580, PAD = 70;
const scale = Math.min((CARD_W - 2 * PAD) / (maxX - minX), (CARD_H - 2 * PAD) / (maxY - minY));
const ox = CARD_X + (CARD_W - (maxX - minX) * scale) / 2;
const oy = CARD_Y + (CARD_H - (maxY - minY) * scale) / 2;
const px = (p) => ({ x: ox + (p.x - minX) * scale, y: oy + (maxY - p.y) * scale }); // north up

// Split into equal-length stripes cycling the six flag colours.
const cum = [0];
for (let i = 1; i < route.length; i++) {
  cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y));
}
const total = cum[cum.length - 1];
const STRIPES = 42;
const pointAt = (m) => {
  for (let i = 1; i < cum.length; i++) {
    if (m <= cum[i]) {
      const t = (m - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return {
        x: route[i - 1].x + (route[i].x - route[i - 1].x) * t,
        y: route[i - 1].y + (route[i].y - route[i - 1].y) * t,
      };
    }
  }
  return route[route.length - 1];
};
let stripesSvg = '';
for (let s = 0; s < STRIPES; s++) {
  const from = (s / STRIPES) * total, to = ((s + 1) / STRIPES) * total;
  const pts = [pointAt(from)];
  for (let v = 0; v < route.length; v++) if (cum[v] > from && cum[v] < to) pts.push(route[v]);
  pts.push(pointAt(to));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p).x.toFixed(1)},${px(p).y.toFixed(1)}`).join('');
  stripesSvg += `<path d="${d}" stroke="${FLAG[s % 6]}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
// White casing under the stripes ties the segments into one continuous line.
const casingD = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p).x.toFixed(1)},${px(p).y.toFixed(1)}`).join('');
stripesSvg = `<path d="${casingD}" stroke="${C.white}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
<path d="${casingD}" stroke="${C.mist}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + stripesSvg;

// Toilets (every other official pin, so the card stays readable).
let toiletsSvg = '';
VENUES.toilets.filter((_, i) => i % 2 === 0).forEach(([lat, lng]) => {
  const p = px({ x: lng * M_LNG, y: lat * M_LAT });
  if (p.x < CARD_X + 20 || p.x > CARD_X + CARD_W - 20 || p.y < CARD_Y + 20 || p.y > CARD_Y + CARD_H - 20) return;
  toiletsSvg += `<g><circle cx="${p.x}" cy="${p.y}" r="11" fill="${C.white}" stroke="#24408E" stroke-width="2"/>
  <text x="${p.x}" y="${p.y + 3.5}" font-family="sans-serif" font-weight="700" font-size="9" fill="#24408E" text-anchor="middle">WC</text></g>`;
});

// Three sun-score pins along the route (20% / 55% / 85%), app-pin style.
let pinsSvg = '';
[[0.2, 92], [0.55, 88], [0.85, 84]].forEach(([f, score]) => {
  const p = px(pointAt(f * total));
  pinsSvg += `<g><circle cx="${p.x}" cy="${p.y - 34}" r="26" fill="${C.burnt}" stroke="${C.white}" stroke-width="4"/>
  <text x="${p.x}" y="${p.y - 26}" font-family="serif" font-weight="bold" font-size="24" fill="${C.white}" text-anchor="middle">${score}</text></g>`;
});

const card = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="30" fill="${C.white}"/>
<rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="30" fill="none" stroke="${C.mist}" stroke-width="2"/>
${stripesSvg}
${toiletsSvg}
${pinsSvg}
<text x="${CARD_X + CARD_W / 2}" y="${CARD_Y + CARD_H - 26}" font-family="sans-serif" font-weight="600" font-size="19" letter-spacing="1.5" fill="${C.inkSoft}" text-anchor="middle">THE REAL ROUTE · BOAT TIMES · TOILETS · EVENTS</text>
</svg>`;

const layers = [];
const eb = await text({ markup: `<span foreground="${C.terracotta}" letter_spacing="9500">CANAL PARADE · TODAY · 12:00–18:00</span>`, font: 'Inter SemiBold 15', fontfile: I_SEMI });
layers.push({ input: eb.buffer, left: Math.round((W - eb.width) / 2), top: 160 });
const hl = await text({ markup: `<span foreground="${C.ink}">Follow the\nrainbow.</span>`, font: 'Fraunces 46', fontfile: F_BOLD, spacing: -4 });
layers.push({ input: hl.buffer, left: Math.round((W - hl.width) / 2), top: 220 });
const subTop = 220 + hl.height + 30;
const sub = await text({ markup: `<span foreground="${C.inkSoft}">Boat times per terrace, official toilets &amp; every event — live in the app.</span>`, font: 'Inter 21', fontfile: I_REG, width: 820, spacing: 6 });
layers.push({ input: sub.buffer, left: Math.round((W - sub.width) / 2), top: subTop });
layers.push({ input: Buffer.from(card), left: 0, top: 0 });
const ft = await text({ markup: `<span foreground="${C.inkSoft}">zonnie.app  ·  free on iOS</span>`, font: 'Inter SemiBold 16', fontfile: I_SEMI });
layers.push({ input: ft.buffer, left: Math.round((W - ft.width) / 2), top: H - 92 });

await sharp(bg).composite(layers).png().toFile(OUT);
console.log('wrote', OUT);
