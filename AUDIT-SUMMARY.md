# Zonnie — Audit Summary (for Andy)

Full detail: `audit-output/FINDINGS.md`. Overnight run of 2026-06-11.
**Nothing committed, pushed, or OTA'd — all changes sit in the working tree for your review.**

## Top 5 findings

1. **Building shadows didn't affect the score** (P0) — the app's headline claim ("real building shadows drive the sun score") was untrue; 40.5% of terraces had a pin that disagreed with the map's own shadow overlay. **FIXED**: shadow re-wired into scoring (Café Bédier 91→14). Becomes true once it OTAs.
2. **~95 fake terraces + duplicates in the data** (P0/P1) — procedurally-generated venues ("Lounge Slobeend") and double-entries. **FIXED across the week**: dataset 1,042 → **930 real, verified, de-duplicated** terraces (8 ambiguous pairs held for you).
3. **NaN weather could blank a pin's score** (P1) — Open-Meteo nulls slipped past a `?? 0` guard. **FIXED** with a finite-number choke-point.
4. **Score-band thresholds copy-pasted in 4 files** (P1) — labels, pins, and colours could silently drift apart. **FIXED**: one source of truth (`src/engines/bands.ts`).
5. **Solar/timezone engine is correct** (no action) — cross-checked vs an independent library: max 0.2° error, DST handled correctly. The "scores shifted by an hour" risk is ruled out.

## Foundation verdict
Solar position, DST, orientation curve, cloud curve, and range/band parity are all **evidence-validated correct**. The structural gap was shadow-not-in-score (now fixed). 80/80 tests green, typecheck clean.

## Needs your decision (parked — see FINDINGS.md "Parked for Andy")
- **O1 tuning** — orientation already penalised "sun behind → own building's shadow"; now that real shadow is wired in, that can double-count. **Measured: only ~2.7% of peak terrace-hours.** Three options in `audit-output/O1-options.md`: A (leave it), B (blunt −50%→−25%, +0.020 mean / 12.5% flips), **C (surgical — back-penalty only when not already shadowed, +0.002 mean / 1.1% flips)**. Small effect either way; *a quick read before the OTA is worthwhile but not blocking.*
- **OTA push** of the shadow fix + data cleanup (also waits on the #13 App Store approval).
- **"1,000+" claim** — real count is 930; you chose to keep the wording. Still flagged.
- **8 held duplicate pairs** + the SkyLounge→LuminAir merge candidate.
- **Spotcheck** — verify ≥10/12 predicted sunny terraces in person/Street View (`audit-output/spotcheck.md`).

## Status of the autonomous finishers
- ✅ Post-shadow audit re-run, spotcheck regeneration, O1 options doc — **done** (`audit-output/`). Contradiction confirmed resolved (5/5 hostile exemplars ~0.91→0.14).
- ⚠️ **3D BAG building re-fetch — incomplete.** It's a ~2 h job and has died twice in laptop shutdowns. **35/930 terraces still lack building data** (~11 genuinely-open waterfront = correct; ~20 newer terraces in dense areas that should have it — they currently score orientation-only, no shadow). It's relaunched, but if it keeps dying, run `python -u -X utf8 scripts/fetch-3dbag-buildings.py` once on a stable machine (idempotent, safe). **Not a blocker** — the shadow fix works for the 895 terraces that already have data.
