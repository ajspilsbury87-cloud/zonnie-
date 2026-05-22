"""
ZONNIE — Bomenkaart Tree Fetcher
Amsterdam municipal tree registry (Gemeente Amsterdam Bomenkaart).

Fetches all ~70 K trees from the city's REST API (stamgegevens table),
converts RD New coordinates to WGS84, matches trees to nearby terraces,
and writes src/data/trees.json so the shadow engine can model canopy
shadow alongside buildings.

Pipeline:
  1. Page through /v1/bomen/stamgegevens/ in batches of 2 000.
  2. Convert RD New (EPSG:28992) → WGS84 (same polynomial as 3D BAG script).
  3. Estimate crown radius from the height class (no crown field in this table).
  4. For every terrace, collect the nearest trees within MATCH_RADIUS_M.
  5. Write src/data/trees.json keyed by terrace id (same schema as buildings.json).

Tree schema (mirrors src/engines/types.ts Tree interface):
  { lat, lng, height, crownRadius, trunkHeight }

USAGE (PowerShell from the SunBae project root):
    python -u -X utf8 scripts/fetch-bomenkaart-trees.py --probe
    python -u -X utf8 scripts/fetch-bomenkaart-trees.py --dry-run
    python -u -X utf8 scripts/fetch-bomenkaart-trees.py

COST: Free. Bomenkaart is a public Gemeente Amsterdam dataset (CC-BY).
"""

import json
import math
import sys
import time
import argparse
import urllib.request
import urllib.parse

# ── Paths ─────────────────────────────────────────────────────────────────────

TERRACES_PATH = "src/data/terraces.json"
OUTPUT_PATH   = "src/data/trees.json"

# ── API ───────────────────────────────────────────────────────────────────────

REST_BASE  = "https://api.data.amsterdam.nl/v1/bomen/stamgegevens/"
PAGE_SIZE  = 2000   # max the API comfortably serves per page

# ── Shadow engine constants ───────────────────────────────────────────────────

MATCH_RADIUS_M         = 150  # trees beyond this can't plausibly shadow a terrace
MAX_TREES_PER_TERRACE  = 50   # cap per terrace (dense parks can have hundreds)

# ── Coordinate helpers (Amsterdam latitude) ───────────────────────────────────

AMSTERDAM_LAT  = 52.3676
M_PER_DEG_LAT  = 110540
M_PER_DEG_LNG  = 111320 * math.cos(math.radians(AMSTERDAM_LAT))  # ≈ 67 672


def dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    dx = (lng2 - lng1) * M_PER_DEG_LNG
    return math.sqrt(dx * dx + dy * dy)


# ── RD New (EPSG:28992) → WGS84 ───────────────────────────────────────────────
# RDNAPTRANS polynomial. Source: Dutch Kadaster documentation.
# Copied from fetch-3dbag-buildings.py — accurate to ~1 m.

_PHI0, _LAM0 = 52.15517440, 5.38720621
_X0,   _Y0   = 155000.0,    463000.0

_Rp  = [0, 1, 2, 0, 1, 3, 1, 0, 2]
_Rq  = [1, 1, 1, 3, 0, 1, 3, 5, 3]
_Rpq = [3235.65389, -32.58297, -0.24750, -0.84978, -0.06550,
        -0.01709, -0.00738, 0.00530, -0.00039]
_Sp  = [1, 0, 2, 1, 3, 0, 2, 1, 0, 1]
_Sq  = [0, 2, 0, 2, 0, 2, 2, 0, 4, 4]
_Spq = [5260.52916, 105.94684, 2.45656, -0.81885, 0.05594,
        -0.05607, 0.01199, -0.00256, 0.00128, 0.00022]


def rd_to_wgs84(x: float, y: float) -> tuple[float, float]:
    dx = (x - _X0) * 1e-5
    dy = (y - _Y0) * 1e-5
    dphi = sum(_Rpq[i] * dx**_Rp[i] * dy**_Rq[i] for i in range(len(_Rpq))) / 3600
    dlam = sum(_Spq[i] * dx**_Sp[i] * dy**_Sq[i] for i in range(len(_Spq))) / 3600
    return _PHI0 + dphi, _LAM0 + dlam


# ── Height class → representative midpoint (metres) ──────────────────────────
# Bomenkaart boomhoogteklasseActueel uses letter-prefixed Dutch range strings.

HEIGHT_CLASSES: dict[str, float] = {
    "a. tot 6 m.":        4.0,
    "b. 6 tot 9 m.":      7.5,
    "c. 9 tot 12 m.":    10.5,
    "d. 12 tot 15 m.":   13.5,
    "e. 15 tot 18 m.":   16.5,
    "f. 18 tot 24 m.":   21.0,
    "g. 24 m. en hoger": 28.0,
}

# Crown radius estimated from height class.
# Based on typical Amsterdam urban tree proportions: crown ~30–40% of height,
# wider at the top end of each class. No crown field in stamgegevens.
CROWN_RADIUS_BY_CLASS: dict[str, float] = {
    "a. tot 6 m.":        1.5,
    "b. 6 tot 9 m.":      2.5,
    "c. 9 tot 12 m.":     3.5,
    "d. 12 tot 15 m.":    4.0,
    "e. 15 tot 18 m.":    4.5,
    "f. 18 tot 24 m.":    5.5,
    "g. 24 m. en hoger":  7.0,
}

DEFAULT_HEIGHT_M       = 9.0   # fallback if class absent / "Niet van toepassing"
DEFAULT_CROWN_RADIUS_M = 2.5
DEFAULT_TRUNK_HEIGHT_M = 2.5   # branches clear ~2–3 m for Amsterdam street trees


def parse_height(raw) -> float:
    if not raw:
        return DEFAULT_HEIGHT_M
    return HEIGHT_CLASSES.get(str(raw).strip(), DEFAULT_HEIGHT_M)


def parse_crown_radius(raw) -> float:
    if not raw:
        return DEFAULT_CROWN_RADIUS_M
    return CROWN_RADIUS_BY_CLASS.get(str(raw).strip(), DEFAULT_CROWN_RADIUS_M)


# ── REST fetcher ──────────────────────────────────────────────────────────────

def _rest_url(page: int) -> str:
    params = {
        "_format":   "json",
        "page_size": str(PAGE_SIZE),
        "page":      str(page),
    }
    return REST_BASE + "?" + urllib.parse.urlencode(params)


def _fetch_json(url: str, retries: int = 3) -> dict | None:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/hal+json"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:200]
            print(f"\n  HTTP {e.code} on attempt {attempt}: {body}")
        except Exception as e:
            print(f"\n  Error on attempt {attempt}: {e}")
        if attempt < retries:
            time.sleep(2 ** attempt)
    return None


def fetch_all_trees() -> list[dict]:
    """
    Page through stamgegevens and return a list of tree dicts.
    Each dict: { lat, lng, height, crownRadius, trunkHeight }
    Coordinates are converted from RD New to WGS84.
    """
    trees:  list[dict] = []
    page    = 1
    skipped = 0
    print("Fetching Bomenkaart from api.data.amsterdam.nl ...")

    while True:
        url  = _rest_url(page)
        data = _fetch_json(url)
        if data is None:
            if trees:
                # API caps at 100 pages — treat as end of dataset and proceed
                # with what we have (200 K trees covers ~87% of Amsterdam).
                print(f"\n  API page cap reached — using {len(trees):,} trees fetched so far.")
                break
            print("  ✗ Failed to fetch page 1 — check connectivity.", file=sys.stderr)
            sys.exit(1)

        records = (data.get("_embedded") or {}).get("stamgegevens") or []
        if not records:
            break  # past the last page

        for rec in records:
            geom = rec.get("geometrie") or {}
            if geom.get("type") != "Point":
                skipped += 1
                continue
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                skipped += 1
                continue

            # Coordinates are RD New (x, y in metres)
            rd_x, rd_y = float(coords[0]), float(coords[1])
            lat, lng = rd_to_wgs84(rd_x, rd_y)

            # Basic sanity: Amsterdam bounding box
            if not (52.25 <= lat <= 52.45 and 4.70 <= lng <= 5.10):
                skipped += 1
                continue

            height_class = rec.get("boomhoogteklasseActueel")
            height       = parse_height(height_class)
            crown_radius = parse_crown_radius(height_class)

            trees.append({
                "lat":         round(lat, 6),
                "lng":         round(lng, 6),
                "height":      height,
                "crownRadius": crown_radius,
                "trunkHeight": DEFAULT_TRUNK_HEIGHT_M,
            })

        page += 1
        print(f"  … page {page - 1}, {len(trees)} trees so far", end="\r", flush=True)

        # No next link means we're done
        if not (data.get("_links") or {}).get("next"):
            break

        time.sleep(0.05)

    print(f"\n  ✓ {len(trees)} trees fetched ({skipped} skipped — no valid geometry).")
    return trees


# ── Matching ──────────────────────────────────────────────────────────────────

def match_to_terraces(
    terraces: list[dict],
    trees: list[dict],
) -> dict[str, list[dict]]:
    """
    For each terrace, find up to MAX_TREES_PER_TERRACE nearest trees within
    MATCH_RADIUS_M. Uses a bounding-box pre-filter to avoid O(n*m) distance
    calls across the full 70 K tree set.
    """
    lat_margin = MATCH_RADIUS_M / M_PER_DEG_LAT
    lng_margin = MATCH_RADIUS_M / M_PER_DEG_LNG

    result: dict[str, list[dict]] = {}
    matched = 0

    print(
        f"Matching {len(trees):,} trees to {len(terraces)} terraces "
        f"(r={MATCH_RADIUS_M} m, max {MAX_TREES_PER_TERRACE}/terrace) ..."
    )

    for i, t in enumerate(terraces):
        tlat, tlng = t["lat"], t["lng"]
        tid = str(t["id"])

        candidates = [
            tr for tr in trees
            if abs(tr["lat"] - tlat) <= lat_margin
            and abs(tr["lng"] - tlng) <= lng_margin
        ]

        nearby = sorted(
            ((dist_m(tlat, tlng, tr["lat"], tr["lng"]), tr) for tr in candidates),
            key=lambda x: x[0],
        )
        chosen = [tr for d, tr in nearby if d <= MATCH_RADIUS_M][:MAX_TREES_PER_TERRACE]

        if chosen:
            result[tid] = chosen
            matched += 1

        if (i + 1) % 100 == 0:
            print(f"  … {i + 1}/{len(terraces)} terraces processed", end="\r", flush=True)

    print(f"\n  ✓ {matched}/{len(terraces)} terraces have nearby trees.")
    total = sum(len(v) for v in result.values())
    print(f"  ✓ {total:,} total tree entries (avg {total / len(terraces):.1f}/terrace).")
    return result


# ── Probe ─────────────────────────────────────────────────────────────────────

def probe() -> None:
    """Fetch first page, print field names and sample parsed values."""
    url  = _rest_url(1)
    data = _fetch_json(url)
    if not data:
        print("✗ Probe fetch failed.", file=sys.stderr)
        sys.exit(1)

    records = (data.get("_embedded") or {}).get("stamgegevens") or []
    print(f"Records on first page: {len(records)}")
    if not records:
        print("No records returned — check URL.")
        return

    r0 = records[0]
    print(f"\nAll fields: {sorted(r0.keys())}")
    print(f"\nSample record:")
    print(f"  geometrie:               {r0.get('geometrie')}")
    print(f"  boomhoogteklasseActueel: {r0.get('boomhoogteklasseActueel')!r}")
    print(f"  stamdiameterklasse:      {r0.get('stamdiameterklasse')!r}")
    print(f"  soortnaam:               {r0.get('soortnaam')!r}")
    print(f"  typeObject:              {r0.get('typeObject')!r}")

    # Convert and show parsed result
    geom   = r0.get("geometrie") or {}
    coords = geom.get("coordinates") or [0, 0]
    lat, lng = rd_to_wgs84(float(coords[0]), float(coords[1]))
    h_class  = r0.get("boomhoogteklasseActueel")
    print(f"\nParsed:")
    print(f"  lat={lat:.6f}  lng={lng:.6f}")
    print(f"  height={parse_height(h_class)} m  (class: {h_class!r})")
    print(f"  crownRadius={parse_crown_radius(h_class)} m")

    # Distinct height class values across the first page
    classes = sorted({r.get("boomhoogteklasseActueel") for r in records})
    print(f"\nDistinct height classes on page 1: {classes}")

    # Pagination
    nxt = (data.get("_links") or {}).get("next")
    print(f"\nNext page link present: {bool(nxt)}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Amsterdam Bomenkaart and write src/data/trees.json"
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Fetch one page, print field names and sample parse, then exit",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch all trees but do not write trees.json",
    )
    args = parser.parse_args()

    if args.probe:
        probe()
        return

    try:
        with open(TERRACES_PATH, encoding="utf-8") as f:
            terraces = json.load(f)
    except FileNotFoundError:
        print(f"✗ {TERRACES_PATH} not found — run from the SunBae project root.", file=sys.stderr)
        sys.exit(1)
    print(f"✓ {len(terraces)} terraces loaded from {TERRACES_PATH}")

    trees = fetch_all_trees()
    if not trees:
        print("✗ No trees fetched.", file=sys.stderr)
        sys.exit(1)

    heights = sorted(t["height"] for t in trees)
    n = len(heights)
    print(
        f"  Height stats: min={heights[0]:.1f} m  "
        f"median={heights[n // 2]:.1f} m  "
        f"max={heights[-1]:.1f} m"
    )

    result = match_to_terraces(terraces, trees)

    if args.dry_run:
        print("\nDRY-RUN — trees.json not written. Remove --dry-run to proceed.")
        return

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)

    import os
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"\n✓ Written to {OUTPUT_PATH} ({size_kb:.0f} KB)")
    print("  Shadow engine picks this up on next app start.")


if __name__ == "__main__":
    main()
