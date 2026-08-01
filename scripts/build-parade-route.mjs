// build-parade-route.mjs — generate an accurate, water-following Canal Parade
// route + nearby public toilets from OpenStreetMap (Overpass API).
//
// Why: the original PARADE_ROUTE in src/data/pride.ts was 16 hand-placed
// points; straight lines between them cut across quaysides. OSM waterway
// centerlines (waterway=canal/river) follow the actual water, so the rainbow
// polyline sits on the canal.
//
// Output: src/data/prideRouteGeo.json
//   { generated, route: [[lat,lng],...], toilets: [[lat,lng],...] }
//
// Run: node scripts/build-parade-route.mjs
// Same OSM dependency family as the Nominatim import path in the dataset
// pipeline; one bounded query, no API key.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'prideRouteGeo.json');

// Central-Amsterdam bbox (south,west,north,east) — covers the whole route.
const BBOX = '52.352,4.868,52.393,4.928';

// The 2026 parade waterways, in sailing order (pride.amsterdam):
// Oosterdok → Nieuwe Herengracht → Amstel → Prinsengracht → Westerdok.
const QUERY = `
[out:json][timeout:90];
(
  way["waterway"]["name"~"^(Amstel|Nieuwe Herengracht|Prinsengracht|Korte Prinsengracht|Schippersgracht)$"](${BBOX});
  node["amenity"="toilets"](${BBOX});
  way["amenity"="toilets"](${BBOX});
);
out geom;
`;

// Anchor points marking the junctions between route sections (from the
// original hand-placed route — good enough to FIND the junction vertex;
// the OSM geometry between anchors is what fixes the accuracy).
const OOSTERDOK = { lat: 52.3755, lng: 4.9075 };
// Straight lines are fine INSIDE basins (open water); the Oosterdok exit
// point aims the crossing at the Schippersgracht entrance.
const OOSTERDOK_MID = { lat: 52.3741, lng: 4.9099 };
const SGR_NORTH = { lat: 52.3729, lng: 4.9114 }; // Schippersgracht @ Prins Hendrikkade
const NH_JUNCTION = { lat: 52.37, lng: 4.9111 }; // Schippersgracht → Nieuwe Herengracht
const NH_AMSTEL = { lat: 52.3665, lng: 4.9035 }; // Nieuwe Herengracht → Amstel
const PG_CORNER = { lat: 52.3601, lng: 4.8993 }; // Amstel → Prinsengracht
const BROUWERS = { lat: 52.3803, lng: 4.8875 }; // Prinsengracht → Korte Prinsengracht
const WESTERDOK = { lat: 52.3845, lng: 4.8885 };

// Sections: [waterway name, from-anchor, to-anchor]
const SECTIONS = [
  ['Schippersgracht', SGR_NORTH, NH_JUNCTION],
  ['Nieuwe Herengracht', NH_JUNCTION, NH_AMSTEL],
  ['Amstel', NH_AMSTEL, PG_CORNER],
  ['Prinsengracht', PG_CORNER, BROUWERS],
  ['Korte Prinsengracht', BROUWERS, WESTERDOK],
];

const M_LAT = 110540;
const M_LNG = 111320 * Math.cos((52.36 * Math.PI) / 180);
const distM = (a, b) => {
  const dx = (a.lng - b.lng) * M_LNG;
  const dy = (a.lat - b.lat) * M_LAT;
  return Math.sqrt(dx * dx + dy * dy);
};
const key = (p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;

async function fetchOverpass() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass returns 406 for anonymous/default agents — identify per OSM policy.
      'User-Agent': 'Zonnie/1.4 (Amsterdam terrace app; parade-route build script; contact: zonnie.app)',
    },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Build a vertex graph {verts, adj} from one named waterway's ways. */
function buildNetwork(ways) {
  const verts = new Map(); // key -> {lat,lng}
  const adj = new Map(); // key -> [{k, w}]
  const addEdge = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!verts.has(ka)) verts.set(ka, a);
    if (!verts.has(kb)) verts.set(kb, b);
    const w = distM(a, b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push({ k: kb, w });
    adj.get(kb).push({ k: ka, w });
  };
  for (const way of ways) {
    const g = way.geometry ?? [];
    for (let i = 1; i < g.length; i++) {
      addEdge({ lat: g[i - 1].lat, lng: g[i - 1].lon }, { lat: g[i].lat, lng: g[i].lon });
    }
  }
  return { verts, adj };
}

function nearestVertex(net, p) {
  let best = null;
  let bestD = Infinity;
  for (const [k, v] of net.verts) {
    const d = distM(p, v);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Keys of the connected component containing `startKey` (BFS). */
function component(net, startKey) {
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const cur = queue.pop();
    for (const { k } of net.adj.get(cur) ?? []) {
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen;
}

/**
 * The vertex (limited to `fromKeys`) closest to ANY vertex of `toNet` —
 * i.e. where this section's reachable water actually meets the next
 * waterway. Junctions are derived from the data, not guessed: locks split
 * OSM waterways and canals meet a few metres from where a hand-placed
 * anchor assumes, and a wrong anchor drew the line across land.
 */
function junctionVertex(net, fromKeys, toNet) {
  let best = null;
  let bestD = Infinity;
  for (const k of fromKeys) {
    const v = net.verts.get(k);
    for (const [, w] of toNet.verts) {
      const d = distM(v, w);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return { key: best, gapM: bestD };
}

/** Shortest path between two vertex keys within one network (Dijkstra). */
function shortestPath(net, start, goal) {
  if (!start || !goal) return null;
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let cur = null;
    let curD = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < curD) {
        curD = d;
        cur = k;
      }
    }
    if (cur == null) return null; // disconnected
    if (cur === goal) break;
    done.add(cur);
    for (const { k, w } of net.adj.get(cur) ?? []) {
      const nd = curD + w;
      if (nd < (dist.get(k) ?? Infinity)) {
        dist.set(k, nd);
        prev.set(k, cur);
      }
    }
  }
  const path = [goal];
  while (path[0] !== start) path.unshift(prev.get(path[0]));
  return path.map((k) => net.verts.get(k));
}

function toiletPoint(el) {
  if (el.type === 'node') return { lat: el.lat, lng: el.lon };
  const g = el.geometry ?? [];
  if (g.length === 0) return null;
  const lat = g.reduce((s, p) => s + p.lat, 0) / g.length;
  const lng = g.reduce((s, p) => s + p.lon, 0) / g.length;
  return { lat, lng };
}

function distToRouteM(p, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const px = (p.lng - a.lng) * M_LNG;
    const py = (p.lat - a.lat) * M_LAT;
    const bx = (b.lng - a.lng) * M_LNG;
    const by = (b.lat - a.lat) * M_LAT;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
    const dx = px - t * bx;
    const dy = py - t * by;
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

const data = await fetchOverpass();
const els = data.elements ?? [];
const waterways = els.filter((e) => e.type === 'way' && e.tags?.waterway);
const toiletEls = els.filter((e) => e.tags?.amenity === 'toilets');
console.log(`Overpass: ${waterways.length} waterway ways, ${toiletEls.length} toilet elements`);

// Build each section's network; junctions between sections come from the
// data (closest vertex pair between adjacent networks), not hand anchors.
const nets = SECTIONS.map(([name, from, to]) => ({
  name,
  from,
  to,
  net: buildNetwork(waterways.filter((w) => w.tags.name === name)),
}));

const route = [{ ...OOSTERDOK }, { ...OOSTERDOK_MID }];
for (let i = 0; i < nets.length; i++) {
  const { name, from, to, net } = nets[i];
  if (net.verts.size === 0) {
    console.warn(`WARN: no OSM ways for "${name}" — using straight anchor line`);
    route.push({ ...from }, { ...to });
    continue;
  }
  // Entry: overall start anchor for the first section, else the vertex
  // closest to the previous route point (the previous section's exit).
  const prevPoint = route[route.length - 1];
  const entry = nearestVertex(net, i === 0 ? OOSTERDOK_MID : prevPoint);
  // Only water reachable from the entry counts — locks split networks, and
  // an unreachable "closest" vertex would send Dijkstra nowhere.
  const reachable = component(net, entry);
  // Exit: overall end anchor for the last section, else the reachable
  // vertex nearest the NEXT section's network.
  let exit;
  if (i === nets.length - 1) {
    let best = null;
    let bestD = Infinity;
    for (const k of reachable) {
      const d = distM(net.verts.get(k), WESTERDOK);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    exit = best;
  } else {
    const j = junctionVertex(net, reachable, nets[i + 1].net);
    exit = j.key;
    if (j.gapM > 60) {
      console.warn(`WARN: ${name} → ${nets[i + 1].name} junction gap is ${Math.round(j.gapM)} m`);
    }
  }
  const section = shortestPath(net, entry, exit);
  if (!section) {
    console.warn(`WARN: no connected path through "${name}" — using straight anchor line`);
    route.push({ ...from }, { ...to });
    continue;
  }
  console.log(`${name}: ${net.verts.size} vertices → ${section.length} route points`);
  route.push(...section);
}
route.push({ ...WESTERDOK });

// Drop consecutive near-duplicates (< 2 m apart) from section joints.
const cleaned = route.filter((p, i) => i === 0 || distM(p, route[i - 1]) > 2);

// Toilets within 200 m of the final route.
const toilets = toiletEls
  .map(toiletPoint)
  .filter(Boolean)
  .filter((p) => distToRouteM(p, cleaned) <= 200)
  .map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]);

const totalKm =
  cleaned.reduce((s, p, i) => (i === 0 ? 0 : s + distM(p, cleaned[i - 1])), 0) / 1000;
console.log(`Route: ${cleaned.length} points, ${totalKm.toFixed(2)} km; toilets ≤200m: ${toilets.length}`);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      source: 'OpenStreetMap via Overpass (waterway centerlines; amenity=toilets)',
      route: cleaned.map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
      toilets,
    },
    null,
    1,
  ),
);
console.log('wrote', OUT);
