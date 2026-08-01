/**
 * make-qr-sticker.mjs — branded Zonnie QR for print stickers.
 *
 * Generates a high-resolution QR code pointing at zonnie.app with the new app
 * icon embedded in the centre. Ink-on-sand modules (high contrast + on-brand),
 * error-correction level H (~30% redundancy) so the centre logo never breaks
 * the scan, and a cream pad behind the icon to clear the modules under it.
 *
 * Run from the project root:  node scripts/marketing/make-qr-sticker.mjs
 * (uses sharp + qrcode from node_modules). Output → Google Drive marketing assets.
 */

import QRCode from 'qrcode';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const URL = 'https://zonnie.app/';
const SIZE = 1600; // QR canvas px (includes the quiet-zone margin)
const ICON = 'assets/images/icon.png'; // the new Zonnie app icon
const OUT_DIR = 'G:/My Drive/Zonnie Marketing/Assets/QR';
mkdirSync(OUT_DIR, { recursive: true });

// 1. QR base — high error correction tolerates the centre logo. Ink (#2A1F15)
//    on sand (#FFF8F0): near-black on near-white = reliable scanning, on-brand.
const qrBuf = await QRCode.toBuffer(URL, {
  errorCorrectionLevel: 'H',
  margin: 4, // quiet zone (modules) — important for sticker scannability
  width: SIZE,
  color: { dark: '#2A1F15FF', light: '#FFF8F0FF' },
});
const meta = await sharp(qrBuf).metadata();
const W = meta.width;
const H = meta.height;

// 2. Rounded app icon for the centre (~22% of width — well within H's budget).
const logo = Math.round(W * 0.22);
const lr = Math.round(logo * 0.22); // squircle-ish corner radius
const logoMask = Buffer.from(
  `<svg width="${logo}" height="${logo}"><rect width="${logo}" height="${logo}" rx="${lr}" ry="${lr}"/></svg>`,
);
const roundedIcon = await sharp(ICON)
  .resize(logo, logo, { fit: 'cover' })
  .composite([{ input: logoMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

// 3. Cream pad behind the icon — clears the QR modules under the logo so the
//    eye (and the scanner) reads icon vs code cleanly.
const pad = Math.round(logo * 1.18);
const pr = Math.round(pad * 0.24);
const padBuf = await sharp(
  Buffer.from(
    `<svg width="${pad}" height="${pad}"><rect width="${pad}" height="${pad}" rx="${pr}" ry="${pr}" fill="#FFF8F0"/></svg>`,
  ),
)
  .png()
  .toBuffer();

// 4. Composite pad + icon onto the QR, centred.
const out = await sharp(qrBuf)
  .composite([
    { input: padBuf, top: Math.round((H - pad) / 2), left: Math.round((W - pad) / 2) },
    { input: roundedIcon, top: Math.round((H - logo) / 2), left: Math.round((W - logo) / 2) },
  ])
  .png()
  .toBuffer();

const file = `${OUT_DIR}/zonnie-qr-sticker.png`;
await sharp(out).toFile(file);
console.log(
  `Wrote ${file}  (${W}x${H}px · encodes ${URL} · logo ${Math.round((logo / W) * 100)}% of width · ECC=H · quiet-zone margin=4)`,
);
