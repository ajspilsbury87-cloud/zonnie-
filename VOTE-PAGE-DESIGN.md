# Vote page (`docs/vote.html`) — data + interaction contract

Status: **decided 2026-06-14**, supersedes the Phase-A "frozen score in the URL" design.
This is the contract the redesigned `vote.html` and the app's link-builder must share.

## Problem with the current design
- The share URL bakes the sun score into `s=` (`#t=812,455&s=57,64`). The score is a
  point-in-time snapshot from the *sharer's* device, so it (a) goes stale as the plan time
  approaches/passes, and (b) inherits any bug in the sharer's app build (this is how
  `s=57,57,57` shipped — three geometrically-identical terraces collapsing).
- The page is also **display-only** — no way to actually vote, despite the "Stem hier" copy.

## The hard constraint
The vote page is a **static file on GitHub Pages — no backend, and it cannot ship
`buildings.json`** (multi-MB). So the page **cannot compute the full shadow-aware sun score
from scratch** (shadow needs per-building ray-casting). Any "compute on the page" approach is
therefore either (a) unfaithful (ignores shadow) or (b) reads a precomputed snapshot.

## Decision

### 1. URL carries ids + window, NOT scores
```
https://…/vote.html#t=812,455,93&w=14-17&d=2026-06-20
  t = comma-separated terrace ids
  w = visit window as "fromHour-toHour" (24h local), e.g. 14-17
  d = optional ISO date (YYYY-MM-DD); absent ⇒ "today" on the page
```
Drop `s=`. The page derives the score itself (below). Old `s=` links still parse — keep a
fallback so previously-shared links don't 404 (read `s=` if present, else compute).

### 2. Score comes from a per-hour snapshot baked into `terraces-lite.json`
`build-terraces-lite.ts` adds, per terrace, an **hourly score array for a clear-sky day**,
computed with the FULL engine (facing + shadow + openness + altitude), e.g.:
```jsonc
{ "id": 812, "name": "...", "facing": "SW", "lat": …, "lng": …,
  "googleRating": 4.3, "googleReviewCount": 1200,
  "h": [0,0,0,0,0,0,0,12,28,45,…,71,54,…,0] }   // index = hour 0–23, value = 0–100
```
The page reads `h[fromHour..toHour]`, averages, and displays that as the window score.
- **Faithful** (same engine as the app, incl. shadow) without shipping buildings.
- **Window-accurate** and **live** (recomputed on open, not frozen at share).
- **Size:** 24 small ints/terrace × 974 ≈ trivial (well under +100 KB; can trim to daylight hours 7–22).

**Caveat — seasonal drift:** the snapshot is for a representative clear day. Sun geometry
changes slowly week-to-week, so a snapshot is accurate for "today/this week." Rebuild
`terraces-lite.json` on a cadence (wire `build-terraces-lite` into the data pipeline + a
periodic rebuild) so it tracks the season. Weather is intentionally excluded (the snapshot is
a "clear-day potential" — the page labels it as such, e.g. "zonpotentieel" not a live forecast).

### 3. Voting = tap-to-pick → reply in the chat (no backend)
Each terrace card gets a **"Stem / Vote"** button. Tapping it opens the device share sheet (or a
`https://wa.me/?text=…` deep link) pre-filled with e.g. `Ik kies ☀️ Café X! (zonscore 71)`,
which the friend sends back to the group chat where the link was shared. Votes are tallied
informally in the chat — zero backend, fits the static-page design. (A real aggregated tally
would need a backend; deferred.)

## Contract summary (for `vote.html` ↔ app)
| Piece | Contract |
|---|---|
| URL params | `t` (ids), `w` (`from-to` hours), `d` (optional date). `s` only as legacy fallback. |
| Score source | `terraces-lite.json` `h[]` hourly array, averaged over `w`. |
| Rating | `terraces-lite.json` `googleRating` (already present). |
| Vote action | per-card button → prefilled chat reply (share sheet / `wa.me`). |
| Score label | "zonpotentieel bij helder weer" (clear-day potential), not a live forecast. |

## App-side changes (this repo)
- `src/lib/voteLink.ts` — `buildVoteUrl(items, window, date)` → emit `t` + `w` (+ `d`), drop `s`.
- `src/components/ShortlistBar.tsx` — pass the visit window (from `useTimeStore`) instead of scores.
- `scripts/build-terraces-lite.ts` — add the `h[]` hourly-score array; wire into the data pipeline.
