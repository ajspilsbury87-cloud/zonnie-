# Seasonal Moments

Seasonal moments are limited-time, date-gated curated lenses over the existing terrace dataset. They celebrate specific events and create urgency through a teaser→live pattern.

## Pattern & Design

### Why Seasonal Moments

1. **Honest curation**: We don't claim venues host events. We curate by proximity and the user decides.
2. **No new data**: Terraces are filtered from the existing dataset; no new entries are added.
3. **Date-gated**: Windows close automatically (pure date logic, no manual toggling needed).
4. **Low maintenance**: Pure functions mean we can unit-test without mocks and auto-retire without code changes.

### The Teaser → Live Flow

1. **Teaser Window** (3 days before start): A spotlight card appears with date, headline, and a link. This creates awareness and lets users wish-list.
2. **Live Window** (start date through end date): The spotlight card unlocks a dedicated filter; users can explore all curated terraces for the event.
3. **Auto-Retire** (after end date): The filter vanishes; normal view returns. No cleanup required.

### Implementation Template

Each seasonal moment implements three things:

1. **Date functions** (in `src/data/[season].ts`):
   ```typescript
   export function isSeasonLive(dateStr: string): boolean { /* ... */ }
   export function isSeasonTeaser(dateStr: string): boolean { /* ... */ }
   ```

2. **Teaser & Live UI** (in relevant screens):
   - Teaser card on the home screen (conditional on `isSeasonTeaser()`)
   - Live filter badge/tab (conditional on `isSeasonLive()`)

3. **Tracking** (via `sunLogStore`):
   - `[season]_spotlight_view` — when teaser/card is visible
   - `[season]_filter_apply` — when user taps to explore
   - `[season]_terrace_open` — when they open a terrace from the filtered view

## Current Moments

### World Cup 2026 (Retired)

- **Window**: 21 Nov 2025 – 19 Jul 2026
- **Data**: `src/data/worldcup.ts`
- **Scope**: 72 terraces within 300m of match venues
- **Status**: Retired (auto-expired 2026-07-19); code kept for reference

### WorldPride Amsterdam 2026

- **Window**: 25 Jul – 8 Aug 2026
- **Teaser**: 22 Jul – 24 Jul 2026 (hides when the live window opens on the 25th)
- **Data**: `src/data/pride.ts`
- **Scope**: 137 terraces within 130m (`PARADE_VIEW_MAX_M`) of the Canal Parade route (Oosterdok → Nieuwe Herengracht → Amstel → Prinsengracht → Westerdok)
- **Canal Parade Day**: 1 Aug 2026, 12:00–18:00 (parade itself; we curate geography, not logistics)
- **Tracking**: Pride events in `sunLogStore` (see `docs/METRICS.md` for KPIs)

## Next Up: October 2026 double-header (planned)

Both October candidates land in the same month, so they can share one build/release cycle. **Recommendation: ship the Marathon moment first** — it is route-based, so it reuses the pride.ts polyline+proximity pattern almost verbatim; ADE is venue-based and needs a curation decision.

### Amsterdam Marathon 2026 (recommended next)

- **Date**: mid-Oct 2026 — confirm exact race day at tcsamsterdammarathon.nl before building
- **Teaser**: 3 days before race day (same pattern as pride)
- **Scope**: terraces within ~130m of the route polyline — Olympic Stadium → Vondelpark → Amstel out-and-back. Cheer-from-a-terrace framing; honest proximity claim, same as the parade.
- **Effort**: small — copy `pride.ts`, swap the polyline + dates, wire the same teaser/spotlight/filter UI and `marathon_*` events.

### Amsterdam Dance Event (ADE) 2026

- **Date**: 3rd week of Oct 2026 (Wed–Sun) — confirm at amsterdam-dance-event.nl
- **Teaser**: 3 days before opening day
- **Scope**: TBD — venue-proximity curation only works once the venue list is out; alternative is a "sunny daytime recovery terraces" angle (ADE is a night event; the daytime lens is the blue-ocean angle)
- **Open decision**: proximity-to-venues vs. daytime-recovery framing — decide when the 2026 venue lineup publishes (September)

### King's Day 2027

- **Date**: 27 Apr 2027
- **Teaser**: 24 Apr 2027 onward
- **Scope**: Amsterdam city-wide (no geographic filter, just a celebration layer)
- **Candidate**: Broad terrace appeal; fewer geo-constraints than parade-based moments

## Adding a New Seasonal Moment

### Minimal Checklist

1. **Create `src/data/[season].ts`**:
   - Define `[SEASON]_START`, `[SEASON]_END` constants (yyyy-MM-dd strings)
   - Implement `is[Season]Live()` and `is[Season]Teaser()` date functions
   - Define the geography: route polyline, proximity threshold in meters, resulting terrace count
   - Document why the threshold was chosen (e.g., "parade route ±250m for sight lines")

2. **Update the dataset**:
   - If needed, add metadata to terraces (e.g., `pride: true` or `season_tags: ['pride']`)
   - Or compute the filter at runtime using the proximity function (cleaner; no data mutation)

3. **Add tracking actions** (in `sunLogStore`):
   - Add `[season]_spotlight_view`, `[season]_filter_apply`, `[season]_terrace_open` to the `action` union

4. **Wire up the UI**:
   - Teaser card on home screen (conditional on `isSeasonTeaser()`)
   - Live filter on map / list screens (conditional on `isSeasonLive()`)
   - Call `useSunLogStore.getState().log()` on user actions

5. **Test the window**:
   - Mock `Date.now()` or change device date to verify teaser appears 3 days before start
   - Verify filter applies exactly on the start date
   - Verify both vanish after the end date

6. **Announce & iterate**:
   - Update `docs/SEASONAL-MOMENTS.md` with the new moment
   - Plan social/in-app messaging (teaser copy, announcement date)
   - Monitor KPIs in `docs/METRICS.md` during the live window

## Data Files Reference

- `src/data/worldcup.ts` — route polyline + proximity logic (reference; retired)
- `src/data/pride.ts` — Canal Parade polyline + parade-view terrace curation

## See Also

- `docs/METRICS.md` — how to track and interpret seasonal moment KPIs
- `SPEC-sun-run-phase0.md` — related pattern for another limited-time feature (Sun Run)
