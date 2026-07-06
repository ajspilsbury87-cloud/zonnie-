// make-pride-tile.mjs — WorldPride 2026 announcement tile (IG, 1080x1350).
// Same brand family as make-ig-grid-v2.mjs; run standalone:
//   node scripts/marketing/make-pride-tile.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'marketing/instagram/v2/10-worldpride.png');

const F_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const I_REG = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const I_SEMI = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const C = {
  cream: '#FFE5C2', mustard: '#F4D58D', peach: '#FBA85A', burnt: '#D9633E',
  terracotta: '#B14222', cocoa: '#7A2E14', ink: '#2A1F15', inkSoft: '#5A4A38',
  sand: '#FFF8F0', mist: '#E8DCC8', white: '#FFFFFF', shadeGrey: '#8B8378',
};
const W = 1080, H = 1350;

async function text({ markup, font, fontfile, width, align = 'centre', spacing }) {
  const spec = { text: markup, font, fontfile, rgba: true, dpi: 150, align };
  if (width) spec.width = width;
  if (spacing != null) spec.spacing = spacing;
  const buffer = await sharp({ text: spec }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height };
}

function pin(score, size, fill) {
  const r = size / 2, tip = size * 0.32;
  return `<g><path d="M ${r} ${size + tip} L ${r - size * 0.16} ${size * 0.92} A ${r} ${r} 0 1 1 ${r + size * 0.16} ${size * 0.92} Z" fill="${C.white}"/>` +
    `<circle cx="${r}" cy="${r}" r="${r * 0.82}" fill="${fill}"/>` +
    `<text x="${r}" y="${r + size * 0.115}" font-family="sans-serif" font-weight="bold" font-size="${size * 0.34}" fill="${C.white}" text-anchor="middle">${score}</text></g>`;
}

const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.sand}"/><stop offset="0.6" stop-color="${C.cream}"/><stop offset="1" stop-color="#FBCF9C"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<!-- subtle rainbow ribbon along the top -->
<rect x="0" y="0" width="${W}" height="14" fill="#B14222"/>
<rect x="0" y="14" width="${W}" height="10" fill="#D9633E"/>
<rect x="0" y="24" width="${W}" height="8" fill="#E89C5A"/>
<rect x="0" y="32" width="${W}" height="6" fill="#F4D58D"/>
</svg>`);

// Canal-route motif: dashed waterway curve with score pins along it.
const gw = 940, gh = 480;
const route = `<svg width="${gw}" height="${gh}" xmlns="http://www.w3.org/2000/svg">
<path d="M 60 90 C 240 60, 340 140, 380 240 C 415 330, 330 400, 480 415 C 640 430, 700 330, 720 250 C 740 170, 820 130, 890 120"
  fill="none" stroke="${C.burnt}" stroke-width="9" stroke-dasharray="4 26" stroke-linecap="round" opacity="0.9"/>
<g transform="translate(20,10)">${pin(88, 130, C.terracotta)}</g>
<g transform="translate(330,150)">${pin(92, 150, C.burnt)}</g>
<g transform="translate(430,320)">${pin(76, 120, C.peach)}</g>
<g transform="translate(660,150)">${pin(58, 110, C.shadeGrey)}</g>
<g transform="translate(830,30)">${pin(84, 125, C.terracotta)}</g>
<text x="470" y="470" font-family="sans-serif" font-size="24" fill="${C.cocoa}" text-anchor="middle" opacity="0.85">Oosterdok → Amstel → Prinsengracht → Westerdok</text>
</svg>`;

const layers = [];
const eb = await text({ markup: `<span foreground="${C.terracotta}" letter_spacing="9500">WORLDPRIDE AMSTERDAM · 25 JUL – 8 AUG</span>`, font: 'Inter SemiBold 15', fontfile: I_SEMI });
layers.push({ input: eb.buffer, left: Math.round((W - eb.width) / 2), top: 130 });
const hl = await text({ markup: `<span foreground="${C.ink}">Watch the Canal\nParade from a\nsunny terrace.</span>`, font: 'Fraunces 52', fontfile: F_BOLD, width: 960, spacing: -4 });
layers.push({ input: hl.buffer, left: Math.round((W - hl.width) / 2), top: 190 });
const subTop = 190 + hl.height + 34;
const sub = await text({ markup: `<span foreground="${C.inkSoft}">137 terraces along the route — scored for sun, live in the app.</span>`, font: 'Inter 21', fontfile: I_REG, width: 780, spacing: 6 });
layers.push({ input: sub.buffer, left: Math.round((W - sub.width) / 2), top: subTop });
layers.push({ input: Buffer.from(route), left: Math.round((W - gw) / 2), top: Math.max(subTop + sub.height + 44, 700) });
const ft = await text({ markup: `<span foreground="${C.inkSoft}">zonnie.app  ·  free on iOS</span>`, font: 'Inter SemiBold 16', fontfile: I_SEMI });
layers.push({ input: ft.buffer, left: Math.round((W - ft.width) / 2), top: H - 92 });

await sharp(bg).composite(layers).png().toFile(OUT);
console.log('wrote', OUT);
