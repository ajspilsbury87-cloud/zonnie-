# Morning Status — 2026-05-05

> Andy went to bed around 22:00 last night with permission for me to develop autonomously and update him in the morning. Here's what happened.

---

## TL;DR

✅ **Five new features built, tested, OTA'd to your phone.**
🔬 **Crash root cause found and documented** — it's a confirmed Fabric / `react-native-maps` v1 bug, fix is one of three concrete paths.
⚠️ **Tried to ship a permanent fix overnight (disable new architecture + new build); EAS Build pod-install kept failing with no actionable error. Reverted; OTA'd the JS-only features instead.**

**To pick up the new features on your phone:** force-quit Zonnie, reopen, force-quit again, reopen.

The crash will still happen because the latest OTA is on the same `newArchEnabled: true` binary. **The features don't fix the crash; they're additive.** Crash fix is morning work — see "Open work: crash" below.

---

## What's new on your phone after the OTA reload

### 1. Favorites
- ♥ Heart toggle in the detail sheet header
- ♥ Saved chip in the neighborhood filter row — shows count, tap to filter the list/map to your saves
- AsyncStorage-persisted, survives app restarts
- Source: `src/store/favoritesStore.ts`

### 2. Geolocate-on-launch
- App asks for foreground location permission on first open
- If granted **AND you're inside Amsterdam metro**, map auto-recenters to you with a tighter zoom (~1km radius)
- If denied or outside Amsterdam, defaults to the city centroid (so a tester in another country doesn't see an off-screen blue dot)
- Source: `src/hooks/useUserLocation.ts`

### 3. Wind-shelter scoring (Tier 2 differentiation play — none of the 3 competitors do this)
- Open-Meteo fetch now also pulls hourly wind speed + direction
- Score formula gets a final multiplier: terraces facing INTO the wind take up to 15% penalty (only above 8 km/h, capped); terraces sheltered by their building behind them take none
- Source: `src/engines/scoring.ts#windShelterFactor` — 6 new unit tests cover the math (sheltered/exposed/calm/extreme cases). 51/51 tests pass.

### 4. Detail-sheet info chips below the sun timeline
- **Sun trend** — ↑ Rising / → Holding / ↓ Falling, vs the hour before your visit window starts. Helps decide between two terraces with the same average — pick the rising one.
- **Wind summary** — avg km/h + 8-point compass for the visit window. 💨 above 12 km/h, 🌬️ above 25.
- **✓ Verified by Zonnie** — relative timestamp from the curation log ("Verified 2 weeks ago"). Visible curation moat over Sun Seekr / Coffee in the Sun (stale POI scrapes) and Seats in the Sun (crowdsourced, often-closed listings).

### 5. ErrorBoundaries on each top-level surface
- Render errors in the Map / MainSheet / DetailSheet now show a "Something went wrong" card with the error message and a Try again button instead of unmounting silently. **Native crashes still bypass this** — it only helps for JS errors.

---

## Quality gates (all green)

- `npm run typecheck` — clean
- `npm test` — **51 / 51 tests passing** (6 new wind-shelter tests added)
- `git log --oneline -10` shows the night's commits ending at `7d2f880` (the OTA push commit)

---

## Open work: the crash

**Crash log analysis (first time we have actual data):**
```
NSRangeException: -[__NSArrayM insertObject:atIndex:]: index 65 beyond bounds [0..63]
in -[RCTLegacyViewManagerInteropComponentView finalizeUpdates:]
```

That's a known **Fabric (new architecture) bug** in `react-native-maps` 1.20.1 — the legacy view manager interop's subview index gets out of sync when many markers' mount transactions land in one tick. Affects both `image` and `pinColor` markers. Bug is in the mounting layer, not in our marker rendering, so all the marker-side fixes I tried earlier in the week (memoization, `tracksViewChanges`, marker count caps) couldn't fully resolve it.

**Fix options, ranked:**

1. **Upgrade `react-native-maps` to v2+.** v2 has improved Fabric support. Probably resolves it but I can't confirm without testing on device. ~30 min if no API breakage.
2. **Migrate to `expo-maps`.** Expo's official replacement, native Fabric components, no legacy interop path. Bigger refactor (different API). Most reliable long-term.
3. **Disable `newArchEnabled` + rebuild.** Routes through old Paper architecture which lacks the crashing code path. Tried this overnight — EAS Build's pod-install phase failed with "Unknown error" twice (no actionable detail in the log). Probably an SDK 54 + old-arch incompatibility somewhere in our deps. Worth a third attempt with a fresh prebuild and `--clear-cache` later, but I'd try options 1 or 2 first.

I left `app.config.ts` with `newArchEnabled: true` and a clear comment pointing at the three options.

---

## What's queued in BACKLOG.md but not yet built

After the crash is fixed, the next cluster of features that would lift Zonnie towards parity / differentiation (in priority order):

1. Pin color/size legibility QA (you reported this pre-crash)
2. Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in build env so the Places card actually populates on the detail sheet
3. Re-validate the 94 unsourced terraces (already-written script + needs the API key)
4. Import top 200–300 from `scripts/competitor-research/venues-not-in-zonnie.json` (the Seats-in-the-Sun scrape) → ~600 verified terraces for App Store positioning
5. Home-screen widget + share-a-terrace card (Coffee in the Sun's Pro features)
6. App Store Connect setup, screenshots, privacy policy, TestFlight

---

## Files added or changed overnight

```
+ CONTEXT-RESET.md                  Self-contained doc for 1M-context handoff
+ MORNING-STATUS.md                 This file
+ src/store/favoritesStore.ts       AsyncStorage-persisted Set<terraceId>
+ src/hooks/useUserLocation.ts      One-shot foreground-permission location fix

M app/_layout.tsx                   Hydrate favorites on launch
M src/components/TerraceDetailSheet.tsx  Heart toggle + sun-trend / wind / verified chips
M src/components/NeighborhoodFilter.tsx  ♥ Saved chip
M src/components/ZonnieMap.tsx      Auto-recenter on user, in-bbox blue dot
M src/store/areaStore.ts            favoritesOnly toggle
M src/hooks/useScoredTerraces.ts    Filter by favorites
M src/engines/scoring.ts            windShelterFactor + applied to final score
M src/engines/types.ts              Weather: + windSpeed + windDirection
M src/data/weather.ts               Open-Meteo: + wind_speed_10m + wind_direction_10m
M __tests__/scoring.test.ts         6 new wind-shelter tests
M app.config.ts                     expo-location plugin; newArchEnabled comment
M package.json                      + expo-location + async-storage
```

---

## Recommended morning sequence

1. **Test the OTA** — force-quit + reopen Zonnie twice. Open a detail sheet on any terrace. You should see: heart toggle, info chips below the timeline, geolocation prompt the first time you open the app.
2. **Pick a crash fix path.** My recommendation: try option 1 first (upgrade `react-native-maps` to v2). 30 min experiment. If that doesn't work or breaks the API, fall back to option 2 (`expo-maps` migration).
3. After the crash is fixed and you have a stable build: come back to the BACKLOG and decide between coverage (import competitor venues) vs polish (widgets, share, App Store setup).

If you want me to do option 1 or 2 next session, just say "fix the crash with option 1" or "migrate to expo-maps". Both are repo-wide work that's straightforward to start.

Sleep well.
