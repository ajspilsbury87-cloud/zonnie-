# Asset Specifications

Detailed measurements and rendering notes for reproducing or modifying the Zonnie visual assets.

---

## App Icon (`zonnie-icon-1024.svg`)

### Canvas
- 1024 × 1024 px
- iOS corner radius: 229px (22.37% — squircle ratio)
- For Android adaptive icon: render to 1024×1024 square, no mask (let launcher handle)

### Layer stack (top to bottom in SVG = back to front visually)

| Element | Coords | Fill | Notes |
|---|---|---|---|
| Sky band | x:0 y:0 w:1024 h:1024 | `#F4D58D` | mustard, full canvas |
| Horizon overlay | x:0 y:512 w:1024 h:512 | `#E89C5A` | peach, bottom half |
| Mid-ground band | x:0 y:682 w:1024 h:342 | `#D9633E` | burnt orange |
| Foreground band | x:0 y:836 w:1024 h:188 | `#B14222` | terracotta |
| Cocoa ground | x:0 y:939 w:1024 h:85 | `#7A2E14` | very bottom |
| Sun disc (outer) | cx:512 cy:528 r:188 | `#FBA85A` | peach |
| Sun disc (inner) | cx:512 cy:528 r:120 | `#FFE5C2` | cream |
| Shimmer stripe 1 | x:0 y:580 w:1024 h:22 | `#FFE5C2` | cream |
| Shimmer stripe 2 | x:0 y:630 w:1024 h:14 | `#FFE5C2` | cream |
| Shimmer stripe 3 | x:0 y:668 w:1024 h:9 | `#FFE5C2` 70% | fading shimmer |

### Composition logic
- Sun centred horizontally, sitting at the visual horizon
- Horizon line at y=512 (exactly half) — the sun "sets" through it
- Each band gets shorter as it goes down (sky 50% → horizon 17% → mid 15% → foreground 10% → cocoa 8%) for natural sunset perspective
- Shimmer stripes only cross the lower half of the sun disc, suggesting heat/water reflection

### Required raster exports

**iOS:**
| Size | Use |
|---|---|
| 1024 | App Store master |
| 180 | iPhone Home (3x) |
| 167 | iPad Pro Home |
| 152 | iPad Home |
| 120 | iPhone Spotlight (3x) |
| 87 | iPhone Settings (3x) |
| 80 | Spotlight (2x) |
| 76 | iPad |
| 60 | iPhone notification (3x = 180; 2x = 120) |
| 58 | Settings (2x) |
| 40 | Spotlight |
| 29 | Settings |
| 20 | Notifications |

**Web / PWA:**
| Size | File |
|---|---|
| 192 | `icon-192.png` (manifest) |
| 512 | `icon-512.png` (manifest) |
| 32 | `favicon-32.png` |
| 16 | `favicon-16.png` |
| svg | `favicon.svg` (use 1024 master) |

---

## Map Pin (`zonnie-pin.js`)

### Glyph geometry

- **viewBox:** `-20 -28 40 56`
- **Render size:** 40 × 56 px
- **Anchor:** (0, 0) is centred on the cap of the T; the lat/lng coordinate sits at (0, 28) — the base of the descender

### T construction
- 16° italic skew (`transform="skewX(-16)"`)
- Cap: `<rect x="-13" y="-1" width="26" height="4">`
- Stem: `<rect x="-2" y="-1" width="4" height="29">`
- The cap and stem visually merge — no gap, single continuous form

### Sun disc (above the cap)
- Disc: `<circle cx="4" cy="-12" r="3">` — hollow, 1.2px ink stroke
- 5 rays: 4 short + 1 long centre, each as a 1px line
- Why offset cx=4? It visually centres over the leaning T's cap (the cap's centroid shifts right under italic skew)

### State rules

```
score > 0.7  →  T fill = #D9633E  (no outline)
score > 0.5  →  T fill = #E89C5A  (no outline)
score > 0.3  →  T fill = #F4D58D  + 0.5px ink outline
score ≤ 0.3  →  T fill = #7A2E14  (no outline)
selected     →  T fill = #FBA85A  + 0.8px ink outline + halo + scaled rays
```

### Selected state extras
- Outer halo: `<ellipse cx="0" cy="6" rx="22" ry="22" fill="#FBA85A" opacity="0.20">`
- Inner halo: `<ellipse cx="0" cy="6" rx="16" ry="16" fill="#FFE5C2" opacity="0.55">`
- Sun stroke widens to 1.4px
- T outline widens to 0.8px

### Why fine-line, not filled?

The pin sits on top of map tiles. A heavy filled marker fights with the cartography for attention. A fine-line letterform reads *as a piece of typography* on the map, rather than as a generic pin — which fits Zonnie's editorial brand voice. The T fill colour does the heavy lifting for sun-state communication.

### Accessibility
- All states differ in lightness as well as hue (full sun = darkest orange, shade = darkest brown), so colour-blind users can still distinguish states by tone
- The selected halo provides a non-colour cue for the active marker
- Recommend pairing with the popup score percentage for full clarity

---

## Brand colour tokens (CSS custom properties)

Recommended naming convention for the codebase:

```css
:root {
  /* Surface */
  --color-cream: #FFE5C2;
  --color-mustard: #F4D58D;
  --color-peach-light: #FBA85A;

  /* Sun states */
  --color-sun-full: #D9633E;
  --color-sun-mostly: #E89C5A;
  --color-sun-partial: #F4D58D;
  --color-shade: #7A2E14;
  --color-selected: #FBA85A;

  /* Structure */
  --color-terracotta: #B14222;
  --color-cocoa: #7A2E14;
  --color-ink: #2A1F15;
}
```

---

## Animation hooks (future)

For the native iOS port or v2 of the web app, these animations are designed-in:

| Trigger | Animation |
|---|---|
| App launch | Sun disc rises from below the bottom edge into position (0.6s ease-out) |
| Pin appears | Scale from 0.8 to 1.0, opacity 0 to 1 (0.2s ease-out, staggered by lat) |
| Pin selected | Halo fades in, T scales 1.0 to 1.1 (0.15s ease-out) |
| Time slider drag | Pin colours interpolate smoothly between states (no flicker) |
| Day animation play | Sun disc slowly rotates (purely decorative, 60s loop) |

Keep these as stretch goals — none are required for v1 launch.
