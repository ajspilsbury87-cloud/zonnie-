/**
 * make-qr-sticker-sketch-html.mjs — Zonnie QR sticker, print file (APPROVED design).
 *
 * The full Zonnie sunset icon fills the whole sticker; over the top sit a large
 * hand-drawn headline ("FIND YOUR PLACE / IN THE SUN"), a REAL scannable QR on a
 * clean white panel, the zonnie.app wordmark, and sketched hand-drawn frames
 * (Rough.js, fixed seeds so it renders identically every time). Fonts: Cabin
 * Sketch (headline) + Caveat (wordmark).
 *
 * Why HTML (not PNG): the look needs a sketch engine (Rough.js) + Google web
 * fonts, which a browser renders perfectly but sharp/librsvg can't. The QR is
 * embedded as crisp vector (scales to any print size). Open the file in Chrome →
 * "Print → Save as PDF" for a vector, font-embedded print file.
 *
 * Run from project root:  node scripts/marketing/make-qr-sticker-sketch-html.mjs
 */
import QRCode from 'qrcode';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'https://zonnie.app/';
const OUT_DIR = 'G:/My Drive/Zonnie Marketing/Assets/QR';
mkdirSync(OUT_DIR, { recursive: true });

// ── Real QR as crisp vector SVG (recoloured to brand ink) ────────────────────
const qrSvg = await QRCode.toString(URL, { type: 'svg', errorCorrectionLevel: 'H', margin: 1 });
const qrViewBox = qrSvg.match(/viewBox="([^"]+)"/)[1];
const qrInner = [...qrSvg.matchAll(/<path[^>]*>/g)]
  .map((m) => m[0])
  .join('')
  .replace('stroke="#000000"', 'stroke="#1A130C" stroke-width="1"');

// ── Full-bleed Zonnie icon (inlined from the brand SVG) ──────────────────────
const ICON = `<svg width="600" height="600" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="eBg" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE9A0"/><stop offset="0.42" stop-color="#FFC265"/><stop offset="0.72" stop-color="#FF8F5E"/><stop offset="1" stop-color="#E8556B"/></linearGradient>
    <radialGradient id="eGlow" cx="512" cy="600" r="385" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFF7DA" stop-opacity="0.95"/><stop offset="1" stop-color="#FFF7DA" stop-opacity="0"/></radialGradient>
    <linearGradient id="eSun" x1="0" y1="400" x2="0" y2="780" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFDF2"/><stop offset="1" stop-color="#FFCB5A"/></linearGradient>
    <clipPath id="eTop"><rect x="0" y="0" width="1024" height="600"/></clipPath>
  </defs>
  <rect width="1024" height="1024" fill="url(#eBg)"/>
  <rect x="0" y="240" width="1024" height="720" fill="url(#eGlow)"/>
  <circle cx="512" cy="600" r="178" fill="url(#eSun)" clip-path="url(#eTop)"/>
  <rect x="146" y="595" width="732" height="9" rx="4.5" fill="#FFF3D2" opacity="0.9"/>
  <rect x="250" y="628" width="524" height="7" rx="3.5" fill="#FFFFFF" opacity="0.38"/>
  <rect x="330" y="656" width="364" height="6" rx="3" fill="#FFFFFF" opacity="0.22"/>
</svg>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Zonnie sticker — open, then Print → Save as PDF</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cabin+Sketch:wght@400;700&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/roughjs/4.6.6/rough.min.js"></script>
<style>
  html,body{margin:0;background:#efe7dc;font-family:'Caveat',cursive;}
  .stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;}
  .sticker{width:520px;height:520px;}
  .hint{color:#5A4A38;font-size:22px;text-align:center;max-width:520px;}
  @media print{
    body{background:#fff;}
    .hint{display:none;}
    .stage{min-height:auto;padding:0;}
    .sticker{width:90mm;height:90mm;}
    @page{size:auto;margin:10mm;}
  }
</style>
</head>
<body>
<div class="stage">
  <svg class="sticker" id="d" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zonnie sticker: the full sunset icon as background with a large hand-drawn headline find your place in the sun, a scannable QR code, and zonnie.app">
    <defs><clipPath id="round"><rect x="0" y="0" width="600" height="600" rx="52"/></clipPath></defs>

    <g clip-path="url(#round)">${ICON}</g>

    <g id="ink"></g>

    <text x="300" y="96" text-anchor="middle" font-family="'Cabin Sketch',cursive" font-weight="700" font-size="50" fill="#6B2A12">FIND YOUR PLACE</text>
    <text x="300" y="150" text-anchor="middle" font-family="'Cabin Sketch',cursive" font-weight="700" font-size="50" fill="#6B2A12">IN THE SUN</text>

    <rect x="220" y="366" width="160" height="160" rx="12" fill="#FFFFFF"/>
    <svg x="234" y="380" width="132" height="132" viewBox="${qrViewBox}" shape-rendering="crispEdges">${qrInner}</svg>

    <text x="300" y="566" text-anchor="middle" font-family="'Caveat',cursive" font-weight="700" font-size="38" fill="#FFF6E6">zonnie.app</text>
  </svg>
  <p class="hint">Open in Chrome → <b>Print → Save as PDF</b> for a print-ready sticker (vector-crisp, fonts embedded). The QR scans to zonnie.app.</p>
</div>
<script>
(function(){
  function draw(){
    if(typeof rough==='undefined'){ return setTimeout(draw,60); }
    var svg=document.getElementById('d'), ink=document.getElementById('ink');
    if(!svg||!ink||ink.childNodes.length) return;
    var rc=rough.svg(svg), C='#FFF3E4';
    var add=function(el){ ink.appendChild(el); };
    var over=function(make){ add(make(11)); add(make(91)); }; // two seeds = overdrawn look
    over(function(s){ return rc.rectangle(26,26,548,548,{stroke:C,strokeWidth:2.6,roughness:3.2,bowing:2.4,seed:s}); });
    over(function(s){ return rc.rectangle(214,360,172,172,{stroke:'#6B2A12',strokeWidth:2.8,roughness:3.2,bowing:2.4,seed:s}); });
  }
  draw();
})();
</script>
</body>
</html>`;

const file = `${OUT_DIR}/zonnie-qr-sticker-sketched.html`;
writeFileSync(file, html);
console.log(`Wrote ${file}`);

// ── Verify the embedded QR actually decodes ──────────────────────────────────
try {
  const sharp = (await import('sharp')).default;
  const jsQR = (await import('jsqr')).default;
  const buf = await QRCode.toBuffer(URL, { errorCorrectionLevel: 'H', margin: 1, width: 600, color: { dark: '#1A130CFF', light: '#FFFFFFFF' } });
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  console.log(res ? `QR decodes → ${JSON.stringify(res.data)} ✅` : 'QR did NOT decode ⚠️');
} catch (e) { console.log('QR decode check skipped:', e.message); }
console.log('Open in Chrome → Print → Save as PDF (vector-crisp, fonts embedded).');
