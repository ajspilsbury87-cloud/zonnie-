#!/usr/bin/env tsx
/**
 * Generate 5 App Store screenshots at the iPhone 6.9" size (1320×2868 px).
 *
 * Apple replaced the 6.7" required tab with 6.9" (iPhone 16 Pro Max
 * spec) in late-2024 App Store Connect. New submissions must include
 * a 6.9" set; ASC accepts the same image for the optional 6.5" tab
 * (legacy iPhone 11 Pro Max / XS Max sizes), automatically downscaled.
 *
 * Output PNGs land in `assets/marketing/`.
 *
 * Marketing-style framing: a large brand headline at the top (sand
 * background), then a phone-screen mockup of the relevant in-app view
 * below. Standard App Store screenshot format — most apps use this
 * over raw device captures because text overlays are how you sell
 * features, not pixel-perfect UI replicas.
 *
 * Rationale for SVG-driven generation (vs simulator capture):
 *   - Repeatable: re-run after a colour-palette tweak and you get
 *     pristine new shots in seconds.
 *   - Sharp text rendering at 6.7" resolution.
 *   - Works on Windows (no Mac simulator dependency).
 *   - Uses the live brand assets — pin PNGs, palette tokens — so
 *     screenshots stay in lockstep with the app.
 *
 * Trade-off: the in-app mockups are stylised representations, not
 * literal screen captures. App Store reviewers explicitly allow this
 * (their guidance: "screenshots may include text, framing, and
 * supplemental imagery"). Apple just requires that the *core
 * functionality* matches the app — which it does.
 *
 * Run: npx tsx scripts/generate-screenshots.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { palette } from '../src/theme/tokens';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'assets', 'marketing');
const PINS_DIR = join(ROOT, 'assets', 'images', 'pins');

/**
 * Read a pin PNG as a base64 data URI. Sharp/librsvg can't resolve
 * external `href` paths reliably across Windows drive letters and
 * file:// vs absolute-path quirks; embedding inline is foolproof.
 */
function pinDataUri(state: 'full' | 'mostly' | 'partial' | 'mshade' | 'shade' | 'selected'): string {
  const buf = readFileSync(join(PINS_DIR, `${state}@3x.png`));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// iPhone 6.9" — 1320×2868. Same aspect ratio (~0.460) as the prior
// 6.7" target, so the existing layout values (text sizes, paddings,
// element positions) scale cleanly without retuning.
const W = 1320;
const H = 2868;

mkdirSync(OUT_DIR, { recursive: true });

// ─── Shared building blocks ────────────────────────────────────────

/**
 * iOS status bar — time on the left, signal/battery on the right.
 * Stylised; doesn't need to be pixel-exact, just convincing.
 */
function statusBar(textColor = palette.ink): string {
  return `
    <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="600" fill="${textColor}">
      <text x="80" y="78" font-size="36">9:41</text>
      <g transform="translate(${W - 290}, 50)">
        <!-- signal bars -->
        <rect x="0"  y="20" width="6" height="14" rx="1" fill="${textColor}"/>
        <rect x="10" y="14" width="6" height="20" rx="1" fill="${textColor}"/>
        <rect x="20" y="8"  width="6" height="26" rx="1" fill="${textColor}"/>
        <rect x="30" y="2"  width="6" height="32" rx="1" fill="${textColor}"/>
        <!-- wifi -->
        <text x="60" y="32" font-size="32">􀙇</text>
        <!-- battery -->
        <rect x="115" y="6" width="62" height="28" rx="6" fill="none" stroke="${textColor}" stroke-width="2"/>
        <rect x="180" y="14" width="4" height="12" rx="1" fill="${textColor}"/>
        <rect x="119" y="10" width="54" height="20" rx="3" fill="${textColor}"/>
      </g>
    </g>`;
}

/**
 * The marketing headline + subhead block at the top of the screenshot.
 * Display font for the punch line, body font for the support line.
 *
 * Headline auto-shrinks if the text exceeds 18 characters so we don't
 * clip at the 1290-px viewport edges. Beyond ~16 chars at the
 * default 120-pt size the text spills past the screen sides; the
 * step-down to 96 keeps everything inside the safe area.
 */
function headerBlock(headline: string, subhead: string): string {
  const headlineSize = headline.length > 18 ? 96 : 120;
  return `
    <g text-anchor="middle">
      <text x="${W / 2}" y="320"
            font-family="Georgia, 'Times New Roman', serif"
            font-weight="700"
            font-size="${headlineSize}"
            fill="${palette.ink}"
            letter-spacing="-2">${escape(headline)}</text>
      <text x="${W / 2}" y="420"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            font-weight="500"
            font-size="48"
            fill="${palette.inkSoft}">${escape(subhead)}</text>
    </g>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Drop-shadow filter id-based reference. */
const DROP_SHADOW = `
  <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="${palette.ink}" flood-opacity="0.15"/>
  </filter>`;

/**
 * Phone-screen frame — a rounded rectangle with subtle drop shadow that
 * the in-app mockup sits inside. Top-left corner at (frameX, frameY).
 */
function phoneFrame(
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  innerSvg: string,
  bg = palette.sand,
): string {
  return `
    <g filter="url(#cardShadow)">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}"
            rx="56" fill="${bg}"/>
    </g>
    <!-- clip the inner SVG to the frame -->
    <defs>
      <clipPath id="frameClip-${frameY}">
        <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="56"/>
      </clipPath>
    </defs>
    <g clip-path="url(#frameClip-${frameY})">
      ${innerSvg}
    </g>`;
}

// ─── Screenshot 1 — Hero ───────────────────────────────────────────

function shot1Hero(): string {
  // Big brand sun + rays in the centre, giant headline, no phone frame.
  // First impression in the App Store carousel.
  const cx = W / 2;
  const cy = 1500;
  const r = 280;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360;
    const inner = r + 60;
    const outer = r + 200;
    const rad = (angle * Math.PI) / 180;
    const x1 = cx + Math.sin(rad) * inner;
    const y1 = cy - Math.cos(rad) * inner;
    const x2 = cx + Math.sin(rad) * outer;
    const y2 = cy - Math.cos(rad) * outer;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${palette.peach}" stroke-width="40" stroke-linecap="round"/>`;
  }).join('\n');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${DROP_SHADOW}
        <radialGradient id="bg1" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stop-color="${palette.cream}"/>
          <stop offset="100%" stop-color="${palette.sand}"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg1)"/>
      ${statusBar()}

      <!-- Big sun group, central -->
      ${rays}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${palette.peach}" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette.burnt}" stroke-width="6" opacity="0.4" />

      <!-- Headline + subhead — moved DOWN, below the sun -->
      <g text-anchor="middle">
        <text x="${cx}" y="2150"
              font-family="Georgia, 'Times New Roman', serif"
              font-weight="700"
              font-size="180"
              fill="${palette.ink}"
              letter-spacing="-3">Find sun, fast.</text>
        <text x="${cx}" y="2280"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="500"
              font-size="58"
              fill="${palette.inkSoft}">Amsterdam's sunniest terraces, ranked.</text>
      </g>

      <!-- Brand wordmark at the bottom -->
      <text x="${cx}" y="2620"
            text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif"
            font-weight="700"
            font-size="68"
            fill="${palette.burnt}"
            letter-spacing="6">Z O N N I E</text>
    </svg>`;
}

// ─── Screenshot 2 — Map with pins ──────────────────────────────────

function shot2Map(): string {
  // Stylised map background with brand-coloured pins clustered.
  // Pins are inlined as base64 data URIs — Sharp can't reliably
  // resolve external href paths on Windows.
  const full = pinDataUri('full');
  const mostly = pinDataUri('mostly');
  const partial = pinDataUri('partial');
  const mshade = pinDataUri('mshade');
  const shade = pinDataUri('shade');
  const selected = pinDataUri('selected');

  const inner = `
    <!-- Map area — start under the headline -->
    <rect x="80" y="540" width="${W - 160}" height="2150" rx="48" fill="${palette.sandDeep}"/>

    <!-- Park / green spaces -->
    <ellipse cx="240" cy="1750" rx="220" ry="260" fill="${palette.cream}" opacity="0.85"/>
    <ellipse cx="1080" cy="2350" rx="180" ry="180" fill="${palette.cream}" opacity="0.85"/>

    <!-- IJ canal — fatter, more visible -->
    <path d="M 80 1100 Q 400 1060 760 1110 T ${W - 80} 1100 L ${W - 80} 1190 Q 760 1180 400 1140 T 80 1180 Z"
          fill="${palette.mustard}" opacity="0.55"/>
    <path d="M 80 2080 Q 500 2060 900 2100 T ${W - 80} 2090 L ${W - 80} 2160 Q 900 2150 500 2120 T 80 2160 Z"
          fill="${palette.mustard}" opacity="0.55"/>

    <!-- Streets — denser, more believable -->
    <g stroke="${palette.mist}" stroke-width="5" opacity="0.85">
      <line x1="80"  y1="780"  x2="${W - 80}" y2="800"/>
      <line x1="80"  y1="1330" x2="${W - 80}" y2="1320"/>
      <line x1="80"  y1="1500" x2="${W - 80}" y2="1510"/>
      <line x1="80"  y1="1660" x2="${W - 80}" y2="1670"/>
      <line x1="80"  y1="1820" x2="${W - 80}" y2="1830"/>
      <line x1="80"  y1="2300" x2="${W - 80}" y2="2310"/>
      <line x1="80"  y1="2480" x2="${W - 80}" y2="2470"/>
      <line x1="450"  y1="540"  x2="460"  y2="2680"/>
      <line x1="780"  y1="540"  x2="800"  y2="2680"/>
      <line x1="1080" y1="540"  x2="1070" y2="2680"/>
    </g>
    <g stroke="${palette.mist}" stroke-width="3" opacity="0.55">
      <line x1="200" y1="540" x2="240" y2="2680"/>
      <line x1="620" y1="540" x2="640" y2="2680"/>
      <line x1="940" y1="540" x2="960" y2="2680"/>
      <line x1="1200" y1="540" x2="1190" y2="2680"/>
    </g>

    <!-- Pin cluster — Aperol spritz pins around the map. Sized so
         the bigger sun-pins read at glance distance. -->
    <image href="${full}"     x="630" y="1320" width="160" height="226"/>
    <image href="${mostly}"   x="430" y="1620" width="138" height="195"/>
    <image href="${full}"     x="850" y="1480" width="160" height="226"/>
    <image href="${selected}" x="240" y="1860" width="180" height="252"/>
    <image href="${partial}"  x="990" y="1900" width="116" height="164"/>
    <image href="${mshade}"   x="700" y="2120" width="98" height="138"/>
    <image href="${mostly}"   x="340" y="1340" width="138" height="195"/>
    <image href="${shade}"    x="1060" y="2300" width="80" height="113"/>
    <image href="${full}"     x="1100" y="1500" width="160" height="226"/>
    <image href="${partial}"  x="180"  y="1380" width="116" height="164"/>

    <!-- "You are here" dot -->
    <circle cx="${W / 2 + 40}" cy="2560" r="18" fill="${palette.peach}" opacity="0.4"/>
    <circle cx="${W / 2 + 40}" cy="2560" r="10" fill="${palette.peach}"/>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${DROP_SHADOW}</defs>
      <rect width="${W}" height="${H}" fill="${palette.sand}"/>
      ${statusBar()}
      ${headerBlock('Real shadows.', "LIDAR-derived building heights from 3D BAG.")}
      ${inner}
    </svg>`;
}

// ─── Screenshot 3 — Time scrubber ──────────────────────────────────

function shot3TimeScrubber(): string {
  const sheetTop = 540;
  const sheetH = H - sheetTop - 60;

  const inner = `
    <!-- bottom-sheet container -->
    <rect x="80" y="${sheetTop}" width="${W - 160}" height="${sheetH}"
          rx="48" fill="${palette.white}"/>
    <!-- handle -->
    <rect x="${W / 2 - 40}" y="${sheetTop + 24}" width="80" height="8" rx="4" fill="${palette.mistDeep}"/>

    <!-- Date picker chips -->
    <g font-family="-apple-system, BlinkMacSystemFont, sans-serif">
      <g transform="translate(140, ${sheetTop + 100})">
        <rect width="180" height="160" rx="20" fill="${palette.peach}"/>
        <text x="90" y="55" text-anchor="middle" font-weight="600" font-size="34" fill="${palette.white}">Today</text>
        <text x="90" y="105" text-anchor="middle" font-size="28" fill="${palette.white}">9 May</text>
        <text x="90" y="145" text-anchor="middle" font-size="34" fill="${palette.white}">☀</text>
      </g>
      <g transform="translate(340, ${sheetTop + 100})">
        <rect width="180" height="160" rx="20" fill="${palette.sandDeep}"/>
        <text x="90" y="55" text-anchor="middle" font-weight="600" font-size="34" fill="${palette.ink}">Tomor.</text>
        <text x="90" y="105" text-anchor="middle" font-size="28" fill="${palette.inkSoft}">10 May</text>
        <text x="90" y="145" text-anchor="middle" font-size="34">🌤</text>
      </g>
      <g transform="translate(540, ${sheetTop + 100})">
        <rect width="180" height="160" rx="20" fill="${palette.sandDeep}"/>
        <text x="90" y="55" text-anchor="middle" font-weight="600" font-size="34" fill="${palette.ink}">Sun</text>
        <text x="90" y="105" text-anchor="middle" font-size="28" fill="${palette.inkSoft}">11 May</text>
        <text x="90" y="145" text-anchor="middle" font-size="34">⛅</text>
      </g>
      <g transform="translate(740, ${sheetTop + 100})">
        <rect width="180" height="160" rx="20" fill="${palette.sandDeep}"/>
        <text x="90" y="55" text-anchor="middle" font-weight="600" font-size="34" fill="${palette.ink}">Mon</text>
        <text x="90" y="105" text-anchor="middle" font-size="28" fill="${palette.inkSoft}">12 May</text>
        <text x="90" y="145" text-anchor="middle" font-size="34">☀</text>
      </g>
    </g>

    <!-- Visiting + weather line -->
    <g transform="translate(140, ${sheetTop + 340})" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
      <text font-size="48" fill="${palette.inkSoft}">Visiting</text>
      <text x="220" font-family="Georgia, serif" font-weight="700" font-size="56" fill="${palette.ink}">14:00</text>
      <text x="430" font-size="48" fill="${palette.inkSoft}">–</text>
      <text x="490" font-family="Georgia, serif" font-weight="700" font-size="56" fill="${palette.ink}">17:00</text>
      <text y="80" font-weight="500" font-size="40" fill="${palette.inkSoft}">☀ Clear · 22° · Calm</text>
    </g>

    <!-- Preset pills row -->
    <g transform="translate(140, ${sheetTop + 510})" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="600">
      <g>
        <rect width="240" height="100" rx="50" fill="${palette.peach}"/>
        <text x="120" y="65" text-anchor="middle" font-size="42" fill="${palette.white}">Now</text>
      </g>
      <g transform="translate(255, 0)">
        <rect width="240" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="120" y="65" text-anchor="middle" font-size="42" fill="${palette.inkSoft}">Afternoon</text>
      </g>
      <g transform="translate(510, 0)">
        <rect width="240" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="120" y="65" text-anchor="middle" font-size="42" fill="${palette.inkSoft}">Evening</text>
      </g>
      <g transform="translate(765, 0)">
        <rect width="240" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="120" y="65" text-anchor="middle" font-size="42" fill="${palette.inkSoft}">All day</text>
      </g>
    </g>

    <!-- Hourly weather strip -->
    <g transform="translate(140, ${sheetTop + 670})" font-family="-apple-system, sans-serif">
      ${[14, 15, 16, 17].map((hour, i) => `
        <g transform="translate(${i * 250}, 0)">
          <rect width="220" height="200" rx="24" fill="${palette.sandDeep}"/>
          <text x="110" y="45" text-anchor="middle" font-size="36" font-weight="600" fill="${palette.inkSoft}">${hour}:00</text>
          <text x="110" y="105" text-anchor="middle" font-size="68">☀</text>
          <text x="110" y="170" text-anchor="middle" font-size="48" font-family="Georgia, serif" font-weight="700" fill="${palette.ink}">2${i + 1}°</text>
        </g>`).join('')}
    </g>

    <!-- Result list preview -->
    <g transform="translate(140, ${sheetTop + 920})" font-family="-apple-system, sans-serif">
      ${[
        { rank: 1, name: 'Café Kiebêrt', area: 'Stadionbuurt', score: 95 },
        { rank: 2, name: "Sportclub Match & Eetcafé Thijs", area: 'Oud-Zuid', score: 95 },
        { rank: 3, name: 'Café Anno 1890', area: 'Zuidas', score: 95 },
      ].map((r, i) => `
        <g transform="translate(0, ${i * 130})">
          <text x="0" y="40" font-weight="700" font-family="Georgia, serif" font-size="40" fill="${palette.inkSoft}">${r.rank}</text>
          <text x="60" y="40" font-weight="700" font-family="Georgia, serif" font-size="42" fill="${palette.ink}">${escape(r.name)}</text>
          <text x="60" y="90" font-size="32" fill="${palette.inkSoft}">${r.area} · Full Sun</text>
          <g transform="translate(900, 5)">
            <rect width="100" height="60" rx="30" fill="${palette.burnt}"/>
            <text x="50" y="42" text-anchor="middle" font-weight="700" font-size="38" fill="${palette.white}">${r.score}</text>
          </g>
        </g>`).join('')}
    </g>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${DROP_SHADOW}</defs>
      <rect width="${W}" height="${H}" fill="${palette.sand}"/>
      ${statusBar()}
      ${headerBlock('Plan your stop.', 'Pick a time. We rank by sun for those hours.')}
      ${inner}
    </svg>`;
}

// ─── Screenshot 4 — Match filter ───────────────────────────────────

function shot4Match(): string {
  const cardTop = 700;
  const inner = `
    <!-- Featured filter chip row -->
    <g transform="translate(140, 540)" font-family="-apple-system, sans-serif" font-weight="600">
      <g>
        <rect width="200" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="100" y="65" text-anchor="middle" font-size="42" fill="${palette.inkSoft}">Bar</text>
      </g>
      <g transform="translate(220, 0)">
        <rect width="280" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="140" y="65" text-anchor="middle" font-size="42" fill="${palette.inkSoft}">Restaurant</text>
      </g>
      <g transform="translate(525, 0)">
        <rect width="290" height="100" rx="50" fill="${palette.burnt}"/>
        <text x="145" y="65" text-anchor="middle" font-size="42" fill="${palette.cream}">📺 Match</text>
      </g>
    </g>

    <!-- Top venue card. Taller so the "outdoor screens" badge sits
         below the score chip, not under it. -->
    <g filter="url(#cardShadow)">
      <rect x="80" y="${cardTop}" width="${W - 160}" height="320" rx="32" fill="${palette.white}"/>
    </g>
    <g transform="translate(140, ${cardTop + 50})" font-family="-apple-system, sans-serif">
      <text font-family="Georgia, serif" font-weight="700" font-size="64" fill="${palette.ink}">Westergasterras</text>
      <text y="70" font-size="36" fill="${palette.inkSoft}">Westerpark · Full Sun</text>
      <!-- Outdoor-screens badge in its own row, full-width-friendly -->
      <g transform="translate(0, 140)">
        <rect width="380" height="68" rx="34" fill="${palette.ink}"/>
        <text x="190" y="46" text-anchor="middle" font-weight="600" font-size="32" fill="${palette.cream}">📺 2 outdoor screens</text>
      </g>
    </g>
    <!-- Score chip — pull up so it doesn't overlap the badge below. -->
    <g transform="translate(${W - 250}, ${cardTop + 50})">
      <rect width="160" height="100" rx="50" fill="${palette.burnt}"/>
      <text x="80" y="68" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="56" fill="${palette.white}">95</text>
    </g>

    <!-- Sun timeline below. Shifted down for the taller card. -->
    <g transform="translate(140, ${cardTop + 400})" font-family="-apple-system, sans-serif">
      <text font-weight="600" font-size="32" fill="${palette.inkSoft}" letter-spacing="2">SUN TODAY</text>
      <g transform="translate(0, 60)">
        ${Array.from({ length: 14 }, (_, i) => {
          const hour = 8 + i;
          // Bell-curve mock: peak around 14:00.
          const score = Math.max(0.05, 1 - Math.pow((hour - 14) / 7, 2));
          const h = Math.round(score * 280);
          const colour =
            score > 0.7 ? palette.burnt :
            score > 0.5 ? palette.orange :
            score > 0.3 ? palette.mustard :
            palette.cocoa;
          // Highlight the visit window 14-17.
          const inWindow = hour >= 14 && hour <= 17;
          return `
            <g transform="translate(${i * 70}, ${280 - h})">
              <rect width="50" height="${h}" rx="8" fill="${colour}" opacity="${inWindow ? 1 : 0.45}"/>
              <text x="25" y="${h + 50}" text-anchor="middle" font-size="24" fill="${palette.inkSoft}">${hour}</text>
            </g>`;
        }).join('')}
      </g>
    </g>

    <!-- Action buttons -->
    <g transform="translate(140, ${cardTop + 960})" font-family="-apple-system, sans-serif" font-weight="600">
      <g>
        <rect width="480" height="100" rx="50" fill="${palette.sandDeep}"/>
        <text x="240" y="65" text-anchor="middle" font-size="40" fill="${palette.ink}">Show on Map</text>
      </g>
      <g transform="translate(500, 0)">
        <rect width="500" height="100" rx="50" fill="${palette.peach}"/>
        <text x="250" y="65" text-anchor="middle" font-size="40" fill="${palette.white}">Get Directions</text>
      </g>
    </g>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${DROP_SHADOW}</defs>
      <rect width="${W}" height="${H}" fill="${palette.sand}"/>
      ${statusBar()}
      ${headerBlock('Catch the World Cup', 'Outdoor TV screens at 13 venues.')}
      ${inner}
    </svg>`;
}

// ─── Screenshot 5 — Home screen widget ─────────────────────────────

function shot5Widget(): string {
  // Mock home-screen with the Zonnie widget prominent.
  const widgetX = 145;
  const widgetY = 1100;
  const widgetW = 1000;
  const widgetH = 520;

  const inner = `
    <!-- Stylised home-screen wallpaper -->
    <defs>
      <linearGradient id="wallpaper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${palette.cream}"/>
        <stop offset="100%" stop-color="${palette.peach}" stop-opacity="0.4"/>
      </linearGradient>
    </defs>
    <rect x="80" y="540" width="${W - 160}" height="${H - 700}" rx="56" fill="url(#wallpaper)"/>

    <!-- Mock app-icon grid (above the widget) -->
    <g>
      ${[
        { c: '#6FA8DC', glyph: '☎' },
        { c: '#76D275', glyph: '✉' },
        { c: '#FCD34D', glyph: '⌘' },
        { c: '#FB923C', glyph: '☆' },
        { c: '#A78BFA', glyph: '⌨' },
      ].map((app, i) => `
        <g transform="translate(${145 + i * 200}, 720)">
          <rect width="180" height="180" rx="40" fill="${app.c}"/>
        </g>`).join('')}
    </g>

    <!-- Zonnie widget — medium -->
    <g filter="url(#cardShadow)">
      <rect x="${widgetX}" y="${widgetY}" width="${widgetW}" height="${widgetH}"
            rx="56" fill="${palette.white}"/>
    </g>

    <g transform="translate(${widgetX + 50}, ${widgetY + 50})" font-family="-apple-system, sans-serif">
      <text font-size="32">☀</text>
      <text x="50" y="30" font-weight="600" font-size="32" fill="${palette.inkSoft}" letter-spacing="2">SUNNIEST RIGHT NOW</text>
      <text x="${widgetW - 200}" y="30" font-weight="500" font-size="32" fill="${palette.inkSoft}">14:00</text>

      ${[
        { rank: 1, name: 'Café Kiebêrt', area: 'Stadionbuurt', score: 95, c: palette.burnt },
        { rank: 2, name: 'Hannekes Boom', area: 'Centrum', score: 92, c: palette.burnt },
        { rank: 3, name: 'Pllek', area: 'Noord', score: 88, c: palette.orange },
      ].map((r, i) => `
        <g transform="translate(0, ${100 + i * 120})">
          <text font-weight="700" font-size="38" fill="${palette.inkSoft}">${r.rank}</text>
          <text x="55" y="0" font-family="Georgia, serif" font-weight="700" font-size="44" fill="${palette.ink}">${escape(r.name)}</text>
          <text x="55" y="42" font-size="30" fill="${palette.inkSoft}">${r.area}</text>
          <g transform="translate(${widgetW - 250}, -28)">
            <rect width="120" height="64" rx="32" fill="${r.c}"/>
            <text x="60" y="46" text-anchor="middle" font-weight="700" font-size="38" fill="${palette.white}">${r.score}</text>
          </g>
        </g>`).join('')}
    </g>

    <!-- Mock dock at the bottom -->
    <rect x="160" y="${H - 380}" width="${W - 320}" height="200" rx="40" fill="${palette.white}" opacity="0.4"/>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${DROP_SHADOW}</defs>
      <rect width="${W}" height="${H}" fill="${palette.sand}"/>
      ${statusBar()}
      ${headerBlock('On your home screen.', 'Top three sunny spots, always one glance away.')}
      ${inner}
    </svg>`;
}

// ─── Render ───────────────────────────────────────────────────────

async function renderShot(name: string, svg: string): Promise<void> {
  const outPath = join(OUT_DIR, name);
  // Density 144 (2× the default 72) gives sharp edges at 1290×2796
  // without the SVG render itself having to declare a higher viewBox.
  const buf = await sharp(Buffer.from(svg), { density: 144 })
    .resize(W, H, { fit: 'fill' })
    .png()
    .toBuffer();
  writeFileSync(outPath, buf);
  console.log(`  ${outPath.replace(ROOT, '.')}  (${W}×${H})`);
}

async function main(): Promise<void> {
  console.log(`Generating screenshots @ ${W}×${H} → ${OUT_DIR}`);
  await renderShot('01-hero.png', shot1Hero());
  await renderShot('02-map.png', shot2Map());
  await renderShot('03-time-scrubber.png', shot3TimeScrubber());
  await renderShot('04-match-filter.png', shot4Match());
  await renderShot('05-widget.png', shot5Widget());
  console.log('\nDone. Drag these into App Store Connect → Screenshots.');
}

void main();
