# Metrics & Event Tracking

This document explains what user interactions are tracked in Zonnie, why, and how to review engagement data.

## Overview

Zonnie logs user interactions locally using `sunLogStore` (see `src/store/sunLogStore.ts`). All data stays on-device — there is no server, no new permission required, and no user account needed. The log is append-only with a rolling cap of 2,000 events (roughly 200 KB storage).

The store exists to enable future features like:
- **Daily Verdict**: personalized top-terrace summary
- **Sun Wrapped**: year-in-review stats
- **Terrace Streaks**: visit frequency patterns
- **Seasonal KPIs**: engagement with limited-time features like WorldPride

## Tracked Events

Each event in the log records:
- **ts**: Unix timestamp (milliseconds, `Date.now()`)
- **terraceId**: numeric ID matching the terrace dataset
- **action**: what the user did (see list below)
- **score** (optional): the sun score (0–1) at the moment of the action, if readily available

### Core Actions

| Action | Triggers | Use Case |
|--------|----------|----------|
| `open` | User taps a terrace card or map pin | Baseline engagement; frequency analysis |
| `favorite` | User taps the heart icon | Saved venues; preference patterns |
| `share` | User shares a terrace to another app | Social signaling; viral potential |
| `directions` | User taps "Get Directions" | Trip intent; conversion to visit |
| `sunrun_generate` | User generates a Sun Run summary (Phase 0) | Sun Run adoption; feature engagement |
| `sunrun_share` | User shares their Sun Run summary | Sun Run social reach |
| `wrapped_share` | User shares their Sun Wrapped year-in-review | Annual event engagement |
| `checkin` | User checks in at a terrace | Visit confirmation (future phase) |

### Pride Events (WorldPride 2026: 25 Jul – 8 Aug)

These are seasonal-moment-specific actions tied to the WorldPride Amsterdam 2026 feature.

| Action | Triggers | Rationale |
|--------|----------|-----------|
| `pride_spotlight_view` | User views the teaser or live pride spotlight card | Top-of-funnel awareness; reach |
| `pride_filter_apply` | User taps the pride spotlight to apply the parade-view filter | Filter adoption; intent to explore |
| `pride_terrace_open` | User opens a terrace from the pride-filtered view | Conversion; actual engagement with curated data |

## How to Review Metrics

### Local Testing (Development)

1. **Inspect the in-memory store** in the Expo dev session:
   ```javascript
   const store = useSunLogStore.getState();
   console.log('Events:', store.events);
   console.log('Distinct terraces:', store.distinctTerraceCount());
   ```

2. **Check AsyncStorage directly** (after testing a real interaction):
   ```
   // In DevTools or via @react-native-async-storage/async-storage
   AsyncStorage.getItem('zonnie:sunlog:v1').then(data => console.log(JSON.parse(data)))
   ```

3. **Filter to specific actions**:
   ```javascript
   const prideViews = store.events.filter(e => e.action === 'pride_spotlight_view');
   const prideConverted = store.events.filter(e => e.action === 'pride_terrace_open');
   console.log(`Conversion: ${prideConverted.length} / ${prideViews.length}`);
   ```

### TestFlight / Staging

- The app logs silently to AsyncStorage; no new UI surface is exposed.
- To inspect: use Xcode Console on an attached device, or export the device's application container via Xcode Organizer → Devices → your device → Download Container.
- Once exported, unzip and navigate to `AppData/Documents/` to find the app's AsyncStorage folder.

### Production (App Store)

- Since v1.3.0 (build #17, live 2026-06-29), production users are running the OTA-enabled build. Logs persist locally on their devices.
- **We do not have server-side logging yet**. Production insights require manual collection from beta testers or aggregation via app review surveys.
- Users can manually share their log if they opt in to feedback.

## Seasonal KPIs: WorldPride Example

For WorldPride Amsterdam 2026 (25 Jul – 8 Aug), track these metrics:

1. **Awareness (Spotlight)**: Count `pride_spotlight_view` events.
   - Baseline: How many unique users see the card?
   - Tracking: Watch the teaser window (22–25 Jul) vs. live window (25 Jul–8 Aug).

2. **Adoption (Filter)**: Count `pride_filter_apply` events.
   - Key ratio: `pride_filter_apply / pride_spotlight_view` = funnel conversion.
   - Strong conversion suggests compelling feature discovery.

3. **Engagement (Terrace Opens)**: Count `pride_terrace_open` events from the pride-filtered view.
   - Key ratio: `pride_terrace_open / pride_filter_apply` = filter-to-action conversion.
   - Informs whether the 137 curated parade-view terraces resonate or need refinement.

4. **Quality**: Examine score distribution of opened terraces.
   - Are users opening only high-score (sunny) terraces, or is the curation trusted for lower scores too?
   - Use the optional `score` field in events to segment.

## How Data Informs Future Seasonal Moments

The log creates a feedback loop:

- **Pattern recognition**: If pride conversion funnels are strong, replicate the teaser→live pattern for the next seasonal moment.
- **Dataset validation**: If very few terraces are opened from the 137 curated spots, revisit the curation logic or the proximity threshold (`PARADE_VIEW_MAX_M` in `src/data/pride.ts`).
- **Timing optimization**: Teaser window length (currently 3 days) can be tuned based on how many users convert early vs. on the final live day.
- **Feature template**: Each seasonal moment can re-use the same tracking actions if the pattern holds. New moments (e.g., King's Day, ADE, Marathon) add their own actions by the same naming convention: `[season]_spotlight_view`, `[season]_filter_apply`, `[season]_terrace_open`.

## Storage & Retention

- **Limit**: 2,000 events (FIFO cap in `sunLogStore`).
- **Lifespan**: Indefinite on-device until the user uninstalls or clears app data.
- **Backup**: Logs travel with the OS backup if the device is backed up (iCloud, cloud backup varies by Android OEM).

## Future Phases

Once we have server-side logging (post-v1.4), we can:
- Aggregate event logs from opt-in beta testers to build usage cohorts.
- A/B test seasonal feature variations (e.g., different teaser copy, curation filters).
- Build the Daily Verdict and Sun Wrapped features using the local log as the source of truth.
- Anonymously report event counts to analytics (e.g., "137k pride_spotlight_views globally") without transmitting individual user data.
