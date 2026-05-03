"""
╔══════════════════════════════════════════════════════════════════════╗
║  ZONNIE — 3D BAG Building Fetcher                                   ║
║  Replaces procedurally generated buildings with real Amsterdam data  ║
╚══════════════════════════════════════════════════════════════════════╝

Queries the Dutch 3D BAG OGC API for every building within 200m of any
terrace, then writes src/data/buildings.json for the shadow engine.

API notes (discovered via diagnostic):
  - storageCrs: EPSG:7415 (3D RD New). bbox must be in RD metres.
  - f=json causes HTTP 400 — use Accept header, never the f param.
  - Response format is CityJSON Features (not GeoJSON). Geometry is
    stored as indexed vertices: feature["vertices"][[x,y,z], ...] and
    boundaries contain integer indices into that array.
  - Coordinates are raw integers; apply feature["transform"] if present.

USAGE (PowerShell from the SunBae folder):
    python scripts/fetch-3dbag-buildings.py --dry-run
    python scripts/fetch-3dbag-buildings.py

OUTPUT:
    src/data/buildings.json   — array of { lat, lng, height, width }

COST: Free. 3D BAG is a public Dutch government dataset, no API key needed.
"""

import json, math, time, sys, argparse
import urllib.request

# ── Paths ─────────────────────────────────────────────────────────────────────
TERRACES_PATH = "src/data/terraces.json"
OUTPUT_PATH   = "src/data/buildings.json"

# ── 3D BAG OGC API ────────────────────────────────────────────────────────────
API_BASE = "https://api.3dbag.nl/collections/pand/items"

# Shadow engine checks up to 200m; fetch 220m for margin.
FETCH_RADIUS_M = 220

# Tile size in RD metres (~2 km × 2 km, well under the API's feature limit).
TILE_SIZE_M = 2000

REQUEST_DELAY = 0.3   # seconds between requests
MAX_RETRIES   = 3

# Approximate scale factors at Amsterdam latitude (for dist_m filter only)
M_PER_DEG_LAT = 110540
M_PER_DEG_LNG = 111320 * math.cos(52.37 * math.pi / 180)   # ≈ 67 672


# ── WGS84 ↔ RD New (EPSG:28992) conversion ───────────────────────────────────
# RDNAPTRANS polynomial, accurate to ~1 m.
# Source: Dutch Kadaster documentation.

_PHI0, _LAM0 = 52.15517440, 5.38720621
_X0,   _Y0   = 155000.0,    463000.0

_KP  = [0, 2, 0, 2, 0, 2, 1, 4, 2, 4, 1]
_KQ  = [1, 0, 2, 1, 3, 2, 0, 0, 3, 1, 1]
_KPQ = [190094.945, -11832.228, -114.221, -32.391, -0.705,
        -2.340, -0.608, -0.008, 0.148, 0.022, -0.022]

_LP  = [1, 0, 2, 1, 3, 0, 3, 1, 0, 2, 4]
_LQ  = [0, 2, 0, 2, 0, 1, 1, 4, 4, 3, 0]
_LPQ = [309056.544, 3638.893, 73.077, -157.984, 59.788,
        0.433, -6.439, -0.032, 0.092, -0.054, 0.054]

def wgs84_to_rd(lat: float, lng: float) -> tuple[float, float]:
    dphi = 0.36 * (lat - _PHI0)
    dlam = 0.36 * (lng - _LAM0)
    x = _X0 + sum(_KPQ[i] * dphi**_KP[i] * dlam**_KQ[i] for i in range(len(_KPQ)))
    y = _Y0 + sum(_LPQ[i] * dphi**_LP[i] * dlam**_LQ[i] for i in range(len(_LPQ)))
    return x, y

def rd_to_wgs84(x: float, y: float) -> tuple[float, float]:
    dx = (x - _X0) * 1e-5
    dy = (y - _Y0) * 1e-5
    Rp  = [0, 1, 2, 0, 1, 3, 1, 0, 2]
    Rq  = [1, 1, 1, 3, 0, 1, 3, 5, 3]
    Rpq = [3235.65389, -32.58297, -0.24750, -0.84978, -0.06550,
           -0.01709, -0.00738, 0.00530, -0.00039]
    Sp  = [1, 0, 2, 1, 3, 0, 2, 1, 0, 1]
    Sq  = [0, 2, 0, 2, 0, 2, 2, 0, 4, 4]
    Spq = [5260.52916, 105.94684, 2.45656, -0.81885, 0.05594,
           -0.05607, 0.01199, -0.00256, 0.00128, 0.00022]
    dphi = sum(Rpq[i] * dx**Rp[i] * dy**Rq[i] for i in range(len(Rpq))) / 3600
    dlam = sum(Spq[i] * dx**Sp[i] * dy**Sq[i] for i in range(len(Spq))) / 3600
    return _PHI0 + dphi, _LAM0 + dlam


# ── Distance helper ───────────────────────────────────────────────────────────

def dist_m(lat1, lng1, lat2, lng2) -> float:
    dx = (lng2 - lng1) * M_PER_DEG_LNG
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    return math.sqrt(dx * dx + dy * dy)


# ── CityJSON vertex index collector ──────────────────────────────────────────

def _collect_indices(boundaries, out: set) -> None:
    """Recursively walk CityJSON boundaries and collect all vertex indices."""
    if isinstance(boundaries, int):
        out.add(boundaries)
    elif isinstance(boundaries, list):
        for item in boundaries:
            _collect_indices(item, out)


# ── 3D BAG fetcher ────────────────────────────────────────────────────────────

def fetch_tile_rd(min_x: float, min_y: float, max_x: float, max_y: float) -> list:
    """
    Fetch pand features for an RD New bounding box.
    Returns list of CityJSON Feature dicts (may be empty on error).

    Key: no &f=json — the API rejects it. Format is controlled by Accept header.
    """
    url = (
        f"{API_BASE}"
        f"?bbox={min_x:.0f},{min_y:.0f},{max_x:.0f},{max_y:.0f}"
        f"&limit=500"
    )

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/geo+json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                features = data.get("features") or []
                if len(features) >= 500:
                    print(f"\n  ⚠ Tile hit 500-feature limit — some buildings may be missing.")
                return features
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:300]
            print(f"\n  HTTP {e.code} on attempt {attempt}: {body}")
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
        except Exception as e:
            print(f"\n  Error on attempt {attempt}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)

    return []


def extract_building(feature: dict) -> dict | None:
    """
    Parse a 3D BAG CityJSON Feature → { lat, lng, height, width } or None.

    The API returns CityJSON Features format (not GeoJSON). Each feature has:
      feature["CityObjects"]  — dict of building objects keyed by BAG id
      feature["vertices"]     — [[x, y, z], ...] in RD New metres (EPSG:7415)
      feature["transform"]    — optional { scale, translate } for compressed coords

    Geometry boundaries contain integer indices into feature["vertices"].
    """
    city_objects = feature.get("CityObjects") or {}
    raw_vertices = feature.get("vertices") or []

    if not city_objects or not raw_vertices:
        return None

    # Apply CityJSON transform if present (coordinates may be scaled integers)
    transform = feature.get("transform") or {}
    scale     = transform.get("scale",     [1.0, 1.0, 1.0])
    translate = transform.get("translate", [0.0, 0.0, 0.0])

    def to_rd(v):
        return (v[0] * scale[0] + translate[0],
                v[1] * scale[1] + translate[1])

    vertices_rd = [to_rd(v) for v in raw_vertices]

    # Find the root building object (no "parents" key = top-level building)
    main_obj = None
    for obj in city_objects.values():
        if not obj.get("parents"):
            main_obj = obj
            break
    if main_obj is None:
        main_obj = next(iter(city_objects.values()))

    # Height: 50th-percentile roof height above NAP
    attrs  = main_obj.get("attributes") or {}
    height = attrs.get("b3_h_dak_50p") or attrs.get("h_dak_50p")
    if not height or float(height) <= 0:
        return None

    # Collect all vertex indices used by this object's geometries
    idx_set: set[int] = set()
    for geom in (main_obj.get("geometry") or []):
        _collect_indices(geom.get("boundaries") or [], idx_set)

    if not idx_set:
        return None

    # Look up RD coordinates for those indices
    coords = [vertices_rd[i] for i in idx_set if i < len(vertices_rd)]
    if not coords:
        return None

    # Centroid in RD → WGS84
    cx = sum(c[0] for c in coords) / len(coords)
    cy = sum(c[1] for c in coords) / len(coords)
    lat, lng = rd_to_wgs84(cx, cy)

    # Footprint width: shorter axis of bounding box (metres, RD is metric)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    width = max(5.0, min(60.0, min(max(xs) - min(xs), max(ys) - min(ys))))

    return {
        "lat":    round(lat, 6),
        "lng":    round(lng, 6),
        "height": round(float(height), 1),
        "width":  round(width, 1),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def debug_feature_structure():
    """Fetch one feature and print its raw structure so we can verify parsing."""
    print("── Debug: fetching 1 feature to inspect structure ──")
    # Leidseplein area in RD metres
    url = f"{API_BASE}?bbox=119000,487000,120000,488000&limit=1"
    req = urllib.request.Request(url, headers={"Accept": "application/geo+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    features = data.get("features") or []
    if not features:
        print("  No features returned.")
        return

    feat = features[0]
    print(f"\nFeature top-level keys: {list(feat.keys())}")
    print(f"Transform:              {feat.get('transform')}")
    verts = feat.get("vertices") or []
    print(f"Vertex count:           {len(verts)}")
    print(f"First 3 vertices:       {verts[:3]}")

    city_objects = feat.get("CityObjects") or {}
    print(f"\nCityObjects count:      {len(city_objects)}")
    for obj_id, obj in city_objects.items():
        print(f"\n  Object: {obj_id}")
        print(f"  Keys:   {list(obj.keys())}")
        print(f"  Parents: {obj.get('parents')}")
        attrs = obj.get("attributes") or {}
        print(f"  b3_h_dak_50p: {attrs.get('b3_h_dak_50p')}")
        geoms = obj.get("geometry") or []
        print(f"  Geometry count: {len(geoms)}")
        for g in geoms[:2]:
            b = g.get("boundaries") or []
            print(f"    lod={g.get('lod')}  type={g.get('type')}  boundaries[:1]={str(b)[:80]}")

    # Attempt to parse the building and show result
    b = extract_building(feat)
    print(f"\nParsed building: {b}")
    if b:
        print(f"  → RD centroid approx: {wgs84_to_rd(b['lat'], b['lng'])}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--debug",    action="store_true", help="Inspect raw API response for one feature and exit")
    parser.add_argument("--max-dist", type=float, default=FETCH_RADIUS_M)
    args = parser.parse_args()
    radius = args.max_dist

    if args.debug:
        debug_feature_structure()
        return

    print(f"📂 Reading {TERRACES_PATH}...")
    try:
        with open(TERRACES_PATH, encoding="utf-8") as f:
            terraces = json.load(f)
    except FileNotFoundError:
        print("  ✗ terraces.json not found — run from the SunBae project root.")
        sys.exit(1)
    print(f"  {len(terraces)} terraces loaded.")

    # Build tile grid in RD metres
    tile_set: set[tuple[float, float]] = set()
    for t in terraces:
        cx, cy = wgs84_to_rd(t["lat"], t["lng"])
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                tx = math.floor((cx + dx * radius) / TILE_SIZE_M) * TILE_SIZE_M
                ty = math.floor((cy + dy * radius) / TILE_SIZE_M) * TILE_SIZE_M
                tile_set.add((tx, ty))

    tiles = sorted(tile_set)
    print(f"  {len(tiles)} tiles to fetch ({TILE_SIZE_M:.0f}m × {TILE_SIZE_M:.0f}m each).")

    if args.dry_run:
        print("\nDRY-RUN — would fetch the above tiles, no file written.")
        print("Remove --dry-run to proceed.")
        return

    # Fetch all tiles
    all_buildings: dict[tuple, dict] = {}

    for i, (tx, ty) in enumerate(tiles):
        tag = f"[{i+1:2}/{len(tiles)}]"
        lat_sw, lng_sw = rd_to_wgs84(tx, ty)
        lat_ne, lng_ne = rd_to_wgs84(tx + TILE_SIZE_M, ty + TILE_SIZE_M)
        print(f"  {tag} {lat_sw:.3f},{lng_sw:.3f} → {lat_ne:.3f},{lng_ne:.3f} ...", end=" ", flush=True)

        features = fetch_tile_rd(tx, ty, tx + TILE_SIZE_M, ty + TILE_SIZE_M)
        count = 0
        for feat in features:
            b = extract_building(feat)
            if b is None:
                continue
            key = (b["lat"], b["lng"])
            if key not in all_buildings:
                all_buildings[key] = b
                count += 1
        print(f"{len(features)} features → {count} buildings parsed")

        time.sleep(REQUEST_DELAY)

    print(f"\n  {len(all_buildings)} unique buildings from 3D BAG.")

    # Filter to buildings within radius of at least one terrace
    terrace_pts = [(t["lat"], t["lng"]) for t in terraces]
    nearby = [
        b for b in all_buildings.values()
        if any(dist_m(b["lat"], b["lng"], tl, tg) <= radius for tl, tg in terrace_pts)
    ]
    print(f"  {len(nearby)} buildings within {radius:.0f}m of a terrace.")

    if nearby:
        heights = sorted(b["height"] for b in nearby)
        n = len(heights)
        print(f"\n  Height stats: min={heights[0]:.1f}m  median={heights[n//2]:.1f}m  max={heights[-1]:.1f}m  mean={sum(heights)/n:.1f}m")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(nearby, f, indent=2, ensure_ascii=False)
        f.write("\n")

    size_kb = len(json.dumps(nearby)) / 1024
    print(f"\n✅ Written {len(nearby)} buildings to {OUTPUT_PATH} ({size_kb:.1f} KB)")
    print(f"\nThe shadow engine will automatically use this data on next app start.")


if __name__ == "__main__":
    main()
