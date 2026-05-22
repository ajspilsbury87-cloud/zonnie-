# Zonnie — Improvement Plan

> Audited: 2026-05-20. Repo: `C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae`
> App name on device: **Zonnie** (bundle `com.spilsbury.zonnie`, v1.2.0)

---

## 1. TL;DR

- The core shadow engine is technically ahead of SunSeekr: full 3D BAG polygon data, continuous coverage scoring, and per-terrace pre-computed building lists. This is the most defensible part of the app and should be marketed harder.
- The venue dataset (1,009 records) is closing on SunSeekr's Amsterdam footprint but still trails Seats in the Sun (1,095). More importantly, zero venues have polygon terrace footprints — every score is still a point test, which limits the "% sun coverage" feature SunSeekr uses as a visual hook.
- A known NSRangeException crash from react-native-maps Fabric interop is documented but unresolved. New architecture is enabled; the map library is not Fabric-native. This is the single highest-priority engineering item.
- Five dimensions where the gap to SunSeekr is large: community/UGC terraces, B2B/monetisation surface, tree canopy geometry, cycling routing, and distribution (no landing page, no press assets, no launch plan).
- Weather integration is technically solid (Open-Meteo, hourly cloud+temp+wind+direction) but the model variant is not pinned to KNMI HARMONIE — a quick URL parameter fix that would be a credible differentiator claim.

---

## 2. Current State Audit

### Framework and Runtime

| Item | State |
|---|---|
| React Native | 0.81.5 |
| Expo SDK | 54 |
| New Architecture (Fabric) | Enabled (`newArchEnabled: true`) |
| Hermes | Yes (default in RN 0.81) |
| React Compiler | Enabled (`experiments.reactCompiler: true`) |
| Known crash | NSRangeException in `RCTLegacyViewManagerInteropComponentView.finalizeUpdates` when many map Marker mount transactions land in one tick. Documented in `app.config.ts`. Root cause: `react-native-maps` 1.27.2 uses legacy view manager interop on Fabric. Fix: upgrade to a Fabric-native maps library. |
| OTA runtime policy | `appVersion` (not fingerprint — fingerprint failed at EAS build time) |
| Navigation | Expo Router (file-based) |
| State | Zustand 5 |
| Persistence | AsyncStorage (favourites, onboarding state, weather cache) |

### Map Rendering

| Item | State |
|---|---|
| Map library | `react-native-maps` 1.27.2, `PROVIDER_DEFAULT` (Apple Maps on iOS) |
| 3D building support | None — 2D flat Apple Maps tiles only |
| Marker type | Custom pure-RN teardrop pin, memoised, `tracksViewChanges={false}` |
| Clustering | None — capped at top-200 markers by score instead |
| Shadow overlay | None — score is numerical only; no visual shadow cast on map tiles |
| Fabric-native | No — legacy interop mode |

### Building Geometry

| Item | State |
|---|---|
| Source | 3D BAG (via `scripts/fetch-3dbag-buildings.py`) — TU Delft/Kadaster LIDAR-derived |
| Coverage | 1,009 terraces x 30 buildings each = 28,269 building records |
| Polygon data | 100% — every building has a `poly` array (convex hull vertices) |
| Height source | 3D BAG ground-to-roof height, ~0.5m accuracy |
| Tree canopy | Absent — no Bomenkaart integration |
| Vegetation | No tree geometry at all |

### Venue Dataset

| Item | State |
|---|---|
| Record count | 1,009 |
| Schema fields | id, name, lat/lng, area, facing, capacity, vibe, address, verified, coordSource, verifiedAt, placeId, googleRating, googleReviewCount, category (147 venues), outdoorScreens (13 venues) |
| Polygon / footprint | None — point coordinates only |
| Facing field | 100% coverage (curated per venue) |
| Dog-friendly | Not present |
| Laptop-friendly | Not present |
| Canal-side flag | Not present |
| Kid-friendly | Not present |

### Shadow Simulation

| Item | State |
|---|---|
| Algorithm | Continuous `shadowCoverage` [0,1] — not binary |
| Polygon path | Convex-hull angular silhouette with 1 degree penumbra |
| Centroid fallback | Angular half-width from `building.width`, 5 degree soft buffer |
| Max building distance | 200m |
| Min building distance | 8m (own-structure guard) |
| Height ratio ramp | Linear from 0.8x to 1.0x (catches near-miss tall buildings) |
| Vegetation | None |

### Solar Math

| Item | State |
|---|---|
| Implementation | Custom port — simplified SPA. Julian Day + mean anomaly + equation of centre + declination + GMST + hour angle. Pure JS, zero runtime deps. |
| Accuracy | ~1 degree, sufficient for terrace scoring |
| Library | No SunCalc dependency — hand-rolled |
| DST handling | Correct — `fromZonedTime(localISO, 'Europe/Amsterdam')` |
| Altitude denominator | Calibrated to 61 degrees (Amsterdam max), `sqrt(alt/61)` curve |

### Weather Integration

| Item | State |
|---|---|
| Provider | Open-Meteo |
| Variables | `cloud_cover`, `temperature_2m`, `wind_speed_10m`, `wind_direction_10m` |
| Resolution | Hourly, 24h per day |
| Granularity | City-level (single Amsterdam centroid) |
| Model variant | **Not pinned** — defaults to ECMWF blend. KNMI HARMONIE not specified. |
| Caching | `weatherStore.byDate` — per-day, hydrated on app launch |
| Fallback | Synthetic weather profile (sunny/partlyCloudy/cloudy/overcast presets) when offline |

### Core User-Facing Features

| Feature | Present | Quality |
|---|---|---|
| Live map with scored pins | Yes | Good — relative colour bands, 200-pin cap, memoised |
| Hour-by-hour timeline | Yes | Good — 576 sub-bars, smooth gradient, tap-to-focus, sunrise/sunset labels |
| Sun Score equivalent | Yes | Good — altitude + shadow + cloud + facing + wind + temp composite |
| Visit-window scoring | Yes | Strong — averages hourly scores across user-selected range |
| Date picker (7-day) | Yes | Present |
| Weather strip | Yes | Present |
| Venue type filters | Yes — Bar/Restaurant/Coffee | Missing: dog-friendly, laptop, canal-side, kid-friendly |
| Neighbourhood filter | Yes | 6 macro-regions |
| Search | Yes | Free-text over name |
| Outdoor TV / match mode | Yes (13 venues tagged) | Niche, complete for World Cup use case |
| Sort by distance | Yes | Blends distance with sun score |

### Personalisation

| Feature | Present | Notes |
|---|---|---|
| Saved favourites | Yes — AsyncStorage | Free: 3 max, Pro: unlimited |
| Per-favourite sunny notifications | Yes | Up to 5, scheduled at 09:00 tomorrow |
| Daily forecast notification | Yes | "Sunny tomorrow" if 3+ hour block |
| History / recents | No | |
| Onboarding | Yes | 2-hint sequential system |

### Community and UGC

| Feature | Present |
|---|---|
| Community-drawn terrace polygons | No |
| User-submitted venue suggestions | No |
| Venue verification by users | No |

### B2B and Monetisation

| Feature | Present | Notes |
|---|---|---|
| RevenueCat IAP | Yes | Monthly EUR 0.99, yearly EUR 5.99, lifetime EUR 17.99 |
| Pro paywall UI | Yes | `ProPaywall.tsx` |
| Venue claim / business dashboard | No | |
| Promoted listings | Plumbing only — `terrace.featured` flag exists, gold-border pin wired, no venues have it set |

### Brand and Design

| Item | State |
|---|---|
| Wordmark | "Zonnie" — Dutch for "sunny." Clean, memorable. |
| Palette | 70s sunset: cream, mustard, peach, burnt, terracotta, cocoa |
| Typography | Fraunces (display) + Inter (body) |
| App icon | Custom SVG sunset-stripes mark |
| Map pins | Custom teardrop (pure RN, OTA-shippable) |
| Marketing screenshots | 5 composed screenshots in `assets/marketing/composed/` |

### Tests

| Item | State |
|---|---|
| Test files | 6 — shadow, solar, scoring, buildings, forecast, terraces |
| Shadow math tests | Yes — covers primitives, polygon silhouette, geometry regression |
| Solar position tests | Yes — solstice, equinox, below horizon |
| E2E (Detox/Maestro) | None |
| Crash reporting | None |
| CI | Not visible in repo |

---

## 3. Gap Analysis vs SunSeekr

| Dimension | Zonnie | SunSeekr | Gap | Nature |
|---|---|---|---|---|
| 1. Framework stability | New arch on, known crash unresolved | Presumed stable at 250K users | Medium | Engineering debt |
| 2. Map rendering | Apple Maps 2D, no shadow overlay | Mapbox GL, 3D buildings, live shadow on tiles | Large | Visual fidelity |
| 3. Building geometry | 3D BAG polygon, 100% coverage | OSM heights (~6.5% explicit, rest 9m default) | **Zonnie leads** | Accuracy advantage |
| 4. Venue data | 1,009 curated, point-only | Community-drawn polygon terraces | Medium | Polygon footprints missing |
| 5. Shadow algorithm | Continuous [0,1], polygon silhouette, no trees | Binary/score, road-midpoint hack for non-streetside | **Zonnie leads on algorithm**; loses on canopy | Tree geometry absent |
| 6. Solar math | Custom SPA, Amsterdam-calibrated | SunCalc equivalent | Roughly equal | |
| 7. Weather depth | Hourly cloud+temp+wind+dir in score | Undisclosed, used in Sun Score | **Zonnie leads** | KNMI model not pinned |
| 8. Core features | Map+timeline+visit-window+filters | Same + shadow map overlay + Sun Paths routing | Medium | Overlay and routing absent |
| 9. Personalisation | Favourites + notifications (both present) | Smart notifications + explore section | Small | Explore section missing |
| 10. Community / UGC | None | Community-drawn polygons, social proof | Large | Entire layer absent |
| 11. B2B / monetisation | IAP wired, no venue dashboard | Business dashboard, analytics, promoted listings | Large | B2B layer absent |
| 12. Brand and design | Strong palette, good typography | Unknown — 90K downloads suggests credible | Unknown | App Store photography needs work |
| 13. Distribution | Submitted, no landing page, no press | #1 UK Lifestyle, established user base | Large | Marketing infrastructure absent |
| 14. Moats | 3D BAG, single-city depth, visit-window model | Global ambition dilutes Amsterdam depth | **Zonnie leads** | Network effects lag |

---

## 4. Prioritised Improvements

| # | Title | Why | Files Touched | Effort | Impact | Dependencies |
|---|---|---|---|---|---|---|
| 1 | **Fix the Fabric crash** — migrate from `react-native-maps` to `expo-maps` | NSRangeException kills the app on Fabric when many Markers mount simultaneously. Highest-severity engineering item. NOT a list key= issue — the list `keyExtractor` is already correct. The crash is in the maps library. | `src/components/ZonnieMap.tsx`, `package.json`, `app.config.ts` | L | High | None — do first |
| 2 | **Pin Open-Meteo to KNMI HARMONIE** — add `models=knmi_harmonie_arome_europe` to the fetch URL | One-line change. Credible claim: "Dutch national weather model, not a global blend." Higher resolution over NL than ECMWF. | `src/data/weather.ts` | S | Med | None |
| 3 | **Tree canopy from Bomenkaart** — fetch species/height/canopy per tree, add cylinder geometry to shadow engine | Tree shadows are material in Amsterdam (Vondelpark, canal-side, Jordaan). SunSeekr has no tree canopy either — unique accuracy claim. Source: maps.amsterdam.nl/bomen/ WFS, CC-BY. | New `scripts/fetch-bomenkaart-trees.py`, `src/engines/types.ts`, `src/engines/shadow.ts`, `src/data/buildings.ts` | L | High | Building pipeline already working; tree geometry is additive |
| 4 | **Missing venue filter fields** — `dogFriendly`, `laptopFriendly`, `canalSide`, `kidFriendly` in schema + UI chips | SunSeekr ships these exact filters. App Store reviews consistently ask for them. Without them, the filter section reads as incomplete. | `src/data/terraces.json`, `src/engines/types.ts`, `src/components/VenueTypeFilter.tsx`, `src/hooks/useScoredTerraces.ts` | M | High | Requires data entry or Places API inference for 1,009 venues |
| 5 | **B2B "verify uw terras" web form** — static form for Amsterdam horeca owners to claim a venue, upload a photo, confirm coords | Dual purpose: data quality + revenue seed. SunSeekr's only confirmed revenue. Implement as static form to Airtable initially — no dashboard code required yet. | External static form, `src/data/terraces.json` (add `claimedBy`), `src/components/TerraceDetailSheet.tsx` (claim CTA) | M | High | None |
| 6 | **Cycling routing — sunniest fietsroute** — query OpenRouteService for cycle paths, score each segment by sun exposure at the requested time | Structurally unique to NL/DK/DE. SunSeekr Sun Paths is roads-only and London-only. A bike-specific NL route tool is genuinely hard for them to replicate. | New `app/route.tsx`, `src/engines/routeScoring.ts`, `src/components/RouteMap.tsx` | L | High | Map library fix (#1) required first |
| 7 | **Live shadow overlay on map tiles** — pixel-shaded shadow layer updating with the time scrubber | The most visually impressive SunSeekr feature. Without it, the map looks like a POI dataset. | `src/components/ZonnieMap.tsx`, new `src/engines/shadowRaster.ts` | L | High | Map library fix (#1) hard prerequisite |
| 8 | **Venue terrace polygons** — `terracePolygon` field in terrace schema for top-200 venues | Point scoring over- or under-rates terraces depending on which corner of the building the coord lands near. Manual entry for top venues is the fastest path. | `src/data/terraces.json`, `src/engines/types.ts`, `src/engines/scoring.ts` | L | High | Manual authoring effort scales with venue count |
| 9 | **Crash reporting (Sentry)** — `@sentry/react-native`, init in `app/_layout.tsx` | Zero production observability. The Fabric crash was caught manually, not automatically. | `app/_layout.tsx`, `package.json` | S | High | None |
| 10 | **Dutch-language UI as default** — hard-code NL strings; English as secondary | "Zonnie" is a Dutch brand serving Amsterdam. All visible UI is currently in English. Simple to implement without a full i18n library for a single-city product. | All `.tsx` files with user-visible strings, App Store listing copy | M | Med | None |
| 11 | **Landing page** — zonnie.app, hero screenshot, App Store download link, 3-bullet copy | No landing page = nowhere to direct Reddit posts, press, and referral traffic. Takes 2-4 hours with any static site builder. | External | S | High | None |
| 12 | **App Store photography upgrade** — styled device frames, proper art direction, Dutch + English copy variants | Current screenshots appear to be raw screen recordings. This is the cheapest multiplier on downloads. | `assets/marketing/`, `scripts/compose-screenshots.ts` | M | High | Landing page copy (#11) can be recycled |
| 13 | **E2E tests — Maestro** for venue list scroll + pin tap + detail sheet | The list crash was caught by manual testing only. A Maestro flow would catch regressions automatically. | New `maestro/` directory | M | Med | Map library fix (#1) should land first |
| 14 | **Pre-computed daily exposure cache** — hourly in/out-sun per venue at first app open | 1,009 venues x 24 hours = 24,216 `computeSunScore` calls per filter change. Fine now; will become a bottleneck above ~2,000 venues. Profile first. | `src/hooks/useScoredTerraces.ts` | M | Med | Profiling prerequisite |

---

## 5. Defensible Advantages

**3D BAG building geometry.** Zonnie pre-computes 28,269 buildings with LiDAR-derived polygon footprints for all 1,009 venues. SunSeekr uses OSM heights (6.5% explicit coverage, 9m default elsewhere) and the road-midpoint projection hack that fails for rooftop, courtyard, canal-side, and park-facing terraces — which are precisely the most interesting Amsterdam terraces (Pllek, Hannekes Boom, Vondelpark cafes). This accuracy gap is structural: SunSeekr would need to rebuild their entire geometry pipeline city-by-city to match it.

**Visit-window scoring model.** "I will be there 14:00-17:00, where will be sunny?" is already shipped and is architecturally deeper than SunSeekr's "right now" model. Competitors could add a time slider, but the ranker behind it would still compute score at t=X rather than averaging across [X, Y] with shadow movement accounted for across the afternoon. This is worth promoting explicitly in the App Store description and onboarding.

**Single-city NL data stack depth.** 3D BAG (already), Bomenkaart (next), KNMI HARMONIE (one line of code), BAG venue registry, and hand-curated facing data for every terrace. No competitor has assembled this stack for Amsterdam specifically. Global competitors optimise for breadth; Zonnie optimises for accuracy in one city. The moat deepens the more Amsterdam-specific layers are added, and no competitor has the strategic incentive to replicate it.

---

## 6. Four-Week Sequencing Proposal

| Week | Theme | Items |
|---|---|---|
| **Week 1** — Stability + Observability | Stop the bleeding | #1 Fabric crash fix, #9 Sentry, #2 KNMI HARMONIE (10-min code change, credibility gain immediate) |
| **Week 2** — Distribution foundations | Build the funnel | #11 Landing page, #12 App Store screenshot upgrade, Dutch-first App Store description, file new App Store update |
| **Week 3** — Data and accuracy | Deepen the moat | #3 Bomenkaart tree canopy, #4 dog/laptop/canal/kid fields for top-200 venues, backfill via Places API |
| **Week 4** — Revenue seed + differentiation | Start the B2B loop | #5 B2B web form MVP, start #6 cycling routing engine (validate segment scoring before building the UI) |

Shadow overlay (#7) and terrace polygons (#8) are both L-effort items that depend on the map library fix being stable. Schedule for weeks 5-6.

---

## 7. Open Questions and Wrong Assumptions

**The brief assumed the NSRangeException was a list key= problem.** It is not. The code has `keyExtractor={(item) => String(item.terrace.id)}` — stable numeric IDs, no `key={index}` anywhere. The actual crash is documented in `app.config.ts`: it is a react-native-maps Fabric interop issue (`RCTLegacyViewManagerInteropComponentView`). The fix is a map library migration.

**The brief suggested replacing OSM building heights with 3D BAG.** This has already been done. `scripts/fetch-3dbag-buildings.py` exists and has been run — `buildings.json` contains 28,269 buildings all with polygon data and LiDAR heights. There is no OSM height problem to fix.

**"Direct venue-coordinate test instead of road-midpoint projection."** Already the implementation. Zonnie tests shadow at `terrace.lat / terrace.lng` directly. Road-midpoint projection is SunSeekr's hack, not Zonnie's.

**"Cloud-aware shadow simulation."** The brief asked whether cloud cover should affect shadow geometry. It should not and does not. Cloud cover attenuates the sun score globally (a multiplier on the altitude signal) but does not change geometric shadows — those are cast by solid objects. The existing implementation is physically correct. The brief was conflating two separate phenomena.

**Weather at venue level vs city level.** At Amsterdam's 20km diameter, city-level weather from a single Open-Meteo fetch is accurate enough. Micro-climate variation is not available from any NWP model at hourly resolution. Not a gap worth chasing.

**scoreToColor bug in `src/theme/tokens.ts`.** Both the "Mostly Shade" and "In Shadow" bands return `palette.cocoa`. The last band is unreachable — "In Shadow" venues get the same colour as "Mostly Shade." Low priority but a one-line fix.

---

## 8. Appendix: File-by-File Notes

| Path | Role | Notes |
|---|---|---|
| `app/_layout.tsx` | Root layout, store hydration, purchase configure | Entry point for Sentry init |
| `app/index.tsx` | Main screen — ZonnieMap + MainSheet composition | |
| `app/terrace/[id].tsx` | Deep link handler for widget to detail sheet | Clean — store dispatch + redirect, no rendering |
| `src/engines/solar.ts` | Solar position (JD to altitude/azimuth), sunrise/sunset hour helpers | Custom SPA port; no external dep; Amsterdam-calibrated |
| `src/engines/shadow.ts` | Shadow ray-cast engine; continuous coverage [0,1]; polygon + centroid paths | Strongest algorithmic asset. Tree canopy layer would go here. |
| `src/engines/scoring.ts` | Composite sun score; wind shelter; temperature factor; range score; best-window finder | `computeRangeScore` is the visit-window differentiator |
| `src/engines/types.ts` | Shared type definitions | `Building.poly` is the key field enabling polygon path |
| `src/data/terraces.json` | 1,009 venue records | No polygons; no dog/laptop/canal fields |
| `src/data/buildings.json` | 28,269 buildings, 30 per terrace | All have `poly`; sourced from 3D BAG |
| `src/data/buildings.ts` | Building data loader; per-terrace cache; procedural fallback | Procedural fallback is dead code now that 3D BAG data is populated |
| `src/data/weather.ts` | Open-Meteo fetch; 4 variables; 10s timeout | Add `models=knmi_harmonie_arome_europe` here |
| `src/components/ZonnieMap.tsx` | Map view; teardrop pins; 200-marker cap; locate-me | Fabric crash surfaces here. `PROVIDER_DEFAULT` = Apple Maps. |
| `src/components/TerraceList.tsx` | BottomSheetFlatList; stable `keyExtractor`; header with filters | `key` pattern is correct — not the crash source |
| `src/components/SunTimeline.tsx` | 576 sub-bar area chart; tap-to-focus; sunrise/sunset annotations | Strong feature, zero charting dependencies |
| `src/store/favoritesStore.ts` | AsyncStorage-persisted Set; free-tier limit 3; Pro unlimited | Solid |
| `src/store/areaStore.ts` | Region/category/favourites/matchMode/sortByDistance filters | `matchModeOnly` = World Cup outdoor TV filter |
| `src/store/purchaseStore.ts` | RevenueCat IAP; monthly/yearly/lifetime; hydrates on launch | Entitlement ID is "Zonnie Pro" — must match RevenueCat dashboard exactly |
| `src/notifications/scheduler.ts` | Daily "sunny tomorrow" local notification | Reschedules on every app open |
| `src/notifications/favouritesSunnyNotification.ts` | Per-favourite "going sunny" notifications; up to 5 | Runs full scoring engine per favourite per hour |
| `src/theme/tokens.ts` | Palette, fonts, spacing, `scoreToColor` | Bug: last two score bands both return `palette.cocoa` |
| `targets/zonnie-widget/` | Swift WidgetKit extension — top-3 sunniest terraces | Reads App Group JSON written by `src/widget/snapshot.ts` |
| `__tests__/` | 6 test files covering solar, shadow, scoring, buildings, forecast, terraces | Good engine coverage; no E2E; no crash reporting |
| `scripts/fetch-3dbag-buildings.py` | Python fetcher for 3D BAG polygon+height data | Already run; buildings.json is populated |
| `brand-assets/` | SVG icon and pin assets, palette reference | 70s sunset theme consistently applied |
| `BACKLOG.md` | Existing feature list | Some items are already shipped — this plan supersedes it for prioritisation |