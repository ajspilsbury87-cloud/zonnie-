# Zonnie — Visual Identity Handover

**For:** the developer / coding agent integrating these into the Zonnie web app and any future native ports.

---

## What's in this folder

```
zonnie-assets-handover/
├── README.md                          ← you are here
├── icons/
│   ├── zonnie-icon-1024.svg           App icon, 1024×1024, with iOS corner mask
│   └── zonnie-icon-square-1024.svg    Same artwork, square (no corner mask)
├── pins/
│   ├── zonnie-pin-states.svg          All 5 marker states laid out side by side
│   └── zonnie-pin.js                  Drop-in JS module (Leaflet divIcon factory)
└── docs/
    └── ASSET-SPECS.md                 Detailed specs (this is for reference)
```

---

## The two assets

### 1 · App icon — sunset stripes (Concept 1)

A 70s travel-poster sunset. Sun setting through layered horizon bands of mustard, peach, burnt orange, terracotta, and cocoa, with cream "heat-shimmer" stripes across the disc.

**No letterforms — just the iconic mark.** Scales beautifully from 1024px down to 40px, instantly recognisable, and works at any size on Home screen, share sheet, App Store, splash screen.

### 2 · Map pin — italic T with sun on top (16° sharp slant)

Fine-line drawing. A 16° italic T below a small hollow sun disc with five rays. The T's fill colour changes by sun score. The sun and rays stay ink-coloured at all times (so the marker is recognisable even in dim states).

**Five states:**

| State | T fill | Notes |
|---|---|---|
| Full sun (score > 0.7) | `#D9633E` terracotta | brightest |
| Mostly sunny (> 0.5) | `#E89C5A` peach | |
| Partial sun (> 0.3) | `#F4D58D` mustard | thin ink outline added (mustard is too pale to read on light tiles) |
| Shade (≤ 0.3) | `#7A2E14` cocoa | |
| Selected | `#FBA85A` orange | scaled up, cream halo behind, thicker stroke |

---

## How to integrate

### App icon

1. Drop `zonnie-icon-1024.svg` into the project at `public/assets/zonnie-icon-1024.svg`
2. Generate the iOS app icon set from the master:
   ```bash
   # Using imagemagick or an online generator like appicon.co
   # Sizes needed: 20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024 (App Store)
   ```
3. For the web app favicon and PWA manifest:
   ```html
   <link rel="apple-touch-icon" href="/assets/zonnie-icon-180.png">
   <link rel="icon" type="image/svg+xml" href="/assets/zonnie-icon-1024.svg">
   ```
4. Update the welcome modal in `public/index.html` — the brand-icon SVG block currently shows a generic sun. Swap it for an inline version of the icon (or load the SVG via `<img>`).

### Map pin

The drop-in module `pins/zonnie-pin.js` is a direct replacement for the existing `mkIcon()` function in `public/index.html`.

**Step 1.** Copy `zonnie-pin.js` into the project at `public/zonnie-pin.js`.

**Step 2.** In `public/index.html`, find the existing `mkIcon` function (it currently builds an SVG with a coloured disc) and replace it with:

```javascript
// Top of <script> block, after Leaflet is loaded
import { zonniePinIcon } from './zonnie-pin.js';
// (or paste the contents of zonnie-pin.js inline if using ES modules isn't set up)

function mkIcon(score, verified, isSelected = false) {
  return zonniePinIcon(score, isSelected);
}
```

**Step 3.** Where the existing code calls `m.setIcon(mkIcon(r.sc, r.verified))`, also pass the selected state:

```javascript
S.res.forEach(r => {
  const m = mk[r.id];
  if (m) m.setIcon(mkIcon(r.sc, r.verified, S.sel === r.id));
});
```

**Step 4.** Add this CSS to the existing `<style>` block for hover behaviour:

```css
.zonnie-pin { transition: transform 0.15s ease; cursor: pointer; }
.zonnie-pin:hover { transform: translateY(-2px); }
.zonnie-pin--selected { z-index: 1000 !important; }
```

**Step 5.** The existing `verified` parameter no longer changes the visual — all pins look the same regardless of verification status. (The verified/estimated distinction is still shown in the popup and sidebar.) If you want a visual distinction on the map, the cleanest option is to render unverified pins at 80% opacity:

```javascript
// Inside zonniePinSvg, wrap the inner <g> with opacity if desired:
<g style="opacity: ${verified ? 1 : 0.8}">
```

---

## Palette reference

For any further design work, here's the palette in one place:

```css
/* 70s sunset palette */
--mustard:    #F4D58D;
--peach:      #FBA85A;   /* (also "selected" pin fill) */
--orange:     #E89C5A;   /* (mostly sunny pin) */
--burnt:      #D9633E;   /* (full sun pin) */
--terracotta: #B14222;   /* (icon foreground band) */
--cocoa:      #7A2E14;   /* (shade pin / icon ground) */
--cream:      #FFE5C2;   /* (sun glow / halo) */
--ink:        #2A1F15;   /* (all pin strokes) */
```

---

## Design rationale (one paragraph for the agent)

The icon and pin share a 70s sunset palette but use different visual languages on purpose. The icon is bold and graphic — pure colour blocks at large size — so it reads instantly on a Home screen amongst a hundred other apps. The pin is fine-line and detailed — minimal stroke, no fills behind the letterform — so it sits on top of dense map tiles without competing with the underlying cartography. The italic T does double duty: it's clearly a letter (so the brand identity locks in) and it leans like a person reclining on a sun lounger, which is on-message for a sun-prediction app.

---

## What's still needed (not in this handover)

- Raster exports of the icon at all iOS sizes (use a generator script)
- Adaptive icon foreground/background separation for Android
- App Store screenshots
- Marketing splash variants
- An animated "boot" version of the icon (sun rising into place) — nice-to-have
