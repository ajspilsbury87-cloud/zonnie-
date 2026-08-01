// fetch-basemap.mjs — pull real central-Amsterdam geometry (canal network,
// water bodies, parks) from OSM for use as a basemap behind marketing map
// cards. Marketing-only: output lives in marketing/data/, NOT src/data/, so
// none of it ships in the app bundle.
//
// Run: node scripts/marketing/fetch-basemap.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'marketing', 'data');
const OUT = path.join(OUT_DIR, 'amsterdam-basemap.json');

// Slightly wider than the parade route so the card has context around it.
const BBOX = '52.348,4.862,52.398,4.935';

const QUERY = `
[out:json][timeout:120];
(
  way["waterway"~"^(canal|river)$"](${BBOX});
  way["natural"="water"](${BBOX});
  way["leisure"="park"](${BBOX});
  way["highway"~"^(primary|secondary|tertiary)$"](${BBOX});
);
out geom;
`;

async function overpass() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Zonnie/1.4 (Amsterdam terrace app; marketing basemap script; contact: zonnie.app)',
    },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const r = (n) => Number(n.toFixed(5));
const line = (el) => (el.geometry ?? []).map((p) => [r(p.lat), r(p.lon)]);

/** Drop near-collinear points — keeps files small without visible loss. */
function simplify(pts, tolDeg = 0.00004) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ay, ax] = out[out.length - 1];
    const [by, bx] = pts[i];
    const [cy, cx] = pts[i + 1];
    // Perpendicular distance of b from line a→c (degrees; good enough here).
    const dx = cx - ax;
    const dy = cy - ay;
    const len = Math.hypot(dx, dy);
    const d = len === 0 ? Math.hypot(bx - ax, by - ay) : Math.abs(dy * bx - dx * by + cx * ay - cy * ax) / len;
    if (d > tolDeg) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const data = await overpass();
const els = data.elements ?? [];

const canals = [];
const water = [];
const parks = [];
const roads = [];

for (const el of els) {
  const pts = simplify(line(el));
  if (pts.length < 2) continue;
  const tags = el.tags ?? {};
  if (tags.waterway) canals.push(pts);
  else if (tags.natural === 'water') water.push(pts);
  else if (tags.leisure === 'park') parks.push(pts);
  else if (tags.highway) roads.push(pts);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    generated: new Date().toISOString(),
    source: 'OpenStreetMap via Overpass API (© OpenStreetMap contributors, ODbL)',
    bbox: BBOX,
    canals,
    water,
    parks,
    roads,
  }),
);
console.log(
  `canals ${canals.length}, water ${water.length}, parks ${parks.length}, roads ${roads.length} → ${OUT}`,
);
