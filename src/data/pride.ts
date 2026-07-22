/**
 * pride.ts — WorldPride Amsterdam 2026 seasonal layer.
 *
 * Second instance of the "seasonal moment" pattern (worldcup.ts is the
 * first): a date-gated, honestly-curated lens over the existing dataset.
 * The World Cup layer retires 2026-07-19; this one runs 25 Jul – 8 Aug.
 *
 * Curation here is COMPUTED, not editorial: a terrace is a "parade-view"
 * terrace when it sits within PARADE_VIEW_MAX_M of the Canal Parade route
 * (Oosterdok → Nieuwe Herengracht → Amstel → Prinsengracht → Westerdok,
 * per pride.amsterdam — Saturday 2026-08-01, 12:00–18:00). No venue is
 * claimed to host anything; the only claim is proximity, which we can
 * stand behind from coordinates alone.
 *
 * Everything is pure & date-string based so it unit-tests without mocks
 * and auto-retires after the window, same as the WC layer.
 */

import type { Terrace } from '@/src/engines/types';

// ── Window ────────────────────────────────────────────────────────────────────

/** WorldPride Amsterdam 2026 (source: pride.amsterdam). */
export const WORLDPRIDE_START = '2026-07-25';
export const WORLDPRIDE_END = '2026-08-08';
/** Canal Parade day — boats sail 12:00–18:00. */
export const CANAL_PARADE_DATE = '2026-08-01';

/** True while WorldPride runs (inclusive bounds). Lexicographic compare is
 *  safe on yyyy-MM-dd strings — same idiom as isWorldCupLive. */
export function isWorldPrideLive(dateStr: string): boolean {
  return dateStr >= WORLDPRIDE_START && dateStr <= WORLDPRIDE_END;
}

/** True during the teaser window (3 days before start, before it goes live). */
export function isWorldPrideTeaser(dateStr: string): boolean {
  const threeDAysBefore = '2026-07-22';
  return dateStr >= threeDAysBefore && dateStr < WORLDPRIDE_START;
}

export function isCanalParadeDay(dateStr: string): boolean {
  return dateStr === CANAL_PARADE_DATE;
}

// ── Parade route ──────────────────────────────────────────────────────────────

/**
 * The 2026 route as a polyline: Oosterdok → Nieuwe Herengracht → Amstel →
 * Prinsengracht (the long stretch) → Westerdok. Points are hand-placed on
 * the waterways at recognisable bridges/junctions; segment interpolation
 * covers the bends well within the proximity threshold's tolerance.
 */
export const PARADE_ROUTE: readonly { lat: number; lng: number }[] = [
  { lat: 52.3755, lng: 4.9075 }, // Oosterdok
  { lat: 52.3710, lng: 4.9093 }, // Nieuwe Herengracht (north end)
  { lat: 52.3665, lng: 4.9035 }, // Nieuwe Herengracht → Amstel (Hermitage)
  { lat: 52.3655, lng: 4.9021 }, // Amstel at Blauwbrug
  { lat: 52.3637, lng: 4.9019 }, // Amstel at Magere Brug
  { lat: 52.3601, lng: 4.8993 }, // Amstel → Prinsengracht corner
  { lat: 52.3610, lng: 4.8940 }, // Prinsengracht x Utrechtsestraat
  { lat: 52.3618, lng: 4.8892 }, // Prinsengracht x Vijzelgracht
  { lat: 52.3628, lng: 4.8865 }, // Prinsengracht x Spiegelgracht
  { lat: 52.3640, lng: 4.8835 }, // Prinsengracht x Leidsestraat
  { lat: 52.3665, lng: 4.8820 }, // Prinsengracht x Leidsegracht
  { lat: 52.3693, lng: 4.8818 }, // Prinsengracht x Elandsgracht
  { lat: 52.3752, lng: 4.8837 }, // Prinsengracht at Westermarkt
  { lat: 52.3785, lng: 4.8860 }, // Prinsengracht x Prinsenstraat
  { lat: 52.3803, lng: 4.8875 }, // Prinsengracht x Brouwersgracht
  { lat: 52.3845, lng: 4.8885 }, // Westerdok
];

/** A terrace "sees" the parade within this straight-line distance of the
 *  route. ~130m ≈ a short block from the quay — close enough to wander
 *  over with a drink, honest enough not to oversell. */
export const PARADE_VIEW_MAX_M = 130;

const M_LAT = 110540;
const M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);

/** Distance from a point to a segment, in metres (equirectangular). */
function distToSegmentM(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const px = (p.lng - a.lng) * M_LNG;
  const py = (p.lat - a.lat) * M_LAT;
  const bx = (b.lng - a.lng) * M_LNG;
  const by = (b.lat - a.lat) * M_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
  const dx = px - t * bx;
  const dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Straight-line distance from a coordinate to the parade route, metres. */
export function distanceToParadeRouteM(lat: number, lng: number): number {
  let best = Infinity;
  for (let i = 0; i < PARADE_ROUTE.length - 1; i++) {
    const d = distToSegmentM({ lat, lng }, PARADE_ROUTE[i]!, PARADE_ROUTE[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

// Per-terrace verdicts never change at runtime (coords are static), so the
// polyline walk runs once per terrace across the whole app session.
const paradeViewCache = new Map<number, boolean>();

/** True when the terrace sits within parade-view distance of the route. */
export function isParadeViewTerrace(t: Terrace): boolean {
  const cached = paradeViewCache.get(t.id);
  if (cached != null) return cached;
  const result = distanceToParadeRouteM(t.lat, t.lng) <= PARADE_VIEW_MAX_M;
  paradeViewCache.set(t.id, result);
  return result;
}

/** How many of the given terraces are parade-view (for spotlight copy). */
export function countParadeViewTerraces(terraces: readonly Terrace[]): number {
  let n = 0;
  for (const t of terraces) if (isParadeViewTerrace(t)) n++;
  return n;
}
