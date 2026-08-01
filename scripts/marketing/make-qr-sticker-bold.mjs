/**
 * make-qr-sticker-bold.mjs — bold sunburst Zonnie QR sticker (print-ready).
 *
 * Renders the v3 design: burnt/mustard radiating sunburst, terracotta spiked
 * corona, near-black band with curved Fraunces type ("FIND YOUR PLACE IN THE
 * SUN" / "AMSTERDAM TERRACES · ZONNIE.APP"), and a real scannable QR in the
 * centre plate. Built as one SVG (Fraunces embedded via @font-face base64) and
 * rasterised with sharp. Run from project root: node scripts/marketing/make-qr-sticker-bold.mjs
 */
import QRCode from 'qrcode';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL = 'https://zonnie.app/';
const OUT_DIR = 'G:/My Drive/Zonnie Marketing/Assets/QR';
const PX = 2000; // print resolution
const cx = 300, cy = 300; // work in a 600 viewBox, scale to PX on raster
mkdirSync(OUT_DIR, { recursive: true });

// ── fonts (embed whatever heavy Fraunces weights exist) ──────────────────────
const F = 'node_modules/@expo-google-fonts/fraunces/';
const pick = (...c) => c.find((p) => existsSync(p));
const headFile = pick(F + '900Black/Fraunces_900Black.ttf', F + '700Bold/Fraunces_700Bold.ttf');
const subFile = pick(F + '700Bold/Fraunces_700Bold.ttf');
const b64 = (p) => readFileSync(p).toString('base64');
const headWeight = headFile.includes('900Black') ? 900 : 700;
const fontCss = `
@font-face{font-family:'FrSticker';font-weight:${headWeight};src:url(data:font/ttf;base64,${b64(headFile)}) format('truetype');}
@font-face{font-family:'FrStickerSub';font-weight:700;src:url(data:font/ttf;base64,${b64(subFile)}) format('truetype');}`;

// ── real QR for the centre plate (plain, ink on white, ECC H) ────────────────
const qrBuf = await QRCode.toBuffer(URL, { errorCorrectionLevel: 'H', margin: 2, width: 600, color: { dark: '#2A1F15FF', light: '#FFFFFFFF' } });
const qrB64 = qrBuf.toString('base64');

// ── radial geometry (sunburst wedges, spiked corona, sparkles) ───────────────
const P = (n) => n.toFixed(1);
let wedges = '';
{ const R = 270, N = 24, cols = ['#D9633E', '#F4D58D'];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2;
    wedges += `<path d="M${cx} ${cy} L${P(cx + R * Math.cos(a0))} ${P(cy + R * Math.sin(a0))} A${R} ${R} 0 0 1 ${P(cx + R * Math.cos(a1))} ${P(cy + R * Math.sin(a1))} Z" fill="${cols[i % 2]}"/>`;
  } }
let spikes = '';
{ const M = 20, Rin = 262, half = (Math.PI / M) * 0.42;
  for (let j = 0; j < M; j++) {
    const Rout = j % 2 === 0 ? 312 : 288, a = (j / M) * 2 * Math.PI - Math.PI / 2;
    spikes += `<path d="M${P(cx + Rout * Math.cos(a))} ${P(cy + Rout * Math.sin(a))} L${P(cx + Rin * Math.cos(a - half))} ${P(cy + Rin * Math.sin(a - half))} L${P(cx + Rin * Math.cos(a + half))} ${P(cy + Rin * Math.sin(a + half))} Z" fill="${j % 2 === 0 ? '#B14222' : '#D9633E'}"/>`;
  } }
let stars = '';
[[300,182],[414,300],[300,418],[186,300],[240,240],[360,360]].forEach(([x,y]) => {
  const r = 7;
  stars += `<path d="M${x} ${y-r} L${x+r*0.3} ${y-r*0.3} L${x+r} ${y} L${x+r*0.3} ${y+r*0.3} L${x} ${y+r} L${x-r*0.3} ${y+r*0.3} L${x-r} ${y} L${x-r*0.3} ${y-r*0.3} Z" fill="#FFF8F0"/>`;
});

function svg(withFont) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="0 0 600 600">
<defs>${withFont ? `<style type="text/css">${fontCss}</style>` : ''}
<clipPath id="disc"><circle cx="300" cy="300" r="266"/></clipPath>
<path id="arc" d="M 66 300 A 234 234 0 0 1 534 300" fill="none"/></defs>
<g>${spikes}</g>
<circle cx="300" cy="300" r="266" fill="#F4D58D"/>
<g clip-path="url(#disc)">${wedges}</g>
<g>${stars}</g>
<circle cx="300" cy="300" r="236" fill="none" stroke="#2A1F15" stroke-width="64"/>
<circle cx="300" cy="300" r="268" fill="none" stroke="#F4D58D" stroke-width="3.5"/>
<circle cx="300" cy="300" r="204" fill="none" stroke="#F4D58D" stroke-width="3.5"/>
<text font-family="${withFont ? "FrSticker, serif" : 'serif'}" font-weight="${headWeight}" font-size="33" letter-spacing="1.5" fill="#FFF8F0"><textPath href="#arc" startOffset="50%" text-anchor="middle">FIND YOUR PLACE IN THE SUN</textPath></text>
<g transform="rotate(180 300 300)"><text font-family="${withFont ? "FrStickerSub, serif" : 'serif'}" font-weight="700" font-size="24" letter-spacing="1.5" fill="#F4D58D"><textPath href="#arc" startOffset="50%" text-anchor="middle">AMSTERDAM TERRACES · ZONNIE.APP</textPath></text></g>
<rect x="212" y="212" width="176" height="176" rx="22" fill="#FFFFFF" stroke="#D9633E" stroke-width="6"/>
<image href="data:image/png;base64,${qrB64}" x="220" y="220" width="160" height="160"/>
</svg>`;
}

const file = `${OUT_DIR}/zonnie-qr-sticker-bold.png`;
await sharp(Buffer.from(svg(true))).png().toFile(file);

// Font-loaded check: render without @font-face and compare the text-band region.
const withF = await sharp(Buffer.from(svg(true))).extract({ left: 500, top: 130, width: 1000, height: 220 }).raw().toBuffer();
const noF = await sharp(Buffer.from(svg(false))).extract({ left: 500, top: 130, width: 1000, height: 220 }).raw().toBuffer();
let diff = 0; for (let i = 0; i < withF.length; i++) if (withF[i] !== noF[i]) diff++;
const fontTook = diff / withF.length > 0.01;
console.log(`Wrote ${file} (${PX}x${PX})`);
console.log(`Headline font file: ${headFile.split('/').pop()} (weight ${headWeight})`);
console.log(`Embedded-font vs fallback differ in ${(diff / withF.length * 100).toFixed(1)}% of text-band pixels → sharp curved-text Fraunces ${fontTook ? 'LOADED ✅' : 'did NOT load ⚠️ (fallback serif)'}`);

// ── Browser-perfect standalone HTML (Fraunces via Google Fonts) ──────────────
// Open in Chrome → looks exactly like the mockup → "Print → Save as PDF" (vector
// crisp) or screenshot for a raster. Sidesteps sharp's curved-text font limit.
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Zonnie sticker — print me</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,900&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:#fff;}.s{display:flex;justify-content:center;align-items:center;min-height:100vh;}@media print{.s{min-height:auto;}}</style></head>
<body><div class="s">
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 600 600">
<defs><clipPath id="disc"><circle cx="300" cy="300" r="266"/></clipPath><path id="arc" d="M 66 300 A 234 234 0 0 1 534 300" fill="none"/></defs>
<g>${spikes}</g><circle cx="300" cy="300" r="266" fill="#F4D58D"/><g clip-path="url(#disc)">${wedges}</g><g>${stars}</g>
<circle cx="300" cy="300" r="236" fill="none" stroke="#2A1F15" stroke-width="64"/>
<circle cx="300" cy="300" r="268" fill="none" stroke="#F4D58D" stroke-width="3.5"/>
<circle cx="300" cy="300" r="204" fill="none" stroke="#F4D58D" stroke-width="3.5"/>
<text font-family="Fraunces, serif" font-weight="900" font-size="33" letter-spacing="1.5" fill="#FFF8F0"><textPath href="#arc" startOffset="50%" text-anchor="middle">FIND YOUR PLACE IN THE SUN</textPath></text>
<g transform="rotate(180 300 300)"><text font-family="Fraunces, serif" font-weight="700" font-size="24" letter-spacing="1.5" fill="#F4D58D"><textPath href="#arc" startOffset="50%" text-anchor="middle">AMSTERDAM TERRACES · ZONNIE.APP</textPath></text></g>
<rect x="212" y="212" width="176" height="176" rx="22" fill="#FFFFFF" stroke="#D9633E" stroke-width="6"/>
<image href="data:image/png;base64,${qrB64}" x="220" y="220" width="160" height="160"/>
</svg></div></body></html>`;
const htmlFile = `${OUT_DIR}/zonnie-qr-sticker-bold.html`;
writeFileSync(htmlFile, html);
console.log(`Wrote ${htmlFile} (open in Chrome → Print → Save as PDF for a print-perfect Fraunces sticker)`);

// QR scannability of the embedded centre code
try {
  const jsQR = (await import('jsqr')).default;
  const q = await sharp(qrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dec = jsQR(new Uint8ClampedArray(q.data), q.info.width, q.info.height);
  console.log(`Centre QR decodes → ${dec ? JSON.stringify(dec.data) + ' ✅' : 'FAILED ⚠️'}`);
} catch (e) { console.log('QR decode check skipped:', e.message); }
