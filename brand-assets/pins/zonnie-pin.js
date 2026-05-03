/**
 * ZONNIE — Map pin generator
 *
 * Generates an SVG marker icon for a given sun score.
 * Drop-in replacement for the existing `mkIcon()` in public/index.html
 *
 * USAGE (Leaflet):
 *   import { zonniePinIcon } from './zonnie-pin.js';
 *   const marker = L.marker([lat, lng], { icon: zonniePinIcon(score, isSelected) });
 *
 * USAGE (vanilla SVG string):
 *   element.innerHTML = zonniePinSvg(score, isSelected);
 *
 * STATES (by score 0..1):
 *   > 0.7   full sun     #D9633E (terracotta)
 *   > 0.5   mostly sunny #E89C5A (peach)
 *   > 0.3   partial sun  #F4D58D (mustard)
 *   ≤ 0.3   shade        #7A2E14 (cocoa)
 *   selected (any score) #FBA85A + cream halo + ink outline
 *
 * GEOMETRY:
 *   - 40x44 viewBox, anchor at (20, 28)
 *   - 16° sharp italic T (skewX(-16))
 *   - Sun disc with 5 rays, 16px above the cap
 *   - All strokes 1px ink (#2a1f15) — no maps, no shadows, scales clean
 */

const COLORS = {
  ink: '#2a1f15',
  fullSun: '#D9633E',
  mostlySunny: '#E89C5A',
  partialSun: '#F4D58D',
  shade: '#7A2E14',
  selected: '#FBA85A',
  haloOuter: '#FBA85A',
  haloInner: '#FFE5C2',
};

/**
 * Pick the right T fill colour for a sun score.
 */
function fillForScore(score) {
  if (score > 0.7) return COLORS.fullSun;
  if (score > 0.5) return COLORS.mostlySunny;
  if (score > 0.3) return COLORS.partialSun;
  return COLORS.shade;
}

/**
 * The shared sun-disc-on-top markup (5 rays, hollow disc, ink stroke).
 */
function sunOnTopSvg({ strokeWidth = 1.0, sunStrokeWidth = 1.2 } = {}) {
  return `
    <circle cx="4" cy="-12" r="3" fill="none" stroke="${COLORS.ink}" stroke-width="${sunStrokeWidth}"/>
    <g stroke="${COLORS.ink}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none">
      <line x1="-5" y1="-12" x2="-3" y2="-12"/>
      <line x1="13" y1="-12" x2="11" y2="-12"/>
      <line x1="4" y1="-20" x2="4" y2="-18"/>
      <line x1="-2" y1="-18" x2="-1" y2="-17"/>
      <line x1="10" y1="-18" x2="9" y2="-17"/>
    </g>`;
}

/**
 * The italic T body (skewX -16°).
 * `outline` controls whether to draw a 0.5–0.8px ink stroke around the T
 * (used for partial sun where the mustard fill is too pale to read on light tiles).
 */
function italicTSvg(fill, { outline = false, strokeWidth = 0.5 } = {}) {
  const stroke = outline ? `stroke="${COLORS.ink}" stroke-width="${strokeWidth}"` : 'stroke="none"';
  return `
    <g transform="skewX(-16)" fill="${fill}" ${stroke}>
      <rect x="-13" y="-1" width="26" height="4"/>
      <rect x="-2" y="-1" width="4" height="29"/>
    </g>`;
}

/**
 * Build a full SVG string for the marker.
 * @param {number} score   0..1 sun score
 * @param {boolean} isSelected   whether the marker is the active selection
 * @returns {string}  Complete <svg>...</svg> string, ready to inject as innerHTML.
 */
export function zonniePinSvg(score, isSelected = false) {
  const fill = isSelected ? COLORS.selected : fillForScore(score);
  const needsOutline = !isSelected && score > 0.3 && score <= 0.5;
  const halo = isSelected
    ? `<ellipse cx="0" cy="6" rx="22" ry="22" fill="${COLORS.haloOuter}" opacity="0.20"/>
       <ellipse cx="0" cy="6" rx="16" ry="16" fill="${COLORS.haloInner}" opacity="0.55"/>`
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -28 40 56" width="40" height="56">
      <g>
        ${halo}
        ${sunOnTopSvg({
          strokeWidth: isSelected ? 1.2 : 1.0,
          sunStrokeWidth: isSelected ? 1.4 : 1.2,
        })}
        ${italicTSvg(fill, { outline: needsOutline || isSelected, strokeWidth: isSelected ? 0.8 : 0.5 })}
      </g>
    </svg>`;
}

/**
 * Leaflet divIcon factory. Same args as zonniePinSvg.
 * Anchor is set so the BASE of the T descender sits on the lat/lng point.
 */
export function zonniePinIcon(score, isSelected = false) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not loaded.');
  }
  return L.divIcon({
    className: 'zonnie-pin' + (isSelected ? ' zonnie-pin--selected' : ''),
    html: zonniePinSvg(score, isSelected),
    iconSize: [40, 56],
    iconAnchor: [20, 56],   // base of the T sits on the coordinate
    popupAnchor: [0, -50],
  });
}

/**
 * Optional CSS to add to your stylesheet for hover lift + focus ring.
 *
 *   .zonnie-pin { transition: transform 0.15s ease; cursor: pointer; }
 *   .zonnie-pin:hover { transform: translateY(-2px); }
 *   .zonnie-pin--selected { z-index: 1000 !important; }
 */
