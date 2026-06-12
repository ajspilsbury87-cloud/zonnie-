"""
Targeted 3D BAG fetch — fill building data ONLY for terraces that currently
lack it, and MERGE into the existing src/data/buildings.json (preserving the
895 terraces that already have data).

Why this exists: the full city re-fetch (fetch-3dbag-buildings.py) pages every
building in all 39 tiles of Amsterdam (~2 h) and keeps dying in laptop
shutdowns. The vast majority of terraces already have correct 3D BAG data; only
the newly-added ones (and genuinely-open waterfront spots) are missing. This
fetches a small box around just those, so it finishes in minutes.

Reuses the tested parsing/conversion helpers from fetch-3dbag-buildings.py via
importlib (that file has a hyphen, so it can't be a normal import; the module's
top-level only defines constants/functions — main() is guarded, so importing it
does not trigger a full fetch).

Run:  python -u -X utf8 scripts/fetch-3dbag-missing.py
Idempotent and safe: terraces that already have buildings are skipped; a
genuinely-open terrace correctly gets an empty list (no nearby buildings).
"""
import json, importlib.util, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# ── Load the main fetcher's helpers (hyphenated filename → importlib) ──────────
_spec = importlib.util.spec_from_file_location("f3dbag", "scripts/fetch-3dbag-buildings.py")
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)  # runs constants + def's only; main() is __main__-guarded

TERRACES_PATH = "src/data/terraces.json"
OUTPUT_PATH   = "src/data/buildings.json"
NEARBY_RADIUS_M = 200   # same as the full fetcher's per-terrace assignment radius
MAX_NEARBY      = 30
BBOX_MARGIN_M   = 260   # fetch a little wider than NEARBY_RADIUS so edge buildings are caught
WORKERS         = 4

with open(TERRACES_PATH, encoding="utf-8") as f:
    terraces = json.load(f)
with open(OUTPUT_PATH, encoding="utf-8") as f:
    buildings = json.load(f)

missing = [t for t in terraces if not buildings.get(str(t["id"]))]
print(f"{len(terraces)} terraces, {len(buildings)} keys in buildings.json, {len(missing)} missing data.")
if not missing:
    print("Nothing to fetch — all terraces have building data.")
    raise SystemExit(0)

# ── Fetch a small RD bbox around each missing terrace; pool unique buildings ──
pool = {}            # (lat, lng) -> building dict
pool_lock = Lock()
done = 0
done_lock = Lock()

def fetch_one(t):
    cx, cy = _m.wgs84_to_rd(t["lat"], t["lng"])
    found = []
    for features, transform in _m.fetch_tile_rd(cx - BBOX_MARGIN_M, cy - BBOX_MARGIN_M,
                                                cx + BBOX_MARGIN_M, cy + BBOX_MARGIN_M):
        for feat in features:
            b = _m.extract_building(feat, transform)
            if b:
                found.append(b)
    return t, found

print(f"\nFetching ~{BBOX_MARGIN_M}m boxes around {len(missing)} terraces ({WORKERS} workers)...")
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = {ex.submit(fetch_one, t): t for t in missing}
    for fut in as_completed(futs):
        t = futs[fut]
        try:
            _, found = fut.result()
        except Exception as e:
            print(f"  ERROR #{t['id']} {t['name']}: {e}", flush=True)
            continue
        with pool_lock:
            for b in found:
                pool[(b["lat"], b["lng"])] = b
            psize = len(pool)
        with done_lock:
            done += 1
            d = done
        print(f"  [{d:2}/{len(missing)}] #{t['id']} {t['name']}: +{len(found)} (pool {psize})", flush=True)

poolvals = list(pool.values())
print(f"\nPool: {len(poolvals)} unique buildings.")

# ── Assign nearest <=30 within 200m to each missing terrace, then MERGE ───────
updated = 0
zero = 0
for t in missing:
    cands = []
    for b in poolvals:
        dd = _m.dist_m(b["lat"], b["lng"], t["lat"], t["lng"])
        if dd <= NEARBY_RADIUS_M:
            cands.append((dd, b))
    cands.sort(key=lambda c: c[0])
    chosen = [c[1] for c in cands[:MAX_NEARBY]]
    buildings[str(t["id"])] = chosen
    updated += 1
    if not chosen:
        zero += 1
    print(f"  #{t['id']:>4} {t['name'][:34]:34} -> {len(chosen):2} nearby", flush=True)

# Write back in the SAME compact format the full fetcher uses (minimal churn).
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(buildings, f, ensure_ascii=False)
    f.write("\n")

still_missing = [t for t in terraces if not buildings.get(str(t["id"]))]
print(f"\nMERGED: updated {updated} terraces ({zero} have 0 nearby = genuinely open / waterfront).")
print(f"buildings.json now has {len(buildings)} keys; {len(still_missing)} terraces still with 0 buildings.")
