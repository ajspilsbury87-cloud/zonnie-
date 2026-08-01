# Zonnie — Spec: "Sun Run" (Phase 0)

> Build-ready spec for Phase 0 of the runs direction (see
> `FEATURE-RESEARCH-events-runs-Jun2026.md`). **Goal: validate demand for sunny social
> runs WITHOUT building accounts or a backend.** Everything here ships **over-the-air**
> and reuses engines/components Zonnie already has. **No new native dependencies.**

## 1. Goal & success

**Goal:** let a user generate and **share a "Sun Run"** — a run that *finishes at a terrace
that will be sunny when they arrive* — into the group chats where run coordination already
happens (WhatsApp / Instagram / Strava). Plus: turn the existing Chase-the-Sun crawl into a
shareable **invite**.

**Why Phase 0 (no backend):** prove people *want* and *share* this before committing to the
accounts + backend social platform (Phase 1). Riding existing chats sidesteps cold-start.

**Success signals (measurable on-device, no backend):**
- \# Sun Runs generated and \# shared (log to the existing silent sun-log store).
- Share-through rate (generated → actually shared).
- Qualitative: App Store reviews / direct feedback mentioning runs.
- **Greenlight threshold for Phase 1:** _you set the number_ (e.g. "≥X% of weekly actives
  generate a Sun Run and ≥Y% share it, sustained over N weeks").

## 2. Non-goals (explicitly Phase 1 — NOT this)

- ❌ Accounts / profiles / login.
- ❌ Server-side events, RSVP, "who's joined", waitlists, capacity caps.
- ❌ A public discovery feed of other people's runs.
- ❌ Turn-by-turn running navigation / GPS route-following (Strava & Komoot own that — we
  are **not** becoming a running-route app).
- ❌ Push notifications to attendees.

> "Anyone can join / private" in Phase 0 = simply *where you post the share* (a public IG
> story vs a specific chat). Actual join-tracking is Phase 1.

## 3. What we're building (two things)

### A. Sun Run generator — NEW
The differentiator is **sun timing**, not routing.

1. **Entry:** a "🏃 Plan a sun run" action — a new *Perfect For* card on Home, plus a button
   on the Chase-the-Sun sheet.
2. **Inputs** (all optional, sensible defaults):
   - **Distance:** chips — Short (~3k) / 5k / 10k / Long (~15k).
   - **Pace:** chips — Easy / Steady / Quick (used only to *estimate arrival time*, not to coach).
   - **Start:** current location (if granted) else pick an area/terrace.
   - **When:** now, or pick a time (today, or tomorrow — respects the after-sunset→tomorrow behaviour we just shipped).
3. **Compute:** `arrivalTime = startTime + distance ÷ pace`. Find a terrace that is **sunny at
   `arrivalTime`** (existing sun engine, scored at the arrival hour) and sensibly placed vs the
   start/distance. That terrace is the **sunny finish**. Optionally surface 1 sunny mid-point.
4. **Output:** a **Sun Run card** (§4) + the native share sheet.

> **Honest UI framing:** we suggest a *start + a sunny finish + distance/pace*, **not** a drawn
> street route. That's deliberate — the sun-timed finish is the magic; navigation is Strava's job.

### B. Group-joinable Chase the Sun — SMALL extension of existing
The Chase-the-Sun sheet already shares (image via `SunRouteCard`, text via `shareCrawl`). Add an
**invite framing**: optional meet **time + start point** and invite-flavoured copy ("Join my
Chase the Sun — Sat 15:00 from X, 4 sunny stops, sunny till 19:00"). Same share mechanics, zero
new infra.

## 4. The shareable artifact (reuse `SunRouteCard` + view-shot)
A story-format image (we already render these with `react-native-view-shot`):
- ☀️ **"Sun Run"** header + the Zonnie mark.
- "Sat 16:00 · ~5k · easy".
- "Finish: **[Terrace]**, [area] — sunny till 19:30 ☀️".
- Footer: "Plan yours on Zonnie · zonnie.app".

Plus a text fallback (extend `shareCrawl`) and, if cheap, a `zonnie://` deep link opening the
finish terrace.

## 5. Reuse map (why this is Effort **M**, not L)
| Need | Already exists |
|---|---|
| Sun-at-hour scoring for the finish | ✅ `cachedHourScore` / sun engine |
| Routing through sunny stops | ✅ `generateSunCrawl` (crawl.ts) — adapt for one start→finish |
| Image share card | ✅ `SunRouteCard` + `react-native-view-shot` (already in the binary) |
| Text share | ✅ `shareCrawl` |
| Deep-link scheme | ✅ `zonnie` scheme + expo-linking |
| Location | ✅ expo-location already integrated |

**New (all JS):** the generator UI (inputs), the pace→duration→arrival math, the finish-picker,
run-flavoured card copy, and the invite framing.

## 6. Edge cases
- **No sunny finish at that arrival time** (overcast / after dark): say so honestly — "No sunny
  finish for that time — try earlier, or tomorrow" — and offer the *sunniest available* with its
  score. (Reuses the after-sunset→tomorrow logic.)
- **No location permission:** fall back to the area picker.
- **Winter / low sun:** degrade to "least-shady finish"; consider hiding the entry point when the
  day's peak score is very low (reuse the verdict tier).
- **Very long runs:** cap distance; never pretend to draw a route.

## 7. Effort & sequencing
- **B** (invite framing on the existing crawl share): ~**S** — ship first, it's the cheapest test
  of share appetite.
- **A** (full Sun Run generator): ~**M** — the bulk of the work.
- All **OTA-able**, **no new native deps**, **no backend**.

## 8. Open decisions for you
1. **Entry point:** a Perfect-For card, a Home button, and/or inside Chase-the-Sun? _(Rec: a
   "🏃 Sun run" Perfect-For card + a button on the crawl sheet.)_
2. **Pace model:** simple Easy/Steady/Quick chips, or let users type min/km? _(Rec: chips for v1.)_
3. **Greenlight threshold** for Phase 1 (the number in §1).
4. **Name:** "Sun Run" / "Chase the Sun Run" / other.

---

*Companion to `FEATURE-RESEARCH-events-runs-Jun2026.md`. Phase 0 only — the platform (accounts +
backend + RSVP + safety/GDPR) is a separate, deliberate go/no-go after this validates.*
