// make-sunsummer-tile.mjs — "My sun summer" feature-announcement IG tile
// (1080x1350). Mirrors the in-app stat-tile design so the post looks like
// the feature. Run: node scripts/marketing/make-sunsummer-tile.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'marketing/instagram/v2/11-sunsummer.png');

const F_BOLD = path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf');
const I_REG = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf');
const I_SEMI = path.join(ROOT, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

const C = {
  cream: '#FFE5C2', peach: '#FBA85A', burnt: '#D9633E', terracotta: '#B14222',
  cocoa: '#7A2E14', ink: '#2A1F15', inkSoft: '#5A4A38', sand: '#FFF8F0',
  mist: '#E8DCC8', white: '#FFFFFF',
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

const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.sand}"/><stop offset="0.6" stop-color="${C.cream}"/><stop offset="1" stop-color="#FBCF9C"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`);

// Mock of the in-app stat tiles: 2x2 grid + sunniest-moment card.
function tile(x, y, w, h, value, label) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${C.white}"/>
    <text x="${x + w / 2}" y="${y + h / 2 - 2}" font-family="serif" font-weight="bold" font-size="68" fill="${C.burnt}" text-anchor="middle">${value}</text>
    <text x="${x + w / 2}" y="${y + h - 32}" font-family="sans-serif" font-weight="600" font-size="20" letter-spacing="2" fill="${C.inkSoft}" text-anchor="middle">${label}</text>
  </g>`;
}
const gw = 860, gx = (W - gw) / 2, tw = (gw - 24) / 2, th = 200, gy = 585;
const card = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
${tile(gx, gy, tw, th, '23', 'TERRACES')}
${tile(gx + tw + 24, gy, tw, th, '17', 'ACTIVE DAYS')}
${tile(gx, gy + th + 24, tw, th, '🔥 6', 'DAY STREAK')}
${tile(gx + tw + 24, gy + th + 24, tw, th, '4', 'SUN RUNS')}
<rect x="${gx}" y="${gy + 2 * th + 48}" width="${gw}" height="92" rx="20" fill="${C.cream}"/>
<rect x="${gx}" y="${gy + 2 * th + 48}" width="6" height="92" rx="3" fill="${C.peach}"/>
<text x="${gx + 36}" y="${gy + 2 * th + 48 + 56}" font-family="sans-serif" font-weight="600" font-size="29" fill="${C.cocoa}">Sunniest moment: 93 ☀ at Waterkant</text>
</svg>`;

const layers = [];
// Increased top padding: Instagram crops aggressively, so move headline down 40px
// to ensure the badge + headline stay visible.
const eb = await text({ markup: `<span foreground="${C.terracotta}" letter_spacing="9500">NEW IN ZONNIE</span>`, font: 'Inter SemiBold 15', fontfile: I_SEMI });
layers.push({ input: eb.buffer, left: Math.round((W - eb.width) / 2), top: 160 });
// Render unwrapped (no width) so the two explicit lines never rewrap.
const hl = await text({ markup: `<span foreground="${C.ink}">Your sun summer,\ncounted.</span>`, font: 'Fraunces 46', fontfile: F_BOLD, spacing: -4 });
layers.push({ input: hl.buffer, left: Math.round((W - hl.width) / 2), top: 220 });
const subTop = 220 + hl.height + 30;
const sub = await text({ markup: `<span foreground="${C.inkSoft}">Terraces explored, sunny streaks, your golden moment — tracked on your phone, shared with one tap.</span>`, font: 'Inter 21', fontfile: I_REG, width: 800, spacing: 6 });
layers.push({ input: sub.buffer, left: Math.round((W - sub.width) / 2), top: subTop });
layers.push({ input: Buffer.from(card), left: 0, top: 0 });
const ft = await text({ markup: `<span foreground="${C.inkSoft}">zonnie.app  ·  free on iOS</span>`, font: 'Inter SemiBold 16', fontfile: I_SEMI });
layers.push({ input: ft.buffer, left: Math.round((W - ft.width) / 2), top: H - 92 });

await sharp(bg).composite(layers).png().toFile(OUT);
console.log('wrote', OUT);
