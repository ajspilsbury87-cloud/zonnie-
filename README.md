# Zonnie — Terrace Sun Forecaster

Zonnie is an Expo-based iOS and Android app that forecasts sun exposure at Amsterdam's outdoor terraces. It combines live weather data with terrace geography to help users find the perfect sunny spot.

## Features

- **Real-time sun scoring**: Calculates sun exposure for 1000+ terraces using sky geometry and cloud cover
- **Interactive map**: Explore terraces with sun pins; tap for detailed views, directions, and more
- **Favorites & Saves**: Build a personal shortlist of favorite sunny spots
- **Sun Run**: Generate a personalized tour of top-ranked terraces (Phase 0)
- **Seasonal Moments**: Limited-time curated layers (e.g., WorldPride Amsterdam 2026)
- **Engagement Tracking**: Silent, on-device event log (no server, no account required)

## Seasonal Moments: WorldPride 2026

**WorldPride Amsterdam runs 25 Jul – 8 Aug 2026.** Zonnie features 137 curated terraces within 250m of the Canal Parade route.

- **Teaser window** (22–25 Jul): Spotlight card with event info
- **Live window** (25 Jul–8 Aug): Dedicated pride filter to explore parade-view terraces
- **Canal Parade day** (1 Aug): Saturday 12:00–18:00 (Amsterdam Pride official)

The curation is computed by geography alone — we measure proximity, not claim events. See `src/data/pride.ts` and `docs/SEASONAL-MOMENTS.md` for details.

## Development

### Get started

1. Install dependencies

   ```bash
   pnpm install
   ```

2. Start the app

   ```bash
   pnpm start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

In the output, you'll find options to open the app in a development build, emulator, simulator, or Expo Go.

### Project Structure

- `app/` — Expo Router screens (file-based routing)
- `src/store/` — Zustand stores (sun log, favorites, weather cache)
- `src/data/` — Dataset and seasonal moment definitions
  - `terraces.json` — 1000+ terrace entries (id, coordinates, name, facing)
  - `pride.ts` — WorldPride geometry & filtering (see `src/engines/scoresTerrace.ts` for proximity logic)
  - `worldcup.ts` — World Cup 2026 moment (retired; reference only)
- `src/engines/` — Core scoring, geolocation, and business logic
- `docs/` — Project documentation
  - `METRICS.md` — Event tracking & seasonal KPI guidance
  - `SEASONAL-MOMENTS.md` — Pattern for limited-time features
  - `ALGORITHM-VALIDATION.md` — Sky geometry & scoring validation

### Key Files

| File | Purpose |
|------|---------|
| `src/store/sunLogStore.ts` | On-device event log (open, favorite, pride_spotlight_view, etc.) |
| `src/data/pride.ts` | WorldPride window & parade-route polyline |
| `src/engines/scoresTerrace.ts` | Sun score calculation (geometry + weather) |
| `docs/METRICS.md` | How to interpret usage data & seasonal KPIs |

## Testing

### Development Workflow

- Hot reload: Press `r` in the terminal
- Clear cache: Press `c` in the terminal
- Test device date: Use your device's dev settings or simulator controls

### Seasonal Moment Testing

To test a seasonal moment (e.g., WorldPride teaser/live transitions):
1. Change your device's date to the teaser window (22–25 Jul 2026)
2. Verify the spotlight card appears
3. Verify it changes on the live start date (25 Jul)
4. Verify both vanish after the end date (8 Aug)

Dates are checked against `dateStr` (yyyy-MM-dd ISO string); no server sync needed.

## Metrics & Analytics

Zonnie logs user interactions locally:

- **No server**: All data stays on-device; no account required
- **Event types**: open, favorite, share, directions, sunrun_generate, sunrun_share, wrapped_share, checkin, pride_spotlight_view, pride_filter_apply, pride_terrace_open
- **Storage**: 2,000-event rolling cap (~200 KB)
- **Purpose**: Powers daily verdict, Sun Wrapped, and seasonal KPI tracking

See `docs/METRICS.md` for detailed KPIs and how to review event data.

## Learn More

- [Expo documentation](https://expo.dev/)
- **Project documentation**: See `docs/` folder for architecture, metrics, and seasonal moments
- **Dataset reference**: `src/data/pride.ts` defines the 137 parade-view terraces and date windows

## License

Proprietary.
