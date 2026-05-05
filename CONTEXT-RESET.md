# Zonnie — Context Reset Reference

> **Purpose:** Drop this whole file into a fresh Claude conversation when the
> 1M context window of the previous session is exhausted. Self-contained —
> caller doesn't need to read other repo files first to be useful.
> **Last updated:** 2026-05-05 by Andy + Claude during overnight work.
> **Owner:** Andy Spilsbury (`andy.spilsbury@hotmail.co.uk`, Apple Team `A986G5KJT4`)
> **Repo:** `C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae` on Andy's Windows machine.

---

## What is Zonnie?

iOS app showing which Amsterdam terraces are sunny right now (or in your visit window). Native Expo build. **378 hand-curated terraces**, real Amsterdam sun + per-terrace shadow math, hourly Open-Meteo weather (cloud + wind), Google Places info on detail card. Built primarily on Andy's Windows laptop in OneDrive.

**Differentiation vs the three direct competitors:**

| | Zonnie | Sun Seekr | Coffee in the Sun | Seats in the Sun |
|---|---|---|---|---|
| Coverage | 378 curated | Global thin | Global Apple Maps POIs | NL crowdsourced (~1,095 Amsterdam) |
| Visit-window scoring | ✓ | ✗ "now" only | partial | ✗ |
| Time scrubber | ✓ (dual slider) | ✗ | ✓ (their hero feature) | ✗ |
| Wind-shelter score | **✓ unique to Zonnie** | ✗ | ✗ | ✗ |
| Real adjacent-building shadows | ✓ | ✗ | ✓ (3D buildings) | ✗ |
| Native | iOS preview build via EAS | iOS, Android | iOS, Android | Web only |
| Price model planned | Free + $0.99/$5.99/$17.99 lifetime | £350/yr B2B | €0.99–€19.99 | Free |

Brand: 70s sunset palette (mustard / peach / terracotta / cocoa / ink), italic-T pin with sun glyph above. Display name **"Zonnie"**, bundle ID **`com.spilsbury.zonnie`** (registered with Apple).

---

## Live build state (KEEP IN SYNC)

- **EAS project:** `andy.spilsbury/andys`
- **EAS project ID:** `4f05324b-142b-48f5-ab7c-44a3c2d2c3ab`
- **Slug** (internal):  `andys`
- **Latest installed binary on Andy's iPhone:** v0.1.0 (built 2026-05-03), `newArchEnabled: true`
- **Latest OTA pushed (preview channel):** `8fd158b2-8b57-4437-b55d-b2062ebae1e9` — the parachute (pinColor markers, pre-overnight-features)
- **Channel binding:** `preview` channel → `preview` branch, manually bound via `eas channel:edit`
- **Master branch HEAD as of this doc:** features built but not yet OTA-pushed (favorites, geolocate, wind score, info chips, curation badge)

### To push a new OTA after JS-only changes
```powershell
cd "C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae"
npx eas-cli@latest update --branch preview --message "..."
```

### To build a fresh native binary (only when native code changes)
```powershell
npx eas-cli@latest build --platform ios --profile preview
```

---

## OPEN BUG (highest priority)

**Time-range crash** — when the user changes the time scrubber rapidly, the iOS app hard-crashes (back to home screen).

**Crash log captured 2026-05-04** confirms it's a **React Native New Architecture (Fabric) bug with `react-native-maps` 1.20.1**:

```
NSRangeException: -[__NSArrayM insertObject:atIndex:]: index 65 beyond bounds [0..63]
in -[RCTLegacyViewManagerInteropComponentView finalizeUpdates:]
```

Many markers' mount transactions land in one tick → legacy view-manager interop's subview index gets out of sync → SIGABRT. Affects both `image` AND `pinColor` markers (the bug is in the mounting layer, not in marker rendering).

**Three fix paths** (any one resolves it):

1. **Upgrade `react-native-maps` to v2+** with first-class Fabric support. Untested whether v2 fully eliminates the legacy interop path. Quickest if it works.
2. **Migrate to `expo-maps`** (Expo's official replacement, native Fabric components — no legacy interop). Cleaner, but a bigger refactor (different API surface).
3. **Disable new architecture** (`newArchEnabled: false`). Routes through the old Paper architecture which lacks the crashing code path. **Was attempted overnight 2026-05-04/05; the EAS Build pod-install phase failed with "Unknown error" (no actionable detail in the dashboard logs Andy shared). Probably some transitive dep that doesn't fully support old arch in SDK 54.**

The current `app.config.ts` keeps `newArchEnabled: true` and a comment points future work at #1 / #2.

**Mitigation already in place** (these did NOT resolve it but did make it survive longer):
- Per-hour score cache (`useScoredTerraces`)
- React.memo on TerracePin component
- Scrubber commits to store on `onSlidingComplete` only (no continuous re-render during drag)
- ErrorBoundary on each top-level surface in `app/index.tsx` (catches JS errors but native crashes still bypass)
- `MAX_MARKERS` cap was tried at 30 / 50 / 100 / unlimited; no cap fully fixed it but smaller numbers crashed less often. Currently uncapped (rendering all 378) on master.

---

## Working features (confirmed on device through 2026-05-03)

1. **Map** with all 378 terraces as italic-T pins, color + size by sun score (terracotta full → cocoa shade), selected = peach + halo
2. **Time-range scrubber**: dual slider (From / To), day-night gradient track, score recomputes on slide-complete
3. **Date picker**: 8 chips (today + 7 days), each chip carries a cloud-cover glyph from Open-Meteo
4. **Search**: diacritic-insensitive ("kiebert" matches "Kiebêrt"); searches name + area + vibe + address
5. **Neighborhood filter**: 6 macro-regions (Jordaan / Zuid / Oost / West / Centrum / Noord), multi-select
6. **Detail sheet**: name + region/facing/capacity, sun-score chip, Google Places (rating · price · today's hours), SunTimeline (24h bars, in-range highlighted), Show on Map / View in Maps / Get Directions
7. **Real shadow simulation**: per-terrace adjacent buildings (placed opposite each terrace's `facing`). 20% of terraces shadowed at typical midday (vs 0% before this fix)
8. **Hourly weather** from Open-Meteo: cloud cover + temperature + wind speed + wind direction. In-memory cache by date.
9. **OTA updates** via EAS Update on `preview` channel.

## New features built overnight 2026-05-04/05 — committed but **NOT YET OTA-pushed** as of this doc

10. **Favorites store** (`src/store/favoritesStore.ts`): AsyncStorage-persisted `Set<terraceId>`. Hydrate-on-launch in `app/_layout.tsx`. Heart toggle in detail sheet header. Visible "♥ N / ♡ Saved" chip in NeighborhoodFilter row that toggles `favoritesOnly`.

11. **Geolocate-on-launch** (`src/hooks/useUserLocation.ts`, `expo-location` plugin in `app.config.ts`): asks foreground permission, single low-accuracy fix. ZonnieMap auto-recenters to user with `latDelta: 0.02` IF the user is within an Amsterdam metro bbox. `showsUserLocation` only when in-bbox to avoid an off-screen blue dot for testers in other countries.

12. **Wind-shelter scoring** (`src/engines/scoring.ts#windShelterFactor`): up to 15% score penalty when terrace facing into wind > 8 km/h. None of the three competitors do this — Amsterdam wind is a real terrace-killer. Open-Meteo fetch extended to include `wind_speed_10m` + `wind_direction_10m`. **6 new unit tests** in `__tests__/scoring.test.ts`. **51 tests total, all passing.**

13. **Detail sheet info chips** below the SunTimeline:
    - **Sun-trend** (↑ Rising / → Holding / ↓ Falling): score delta vs an hour before the visit window
    - **Wind summary**: avg km/h + 8-point compass for the visit window, with a 💨/🌬️ glyph above 12/25 km/h
    - **Curation badge**: "✓ Verified by Zonnie" with a relative timestamp ("Verified 2 weeks ago"). Surfaces the moat over crowdsourced competitors.

---

## Stack & key files

- **Expo SDK 54.0.34**, **React Native 0.81.5**, **React 19.1.0**, **TypeScript** strict + `noUncheckedIndexedAccess`
- **Expo Router v6** (file-based)
- **Zustand** for state
- **`react-native-maps` 1.20.1** with `PROVIDER_DEFAULT` (Apple Maps on iOS) — the version triggering the Fabric crash
- **`@gorhom/bottom-sheet` v5** for the main sheet + the detail modal
- **Open-Meteo** for hourly forecast (no API key, free)
- **Google Places API (New)** for terrace detail info — needs `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` set at build/OTA time; Andy has the key but hasn't put it in env
- **`expo-location`** for geolocate-on-launch
- **`@react-native-async-storage/async-storage`** for favorites persistence
- **`sharp`** (dev) for SVG → PNG asset rasterization at build time

### File map

```
SunBae/
├── app/
│   ├── _layout.tsx              GestureHandler + SafeArea + BottomSheetModal + favorites hydrate
│   └── index.tsx                Map + MainSheet + TerraceDetailSheet wrapped in ErrorBoundaries
├── src/
│   ├── components/
│   │   ├── ZonnieMap.tsx        MapView + image markers + geolocate-on-launch
│   │   ├── MainSheet.tsx        Gorhom BottomSheet
│   │   ├── TerraceList.tsx      BottomSheetFlatList + sticky header (DatePicker → TimeRangeScrubber → SearchBox → NeighborhoodFilter)
│   │   ├── DatePicker.tsx       7-day chips with cloud glyph
│   │   ├── TimeRangeScrubber.tsx Dual slider replacing chip rows; commits only on slide-complete
│   │   ├── SearchBox.tsx
│   │   ├── NeighborhoodFilter.tsx 6-region chips + Favorites toggle chip
│   │   ├── TerraceDetailSheet.tsx Modal sheet — Places card + heart toggle + score chip + SunTimeline + sun-trend / wind / verified info chips + actions
│   │   ├── SunTimeline.tsx      24h bar chart per terrace
│   │   └── ErrorBoundary.tsx    Catches JS render errors; native crashes still bypass
│   ├── data/
│   │   ├── terraces.json        378 terraces with placeIds backfilled from Places API runs
│   │   ├── terraces.ts          Read-only typed export
│   │   ├── buildings.ts         Per-terrace adjacent + area-clustered procedural buildings
│   │   ├── buildings.json       Empty — falls back to procedural; 3D BAG fetch attempted but their CityJSON output gives bad coords
│   │   ├── areas.ts             22 neighborhood centroids w/ density + avg height
│   │   ├── regions.ts           27 areas → 6 macro-regions mapping
│   │   ├── weather.ts           Open-Meteo fetch (cloud + temp + wind speed + wind direction)
│   │   └── places.ts            Google Places fetch + URL builders
│   ├── engines/
│   │   ├── solar.ts             NREL solar position
│   │   ├── shadow.ts            Ray-cast shadow + procedural building generator
│   │   ├── scoring.ts           computeSunScore + computeRangeScore + windShelterFactor
│   │   └── types.ts             Terrace, Building, Weather (with wind), ScoreResult
│   ├── hooks/
│   │   ├── useScoredTerraces.ts Per-hour cache + region/query/favorites filter pipeline
│   │   └── useUserLocation.ts   One-shot foreground-permission + low-accuracy fix
│   ├── store/
│   │   ├── timeStore.ts         dateOffset, fromHour, toHour
│   │   ├── areaStore.ts         selectedRegions + favoritesOnly
│   │   ├── searchStore.ts       query
│   │   ├── weatherStore.ts      byDate cache
│   │   ├── placesStore.ts       byPlaceId cache
│   │   ├── selectionStore.ts    selectedId + panTo (Show on Map)
│   │   └── favoritesStore.ts    AsyncStorage-persisted Set<id> + hydrate
│   └── theme/tokens.ts          70s sunset palette + score → colour
├── assets/
│   └── images/
│       ├── icon.png             1024×1024 (rasterized from brand-assets/)
│       ├── splash-icon.png
│       ├── android-icon-foreground.png
│       ├── favicon.png
│       └── pins/{full,mostly,partial,shade,selected}.{png,@2x.png,@3x.png}
│             (size scales with score: 24×32 shade → 56×76 selected)
├── brand-assets/                Source SVGs — rasterize with `npm run rasterize-assets`
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
├── BACKLOG.md                   Prioritized feature roadmap (5 tiers, evidence-cited)
├── HANDOFF.md                   Earlier handoff doc, partly superseded by this one
├── CONTEXT-RESET.md             This file
├── SHIPPING.md                  EAS Build / TestFlight / App Store playbook
├── app.config.ts                Bundle ID, EAS project, plugin config, info.plist
├── eas.json                     Build profiles + channels
└── package.json
```

---

## Locked decisions (don't re-litigate)

1. **Bundle ID `com.spilsbury.zonnie` is permanent on App Store.** Don't change unless rebranding.
2. **Slug `andys`** is internal-only. Cosmetic; doesn't appear user-facing.
3. **Apple Maps over Google Maps** for the map (`PROVIDER_DEFAULT`). Better Look Around integration; avoids needing Google Maps SDK key.
4. **Open-Meteo over KNMI** for weather. KNMI's API is dataset-based (GRIB), not phone-friendly. Open-Meteo wraps the same models in JSON, no key, 7-day forecast. Swap path is one file (`src/data/weather.ts`).
5. **Per-terrace adjacent buildings over real 3D BAG.** 3D BAG fetch was attempted (`scripts/fetch-3dbag-buildings.py`); their CityJSON output uses relative-coord vertices with no transform metadata, so decoding produces points in southern France. The per-terrace approach uses each terrace's `facing` to place a synthetic adjacent building.
6. **Curated 378 over Seats-in-the-Sun's 1,095 wholesale.** Their dataset has noise (museums, train stations, hotel lobbies, dead chains, dupes). The diff identified 952 candidates worth manually reviewing — see `scripts/competitor-research/venues-not-in-zonnie.json`.
7. **No clustering on the map.** Tried `supercluster`, crashed Apple Maps in Expo Go via marker churn. Currently rendering all 378 markers (which proved stable in the static-marker case). Re-enable only when count grows past ~1,000.
8. **Lifetime Pro at $17.99 / Yearly $5.99 / Monthly $0.99** is the planned pricing tier.

---

## What's coming next (in priority order)

| # | Item | Effort | Why now |
|---|---|---|---|
| 1 | **Fix the time-range crash** via path 1 (upgrade RNM to v2) or path 2 (`expo-maps`) | 1–3 days | Blocks everything else from being testable |
| 2 | OTA-push the overnight features once a stable build exists | 1 hour | Favorites + geolocate + wind already in master, untested |
| 3 | Pin color/size legibility QA on stable build | 1 day | Andy reported "I can't tell sunny vs shaded" pre-crash |
| 4 | EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in build env | 30 min | Places card hides gracefully without it; ship it for proper UX |
| 5 | Run validation on the 94 unsourced terraces (`npm run validate-coords -- --apply --only-unsourced`) | 1 hour | Cleanup after the API key step |
| 6 | Import top 200–300 from `venues-not-in-zonnie.json`, validate via Places | 2–3 days | Competitive moat — get to ~600 verified terraces for App Store |
| 7 | Tier 1 features still missing: home/lock-screen widget, share-a-terrace card | 1 week | Sticky engagement; matches Coffee in the Sun's Pro feature set |
| 8 | App Store Connect setup + TestFlight + privacy policy + screenshots | 1 week | Last mile to ship |

Full prioritised list is in `BACKLOG.md`.

---

## When you continue this work

1. Read this file first.
2. Read `BACKLOG.md` for the roadmap.
3. `git log --oneline -25` to see what's landed since this doc was written.
4. `npm test` and `npm run typecheck` to verify the state is clean before changing things. (Should be 51/51 tests passing as of this writing.)
5. The crash fix is the work item that unblocks shipping. Start there unless Andy directs otherwise.

---

## Things I (Claude) cannot do for you

- Anything requiring Apple ID password / App Store Connect login (use of these on Andy's behalf is forbidden)
- Running `eas build` to completion (creates a real binary on Andy's account — needs his explicit yes each time)
- Submitting to TestFlight / App Store — Apple-account scoped
- Pushing to GitHub — repo is local-only by Andy's choice (has cached EAS / Apple metadata)

What I can do:
- Edit any file in the repo
- Run npm/git/eas commands non-interactively
- Push OTA updates (uses cached EAS auth — non-interactive)
- Trigger EAS Builds (Andy's account quota)
- Launch sub-agents for research / scraping
- Update this file as state evolves

---

*Trust but verify: this doc is a snapshot. Always check `git log` and `npm test` against the live state before acting.*
