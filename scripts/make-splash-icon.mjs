/**
 * make-splash-icon.mjs — regenerate assets/images/splash-icon.png from the
 * current brand app icon.
 *
 * expo-splash-screen shows this image centred (imageWidth 200, contain) on the
 * cream background. The previous file was the OLD icon, so the launch splash
 * still showed the old design after the app icon was updated. This renders the
 * NEW icon as a rounded tile with transparent corners (matching the old splash
 * format: 1024×1024 RGBA, ~19% corner radius) so it floats nicely on the cream.
 *
 * Run from project root:  node scripts/make-splash-icon.mjs
 * NOTE: the splash image is native config — it only reaches devices in a NEW
 * build (it cannot be shipped over-the-air).
 */
import sharp from 'sharp';

const SRC = 'G:/My Drive/Zonnie Marketing/Assets/Logos/Zonnie-Final/zonnie-appicon-1024.png';
const OUT = 'assets/images/splash-icon.png';
const SIZE = 1024;
const R = 200; // ≈19.5% corner radius — matches the previous splash tile

const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="#fff"/></svg>`,
);

await sharp(SRC)
  .resize(SIZE, SIZE)
  .composite([{ input: mask, blend: 'dest-in' }]) // dest-in = keep source only where mask is opaque → rounds corners
  .png()
  .toFile(OUT);

console.log(`Wrote ${OUT} (${SIZE}x${SIZE} rounded tile of the new icon)`);
