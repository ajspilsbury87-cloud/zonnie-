# Zonnie — Handoff

> **For**: any Claude (or human collaborator) picking this up from a different device / chat session.
> **Owner**: Andy Spilsbury (`andy.spilsbury@hotmail.co.uk`, Apple Team `A986G5KJT4`)
> **Repo**: `C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae` on Andy's Windows machine
> **Last updated**: 2026-05-04

---

## What is Zonnie?

iOS app showing which Amsterdam terraces are sunny right now (or in your visit window). Native Expo build, ~378 hand-curated terraces, real Amsterdam sun + shadow math, hourly weather forecast from Open-Meteo, Google Places info on detail card.

**Differentiation vs competitors:**
- **Curated** Amsterdam terraces (vs Sun Seekr's stale OpenStreetMap, vs Coffee in the Sun's Apple Maps POIs, vs Seats in the Sun's crowdsourced 1,095 with closed-venue noise).
- **Visit-window scoring**: ranks terraces by AVERAGE sun across `from–to`, not just "right now".
- **Native iOS + Expo Go-compatible architecture**: no flaky web app, no server dependency for the core score.

Brand: 70s sunset palette (mustard / peach / terracotta / cocoa / ink), italic-T pin with sun glyph above. Display name **"Zonnie"**, bundle ID **`com.spilsbury.zonnie`** (registered with Apple).

---

## Current state of the app

### Live on Andy's iPhone via EAS Build

- **EAS project**: `andy.spilsbury/andys` (slug `andys` — internal; can rename later, doesn't matter)
- **EAS project ID**: `4f05324b-142b-48f5-ab7c-44a3c2d2c3ab`
- **Latest binary**: a preview build installed via direct download (not TestFlight yet). Built ~2026-05-03.
- **Latest OTA update group**: `cd98dc6d-b86d-46a8-bfd3-a7d6b08d6997` (commit `f13767c`, "Fix pins disappearing when time range changes").
- **Channel binding**: `preview` channel → `preview` branch (manually bound via `eas channel:edit`).

### To push a new OTA after JS-only changes
```powershell
cd "C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae"
npx eas-cli@latest update --branch preview --message "..."
```

### To build a fresh binary (only when native code changes)
```powershell
npx eas-cli@latest build --platform ios --profile preview
```
Apple credentials are cached — should re-use existing certs without re-prompting unless they expire (May 2027).

---

## Working features (confirmed on device)

1. **Map** with all 378 terraces as italic-T pins, color-coded by sun score (terracotta = full sun, peach = mostly, mustard = partial, cocoa = shade)
2. **Time-range picker** (chip rows for "From" / "To") — sets the visit window
3. **Date picker** (chip row, today + 7 days ahead) with cloud-cover glyph (☀️/🌤️/☁️) per chip
4. **Search** (diacritic-insensitive — "kiebert" matches "Kiebêrt")
5. **Neighborhood filter** (6 macro-regions: Jordaan / Zuid / Oost / West / Centrum / Noord)
6. **Detail sheet** with score, area, facing, capacity, vibe, address, **Google Places card** (rating, hours, price, phone — when API key is set), **Show on Map** / **View in Maps** / **Get Directions** actions
7. **Sun timeline** (24h bar chart per terrace, in-range hours highlighted)
8. **Real shadow simulation** using per-terrace adjacent buildings (placed opposite each terrace's `facing` direction). 20% of terraces shadowed at 14:00 in May vs 0% before — see `scripts/debug-scores.ts`.
9. **Hourly weather** from Open-Meteo, fetched per date, cached in-memory
10. **OTA updates** via EAS Update on `preview` channel

---

## Known issues — open

1. **Time-range crash** (Tier 0.1, ongoing). User reports app crashing when changing time chips rapidly. Multiple mitigations attempted (memoization, score cache, marker count cap, `tracksViewChanges={false}` later removed). The most recent OTA (commit `f13767c`) **may have inadvertently fixed this** — `tracksViewChanges={false}` was breaking the iOS Maps annotation lifecycle for image markers. Awaiting Andy's confirmation after a force-quit-twice reload.

2. **Pin colors not legible** (Tier 0.2). Cocoa "shade" pin blends into Apple Maps tile background. Mustard "partial" sometimes too light. Needs a contrast pass or a different visual cue (e.g., size-by-score in addition to color, or always-on contrast outline that adapts to background tone). **Not yet fixed.**

3. **Google Places API key not in build**. The detail-card Places info won't populate until `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set in the env at build/OTA time. Andy has a `GOOGLE_MAPS_API_KEY` for the validation script — same key, just needs the `EXPO_PUBLIC_` prefix and to be in the build env. Without it, the card hides gracefully.

4. **94 of 378 terraces missing `placeId`**. They never matched in the Places validation runs. Map / scoring works; only the Google Places card on the detail sheet falls back to "no info" for these. Re-running `npm run validate-coords -- --apply --only-unsourced` with the API key set would fix.

5. **94 unverified terraces** (overlapping with #4 mostly). Same fix.

---

## Tech stack & key files

- **Expo SDK 54.0.34**, **React Native 0.81.5**, **React 19.1.0**, **TypeScript** strict + `noUncheckedIndexedAccess`
- **Expo Router v6** (file-based)
- **Zustand** for state (5 stores: `timeStore`, `areaStore` (regions), `searchStore`, `weatherStore`, `placesStore`, `selectionStore`)
- **`react-native-maps`** with `PROVIDER_DEFAULT` (Apple Maps on iOS)
- **`@gorhom/bottom-sheet` v5** for the main sheet + the detail modal
- **Open-Meteo** for hourly forecast (no API key, free)
- **Google Places API (New)** for terrace detail info (basic SKU, ~$0.005/req)
- **`sharp`** for SVG → PNG asset rasterization (build-time)

### File map

```
SunBae/
├── app/
│   ├── _layout.tsx              GestureHandler + SafeArea + BottomSheetModal providers
│   └── index.tsx                Map + MainSheet + TerraceDetailSheet (+ selectionStore wiring)
├── src/
│   ├── components/
│   │   ├── ZonnieMap.tsx        MapView with all 378 terraces as image markers
│   │   ├── MainSheet.tsx        Gorhom BottomSheet wrapping the list
│   │   ├── TerraceList.tsx      BottomSheetFlatList with sticky header (DatePicker → TimeRangePicker → SearchBox → NeighborhoodFilter)
│   │   ├── DatePicker.tsx       7-day chip row with cloud glyph
│   │   ├── TimeRangePicker.tsx  Chip rows for From/To (will be replaced by TimeRangeScrubber)
│   │   ├── TimeRangeScrubber.tsx [WIP — created 2026-05-04, not yet wired in] dual-slider replacement
│   │   ├── SearchBox.tsx        BottomSheetTextInput
│   │   ├── NeighborhoodFilter.tsx 6-region chip row
│   │   ├── TerraceDetailSheet.tsx Modal sheet with Places card + SunTimeline + actions
│   │   └── SunTimeline.tsx      24h bar chart per terrace
│   ├── data/
│   │   ├── terraces.json        378 terraces (Andy's curated list; place IDs backfilled)
│   │   ├── terraces.ts          Read-only typed export
│   │   ├── buildings.ts         Per-terrace adjacent + area-clustered procedural buildings (real 3D BAG planned)
│   │   ├── buildings.json       Empty — not yet populated, falls back to procedural
│   │   ├── areas.ts             22 neighborhood centroids w/ density + avg height
│   │   ├── regions.ts           27 areas → 6 macro-regions mapping
│   │   ├── weather.ts           Open-Meteo fetch
│   │   └── places.ts            Google Places fetch + URL builders
│   ├── engines/
│   │   ├── solar.ts             Solar position math (NREL algorithm)
│   │   ├── shadow.ts            Ray-cast shadow + procedural building generator
│   │   ├── scoring.ts           computeSunScore + computeRangeScore
│   │   └── types.ts             Terrace, Building, Weather, ScoreResult, etc.
│   ├── hooks/
│   │   └── useScoredTerraces.ts Per-hour score cache + filter pipeline (region + query)
│   ├── store/
│   │   ├── timeStore.ts         dateOffset, fromHour, toHour, weatherProfile
│   │   ├── areaStore.ts         selectedRegions: Set<Region>
│   │   ├── searchStore.ts       query
│   │   ├── weatherStore.ts      byDate cache
│   │   ├── placesStore.ts       byPlaceId cache
│   │   └── selectionStore.ts    selectedId + panTo (for "Show on Map")
│   └── theme/tokens.ts          70s sunset palette + score → color
├── assets/images/
│   ├── icon.png                 1024×1024 (rasterized from brand-assets/)
│   ├── splash-icon.png
│   ├── android-icon-foreground.png
│   ├── favicon.png
│   └── pins/{full,mostly,partial,shade,selected}.{png,@2x.png,@3x.png}
├── brand-assets/                Source SVGs for icon + pins (rasterize via npm run rasterize-assets)
├── scripts/
│   ├── validate-coords.ts       Places API coordinate validation
│   ├── apply-corrections.ts     Apply corrections from coord_corrections.jsonl
│   ├── backfill-place-ids.ts    Pull placeId from corrections log → terraces.json
│   ├── rasterize-assets.ts      SVG → PNG via sharp
│   ├── debug-scores.ts          Score-distribution diagnostic
│   ├── diff-competitor-venues.ts Diff our 378 vs Seats-in-the-Sun's 1095
│   ├── ensure-expo-cache.js     EAS Build workaround (postinstall + eas-build-pre-install)
│   └── competitor-research/     Scraped competitor data (committed)
│       ├── seatsinthesun_amsterdam_full.{json,csv}    1,095 venues
│       ├── seatsinthesun_netherlands_all.csv          5,460 NL-wide
│       └── venues-not-in-zonnie.json                  952 candidates for import
├── BACKLOG.md                   Prioritized feature roadmap (5 tiers)
├── HANDOFF.md                   This file
├── SHIPPING.md                  EAS Build / TestFlight / App Store playbook
├── app.config.ts                Bundle ID, EAS project, plugin config, info.plist
├── eas.json                     Build profiles + channels
└── package.json
```

---

## How to continue work

### From this Claude Code session (Andy's laptop)

You have full file system access, can run npm/git/eas, can fetch URLs, can launch sub-agents. State is local to this session; commits to git are the source of truth.

### From a different Claude.ai session (phone, different machine)

Paste this HANDOFF.md as your opening message to give Claude context. Then either:

- **Read-only**: discuss, plan, draft code. The chat-only Claude can't edit files but can read inline content if you paste it.
- **GitHub-mediated**: if Andy pushes the repo to GitHub, you can fetch files via `gh`/HTTP and post diffs back. Repo is currently local-only — pushing is a deliberate decision (it has cached EAS / Apple metadata; would need to be private).

---

## Currently in flight

### Tier 0 + Tier 1.1 (active 2026-05-04)

Andy directed: "start on time scrubber and crash debug".

**Crash debug:**
- Hypothesis: latest OTA (commit `f13767c`) may have already fixed it by removing `tracksViewChanges={false}` from image markers. That prop was telling iOS Maps to ignore image-prop changes — exactly what should happen when a score band crosses. The native annotation lifecycle was getting wedged.
- Awaiting Andy's confirmation.
- If still crashing: add ErrorBoundary around ZonnieMap to convert "app dies" → "we caught it, here's the message", and consider Sentry for native crash reports.

**Time scrubber:**
- New file `src/components/TimeRangeScrubber.tsx` created — two stacked sliders (`@react-native-community/slider`), `onSlidingComplete` only commits to the store (no `onValueChange` cascade), day/night gradient on track. **Not yet wired into TerraceList / not yet replacing TimeRangePicker.** Need to update the import and run typecheck + push OTA.

---

## Decisions worth knowing

1. **Bundle ID `com.spilsbury.zonnie` is permanent on App Store.** Don't change unless you intend to ship a new app.
2. **Slug `andys` is internal**. EAS-side only, doesn't appear anywhere user-visible. Renaming is cosmetic.
3. **Apple Maps over Google Maps** for the map (`PROVIDER_DEFAULT` on iOS). Decision: Apple Maps integrates better with Look Around, native callouts, and avoids needing a Google Maps SDK key. Trade-off: less data than Google Maps.
4. **Open-Meteo over KNMI** for weather. Memory says KNMI was the planned target, but their API is dataset-based (GRIB files), not phone-friendly. Open-Meteo wraps the same models in a JSON API, no key, 7-day forecast — better fit. Swap path is one file (`src/data/weather.ts`).
5. **Per-terrace adjacent buildings over real 3D BAG.** 3D BAG fetch was attempted (`scripts/fetch-3dbag-buildings.py`) but their CityJSON output uses relative-coord vertices with no transform metadata in the response — decoding produces points in southern France. The per-terrace approach exploits the `facing` field as a hint for adjacent-building placement and gives realistic shadow variation (20% shadowed at 14:00 vs 0% before). 3D BAG remains a future improvement.
6. **Curated 378 over Seats-in-the-Sun's 1,095.** Their dataset has noise (museums, train stations, hotel lobbies, dead chains, dupes). Quality > quantity is the brand position. The diff identified 952 candidates worth manually reviewing — see `scripts/competitor-research/venues-not-in-zonnie.json`. Adding the top 200–300 (sun ≥ 90%, no noise) would put us at ~600 verified terraces.
7. **No clustering on the map.** Tried `supercluster`, crashed Apple Maps in Expo Go via marker churn. Currently rendering all 378 static markers, which proved stable. Re-enabling clustering only makes sense if marker count grows past ~1,000.
8. **Lifetime Pro at $17.99 / Yearly $5.99 / Monthly $0.99** is the planned pricing tier (matches Coffee in the Sun, beats them on curation). Not yet implemented; gated until App Store submission.

---

## Competitor analysis (one-paragraph each)

- **Sun Seekr** (UK / £350-yr B2B / 2.0★ US, 3.8★ UK): the loudest direct competitor. Hits "right now only", thin coverage outside London, multiple 1★ "doesn't work" reviews. Strong concept, weak execution. Their per-venue hourly chart and saved-spot push notifications are worth stealing; their global OSM coverage is the casualty.
- **Coffee in the Sun** (NL / €0.99-19.99 IAP / native iOS+Android): Mo Dawod's app, Rotterdam-based, time-scrubber is signature feature. Uses Apple Maps POIs (no curation), recently added sports/playgrounds (product drift). Their pricing is the proven model. Steal: time scrubber, widgets, lifetime tier.
- **Seats in the Sun** (NL / web-only / free): 1,095 Amsterdam venues via crowdsourced submission. Half-hourly sun granularity (`sundata.sunlevels[]`). Public benches/toilets/water-tap overlay. Steal: data shape, utility overlay, suggest-a-terrace flow. Don't steal: 1,095 wholesale (closed venues, museums).

---

## Next 4 weeks (Andy's chosen plan)

| Week | Focus |
|---|---|
| 1 | Tier 0 (crash + pin colors), Tier 1.4 (geolocate-on-launch), Tier 1.6 (Places API key into build) |
| 2 | Tier 1.1 + 1.2 (time scrubber + per-terrace 24h chart) |
| 3 | Tier 5.1 (import 200–300 best from competitor-list, validate via Places, manual spot-check) |
| 4 | Tier 1.3 + 3.1 + 1.5 (favorites + widgets + filter chips) |

Then App Store submission with ~600 verified terraces and the time scrubber as the screenshot hero.

---

## Open questions for the next session

1. **Did the latest OTA (`f13767c`) fix the time-range crash?** Need Andy to test on phone (force-quit + reopen twice).
2. **EXPO_PUBLIC_GOOGLE_MAPS_API_KEY** — should we put it in `eas.json` env or just rely on Andy setting it shell-side? Affects who can build.
3. **Pin color clarity** — three concrete options, which does Andy prefer:
   - (a) Add always-on contrast outline that adapts to map tile brightness
   - (b) Vary pin SIZE by score (small for shade, big for full sun)
   - (c) Keep colors, add an in-app legend that can be toggled
4. **Push to GitHub?** Currently local-only. Pushing makes phone-Claude integration easier but requires deciding on private vs public repo.

---

## Trust but verify

This handoff is a snapshot. Code may have changed since it was written — check `git log --oneline -20` from the project root for the latest commits. The `scripts/debug-scores.ts` diagnostic is the fastest way to sanity-check the score engine still produces realistic variation.
