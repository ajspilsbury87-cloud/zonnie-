# Zonnie — Data & Scoring Audit Spec

> Hand-off doc for Claude Code. Goal: run a **full, evidence-producing audit** of
> (A) terrace data completeness/quality and (B) the sun-score calculation pipeline,
> which is suspected to still have issues. Output = machine-generated reports +
> a prioritised fix list, NOT silent fixes. Audit first, fix second, in separate PRs.
>
> Project root: `C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae`
> Key files (verify exact paths by grepping before starting):
> - Terrace data: `src/data/terraces.ts` (or the JSON it imports)
> - Buildings: `src/data/buildings.json` (~1.8 MB, 3D BAG LIDAR heights)
> - Solar engine: `src/engines/` (SPA port; `shadow.ts` ray casting; scoring in
>   `computeSunScore` / `computeRangeScore`)
> - Places integration: `src/data/places.ts`, `src/store/placesStore.ts`
> - Theme bands used by pins/UI: full >0.7, mostly >0.5, partial >0.3, mshade >0.1
>
> **Rules of engagement:**
> 1. Every audit script is a standalone Node/TS script in `scripts/audit/`,
>    runnable headlessly, writing JSON + human-readable Markdown reports to
>    `audit-output/` (gitignore it).
> 2. No production code changes in the audit PR. Findings → `audit-output/FINDINGS.md`
>    with severity (P0 data-wrong / P1 misleading / P2 cosmetic) and proposed fix.
> 3. Scripts must run on Windows via full node path (node is NOT on the tool-shell
>    PATH: `C:\Program Files\nodejs\node.exe`), output to files not stdout.

---

## Part A — Terrace data completeness audit

### A1. Field completeness census
Write `scripts/audit/01-completeness.ts`:
- Load every terrace record. For each field, report % present / % missing / % suspicious:
  - `id` (unique? sequential gaps?), `name`, `lat`/`lng`, `neighbourhood`,
    `orientation` (N/NE/E/SE/S/SW/W/NW only?), `venueType` (bar/restaurant/coffee/…),
    `placeId`, `address`, `vibe`, `featured`, opening hours (if stored locally)
- Flag: empty strings, nulls, placeholder values ("TBD", "unknown", "test"),
  duplicate names at different coords, **duplicate coords** (< 5 m apart) with
  different ids → likely double entries.
- Output: `audit-output/completeness.json` + summary table in `FINDINGS.md`.

### A2. Coordinate sanity
`scripts/audit/02-coords.ts`:
- All coords inside Amsterdam bounding box (roughly 52.27–52.45 N, 4.72–5.07 E)?
  List outliers.
- Coords on water? (cheap check: compare against the canal band heuristic OR skip if
  no water polygon data — note as manual spot-check instead. Do NOT invent water data.)
- Distance from terrace to its nearest building in `buildings.json`:
  histogram. A terrace > 100 m from any building is suspicious (wrong coords or
  missing building data).
- Cross-check the subset with `placeId`: does our stored lat/lng sit within ~75 m of
  the Places-resolved location? (Reuse the existing `scripts/validate-coords.ts`
  machinery if present — grep first.) Requires `GOOGLE_MAPS_API_KEY` env var;
  if absent, emit the script but mark the step SKIPPED in the report.

### A3. Building-height coverage (the 117-terrace problem)
`scripts/audit/03-buildings.ts`:
- Per terrace: how many buildings are associated (expected ~30)? How many have
  **real LIDAR heights vs procedural fallback**? (Identify the fallback marker in the
  data — grep for how fallback heights were generated; if indistinguishable, flag
  that as a P1 finding itself: fallback data MUST be distinguishable.)
- Known context: ~890 terraces have real 3D BAG heights; ~117 newer ones were on a
  procedural fallback awaiting a fetch re-run. Confirm current counts.
- Height sanity: buildings with height ≤ 0, > 150 m (nothing in Amsterdam except
  a handful of towers), or exactly-equal heights across many buildings (a fallback
  fingerprint).
- Output the exact list of terraces still on fallback → these are P1 (their shadow
  accuracy is degraded and 3D BAG accuracy is the product's #1 quality lever).

### A4. Venue-type & neighbourhood distribution
`scripts/audit/04-distribution.ts`:
- Counts per venueType and per neighbourhood. Compare against rough reality
  (e.g., De Pijp and Centrum should be dense; a neighbourhood with 2 terraces is
  probably under-covered). Flag neighbourhoods < 10 terraces for manual review.
- Marketing claims check: app/store copy says "1,000+". Report the true count of
  **complete, verified** terraces (has coords + orientation + type). If the
  verified count is below the marketed claim, that's a P0 honesty finding.

---

## Part B — Sun score calculation audit

### B0. Inventory the pipeline first
Before testing, write up (in `FINDINGS.md`) the actual data flow by reading the code:
raw inputs → solar position (azimuth/altitude) → shadow test against buildings →
orientation modifier → cloud attenuation → final 0–1 score → UI bands. Note every
constant/magic number found (thresholds, ray counts, search radius, attenuation
curve). Mismatched assumptions usually hide here.

### B1. Solar position correctness (the foundation)
`scripts/audit/10-solar-reference.ts`:
- Cross-check the SPA port against an independent reference. Install `suncalc`
  (dev-only, `--no-save`) and compare azimuth + altitude for Amsterdam
  (52.3676 N, 4.9041 E) across a matrix:
  - Dates: Mar 20, Jun 21, Sep 22, Dec 21, plus 2 arbitrary dates
  - Times: every 30 min from 06:00–23:00 **local Amsterdam time**
- Tolerance: |Δazimuth| ≤ 1.0°, |Δaltitude| ≤ 0.5°. Report max/mean deviation.
- **Timezone audit (high-suspicion area):** verify the engine converts local
  Europe/Amsterdam time (CEST/CET, DST!) to UTC correctly. Classic bug: scores
  shifted by exactly 1–2 h → "the app says sunny at 17:00 but it's actually the
  15:00 sun". Test specifically: a date in January (CET, UTC+1) and July (CEST,
  UTC+2), and the DST transition days. If the engine takes `Date` objects, audit
  every `getHours()` vs `getUTCHours()` call.
- Sanity asserts: solar noon ≈ 13:40 CEST in midsummer Amsterdam; sun due south
  (azimuth ≈ 180°) at solar noon; altitude ≈ 61° Jun 21 noon, ≈ 14° Dec 21 noon.

### B2. Shadow engine correctness
`scripts/audit/11-shadow-cases.ts` — construct **synthetic fixtures** (don't rely on
real data for correctness tests):
1. Terrace with a single 20 m building due SOUTH at 15 m distance: must be SHADED
   at winter noon (sun alt ~14° → shadow length ≈ 80 m) and SUNNY at summer noon
   (alt ~61° → shadow ≈ 11 m < 15 m). Assert both.
2. Same building due NORTH: never shades the terrace (sun never comes from north
   at Amsterdam latitude). Assert sunny all day.
3. Building due WEST: shades in the EVENING only. Assert morning sunny, evening shaded.
4. Zero buildings: full sun whenever altitude > 0.
5. Sun below horizon: score must be 0 (not negative, not NaN). Check pre-sunrise,
   post-sunset edge handling.
- Then run the real engine over these fixtures and diff expected vs actual.
- Also audit: does the ray cast test the terrace as a POINT or an area? Does it use
  building footprint polygons or just centroids+radius? Document; centroid-only is a
  known source of false sun/shade at street corners (P1 if found).

### B3. Orientation modifier audit
`scripts/audit/12-orientation.ts`:
- Print the actual modifier curve: for each orientation (N..NW) × sun azimuth
  (0–360 in 15° steps), what multiplier is applied?
- Assert basic physics: a SOUTH-facing terrace should peak when sun azimuth ≈ 180°;
  a NORTH-facing terrace should never get a *boost* that outweighs being in shade.
- Common bug to check: orientation applied even when the terrace is fully shaded
  (orientation should modulate direct sun, not resurrect a shaded score), and
  azimuth convention mismatches (0=N clockwise vs 0=S).

### B4. Cloud attenuation audit
`scripts/audit/13-clouds.ts`:
- Map Open-Meteo `cloudcover` (0–100) → attenuation factor as implemented. Print the
  curve. Assert: 0% → ×1.0; 100% → some floor > 0 is fine (diffuse light) but
  document it; monotonic decreasing; no NaN on missing data (what happens when the
  weather fetch fails — does score silently become 0, 1, or stale? P1 if silent).
- Hour alignment: hourly cloud data joined to the right LOCAL hour? (Same DST trap
  as B1 — verify with a fixture where hour N has 0% and hour N+1 has 100%.)

### B5. Range scoring & band consistency
`scripts/audit/14-range-and-bands.ts`:
- `computeRangeScore` over a window vs the hourly `computeSunScore`s inside it:
  is it mean / max / weighted? Document. Assert window [t,t] equals the single-hour
  score (regression guard for the landing-page parity bug that was fixed before).
- Bands: confirm every UI surface (pins in `ZonnieMap.tsx`, list, detail sheet,
  landing page) uses the SAME thresholds (>0.7/>0.5/>0.3/>0.1). Grep for hardcoded
  copies; multiple definitions = P1, extract to one module as the proposed fix.
- Distribution snapshot: run the full scoring across all terraces for
  (a) tomorrow 13:00–15:00 sunny-sky assumption, (b) cloudy assumption.
  Plot histogram (text histogram is fine). Smell tests: not everything 90+,
  not everything identical, north-facing canal-house-shaded terraces visibly lower
  than open south-facing squares.

### B6. Ground-truth spot check (manual, but scaffolded)
`scripts/audit/15-spotcheck.ts` generates `audit-output/spotcheck.md`:
- Pick 12 well-known terraces across orientations/neighbourhoods (e.g. a Nieuwmarkt
  square terrace, a narrow Jordaan canal-side, a Noord waterfront, a De Pijp street).
- For each: print predicted sunny windows for the coming Saturday.
- Andy verifies in person / via webcams / Street View knowledge and marks
  ✅/❌ in the file. ≥10/12 should match within ±30 min; below that, the timezone or
  shadow geometry findings from B1/B2 are the prime suspects.

---

## Deliverables & order

1. `scripts/audit/*` (all scripts above) + `audit-output/` reports
2. `audit-output/FINDINGS.md` — every finding with: severity, evidence (numbers/file
   refs), affected terrace count, proposed fix, OTA-shippable? (data + JS fixes are
   OTA; nothing here should need a new binary)
3. A short `AUDIT-SUMMARY.md` at repo root: top-5 issues, one-line each, for Andy
4. THEN, as separate follow-up PRs in this order: P0 fixes → 3D BAG backfill for the
   fallback terraces (re-run the original fetch script — grep `scripts/` for it) →
   P1 fixes → re-run the full audit to confirm green.

**Definition of done:** audit re-run produces zero P0, zero P1, and the spotcheck
file shows ≥10/12 ✅.

---

## DECISIONS LOG (agreed with Andy — binding for any session running this audit)

1. **Execution order:** Part B first: B0 → B1 → B2, then STOP and report findings
   to Andy before continuing. Then B3–B6, then Part A. Rationale: a scoring bug
   poisons every pin; a data gap poisons one.
2. **Node tooling:** use `tsx`/`ts-node` if already a dependency; otherwise write
   plain `.mjs` audit scripts. No new toolchains, no global installs.
3. **suncalc:** install `--save-dev` (reproducible; dev deps don't enter the Metro
   bundle or binary). ⚠️ Normalise azimuth conventions before diffing — suncalc
   measures azimuth from SOUTH (positive westward); most SPA ports measure from
   NORTH clockwise. Document the convention used in the report, or you will
   "find" a 180° bug that doesn't exist.
4. **`audit-output/`** is gitignored.
5. **Verify paths by grepping first**; correct wrong paths in this spec as you go
   (doc fixes are allowed in the audit PR; production code changes are not).
6. **Reuse existing `scripts/validate-*` loaders/Places plumbing; read-only only**
   — do not inherit any data-mutating behaviour they may have.

### Pre-verified finding (confirmed by direct code inspection, 2026-06)

`shadowCoverage` is **NOT wired into live scoring**. `src/engines/scoring.ts`
imports only `solarPosition`; the score = solar position × cloud/direct-radiation
attenuation × orientation heuristic (+40% aligned … ×0.5 opposed) × wind shelter ×
temperature. The shadow engine's only production caller is
`src/components/ShadowOverlay.tsx` (map rendering via `computeShadowPolygon`).
Consequence: the map can draw a shadow polygon over a terrace whose pin shows a
high score — a user-visible contradiction on one screen.

**Record as TWO separate findings:**
- **Finding 1 (P0, fixed grade):** marketing/consistency mismatch. App Store copy,
  project docs, and published Instagram content claim building shadows drive the
  score; they do not. Plus the overlay-vs-pin contradiction. Present two
  remediation paths WITHOUT choosing: (A) wire `shadowCoverage` into scoring —
  estimate per-terrace-per-hour perf cost across ~1,009 terraces, note whether
  memoisation/spatial indexing exists; (B) soften all marketing claims to match
  orientation-only reality (note: requires App Store description + IG content
  changes, so not "free").
- **Finding 2 (grade by evidence):** adequacy of the orientation-only model.
  Using the B2 Option-2 dual-model run, report the % of terraces whose score BAND
  flips under `shadowCoverage` during peak hours (12:00–18:00, sunny-sky).
  Rubric: >20% band-flips = P0; 5–20% = P1; <5% = P2. Include the histogram,
  the top-50 ranking deltas, and ~5 named "hostile geometry" exemplar terraces
  (south-facing with tall building to the south, etc.) with the specific
  building (height + bearing) and hours when the contradiction is visible —
  ideally ones where the drawn overlay covers the terrace while its pin reads 70+.

### B2 scope (decided): Option 2

Full synthetic-fixture audit on `shadow.ts` (it is NOT dormant — the overlay
renders it, so correctness is already user-facing) AND the orientation-vs-shadow
delta quantification on real terraces described in Finding 2.

### B0 addition

Document which code path production actually calls (`computeRangeScore` vs
`computeSunScore`, from which components) — confirm there is exactly ONE live
path. Also dig out WHY shadow was removed from scoring (git history / comments —
`shadow.ts` header notes the old binary isInShadow caused identical-score
clustering; the continuous `shadowCoverage` was built to fix that). Remediation
proposals must address the original removal reason, not naively re-enable.

### Marketing hold (for Andy, not the audit)

Do NOT submit the drafted App Store description ("real building shadows … the
result: a 0-100 sun score") until the path A/B decision is made. Current copy
describes behaviour the shipped scoring does not have.
