"""
3D BAG API diagnostic — run once, paste the output back to Claude.

Usage (PowerShell from the SunBae folder):
    python scripts/debug-3dbag-api.py
"""

import urllib.request, json, sys

BASE = "https://api.3dbag.nl/collections/pand/items"

# RD New coordinates for the centre of Amsterdam (~Leidseplein area)
RD_BBOX = "119000,487000,121000,489000"
WGS_BBOX = "4.88,52.36,4.91,52.38"

TESTS = [
    ("No params",                       BASE),
    ("limit only",                      f"{BASE}?limit=3"),
    ("f=json only",                     f"{BASE}?f=json"),
    ("limit + f=json",                  f"{BASE}?limit=3&f=json"),
    ("RD bbox, no crs param",           f"{BASE}?bbox={RD_BBOX}&limit=3"),
    ("RD bbox + f=json",                f"{BASE}?bbox={RD_BBOX}&limit=3&f=json"),
    ("WGS bbox, no crs param",          f"{BASE}?bbox={WGS_BBOX}&limit=3"),
    ("WGS bbox + f=json",               f"{BASE}?bbox={WGS_BBOX}&limit=3&f=json"),
    ("RD bbox + bbox-crs (EPSG:7415)",  f"{BASE}?bbox={RD_BBOX}&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/7415&limit=3"),
    ("RD bbox + bbox-crs + f=json",     f"{BASE}?bbox={RD_BBOX}&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/7415&limit=3&f=json"),
    ("WGS bbox + bbox-crs (CRS84)",     f"{BASE}?bbox={WGS_BBOX}&bbox-crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84&limit=3"),
]

HEADERS_VARIANTS = [
    ("Accept: geo+json",   {"Accept": "application/geo+json"}),
    ("Accept: json",       {"Accept": "application/json"}),
    ("Accept: */*",        {"Accept": "*/*"}),
    ("No Accept header",   {}),
]

print("=" * 70)
print("3D BAG API Diagnostic")
print("=" * 70)

# First test: items endpoint with no params + different Accept headers
print("\n── Accept-header sensitivity (no query params) ──")
for hdr_name, headers in HEADERS_VARIANTS:
    try:
        req = urllib.request.Request(BASE, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read(500).decode(errors="replace")
            print(f"  {hdr_name:30s}  HTTP {r.status}  body[:80]: {body[:80]!r}")
    except urllib.error.HTTPError as e:
        body = e.read(200).decode(errors="replace")
        print(f"  {hdr_name:30s}  HTTP {e.code}  {body[:60]!r}")
    except Exception as ex:
        print(f"  {hdr_name:30s}  ERROR: {ex}")

# Second test: URL variations with default Accept header
print("\n── URL parameter variations (Accept: application/geo+json) ──")
for name, url in TESTS:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/geo+json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read(300).decode(errors="replace")
            # Try to count features
            try:
                data = json.loads(r.read(50000) if False else body + r.read(50000).decode(errors="replace"))
                n = len(data.get("features", []))
                print(f"  ✓ {name:45s}  HTTP {r.status}  {n} features")
            except Exception:
                print(f"  ✓ {name:45s}  HTTP {r.status}  body[:60]: {body[:60]!r}")
    except urllib.error.HTTPError as e:
        body = e.read(200).decode(errors="replace")
        print(f"  ✗ {name:45s}  HTTP {e.code}")
    except Exception as ex:
        print(f"  ✗ {name:45s}  ERROR: {ex}")

print("\n── Raw successful response (first working URL) ──")
for name, url in TESTS:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/geo+json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            if r.status == 200:
                body = r.read(2000).decode(errors="replace")
                print(f"URL: {url}")
                print(f"Response (first 2000 chars):\n{body}")
                break
    except Exception:
        continue

print("\nDone.")
