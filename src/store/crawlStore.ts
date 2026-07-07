/**
 * crawlStore — drives the "Chase the Sun" crawl sheet.
 *
 * State is ephemeral (no persistence) because a crawl plan is only
 * meaningful for today's sun position. The plan is regenerated on every
 * `start()` call, which re-reads the current weather / date from the caller.
 *
 * Zustand pattern: same shape as selectionStore / favoritesStore. Actions
 * call `generateSunCrawl` directly and update state in one `set()` call.
 *
 * Shuffle behaviour:
 *   The current plan's non-origin stop IDs are passed as `excludeIds` so
 *   the engine is forced to pick a different route. If no alternative plan
 *   exists (e.g. there truly are only 2 terraces nearby) the current plan
 *   is kept intact.
 */

import { create } from 'zustand';

import { generateSunCrawl } from '@/src/engines/crawl';
import type { CrawlPlan } from '@/src/engines/crawl';
import type { Weather, WeatherProfile } from '@/src/engines/types';
import { nowAmsterdamHourFloat, selectedDateStr, todayAmsterdamDateStr, useTimeStore } from '@/src/store/timeStore';

interface CrawlState {
  /** The current crawl plan, or null when none has been generated yet. */
  plan: CrawlPlan | null;
  /** The origin terrace ID for the current plan. Kept so Shuffle can regenerate from the same origin. */
  originId: number | null;
  /** Whether the ChaseTheSunSheet is visible. */
  isOpen: boolean;
  /**
   * The non-origin stop IDs from the last Shuffle exclusion. We accumulate
   * these so repeated Shuffles keep getting new routes (not just swapping
   * between the same two plans). Reset on `start()`.
   */
  lastExcluded: number[];

  /**
   * Generate a plan starting at `originId`. If the plan is non-null,
   * sets plan + opens the sheet. If null (e.g. origin not sunny at
   * startHour, or no walkable neighbours), sets plan=null and does NOT
   * open the sheet — caller should show a message.
   */
  start: (
    originId: number,
    dateStr: string,
    weatherProfile: WeatherProfile,
    hourlyWeather?: readonly (Weather | undefined)[],
  ) => void;

  /**
   * Regenerate the plan from the same origin, excluding the current plan's
   * non-origin stop IDs (accumulated across prior shuffles). If the new plan
   * is null, keep the current plan unchanged.
   */
  shuffle: (
    dateStr: string,
    weatherProfile: WeatherProfile,
    hourlyWeather?: readonly (Weather | undefined)[],
  ) => void;

  /** Close the sheet. Plan is cleared too so the next `start()` starts fresh. */
  close: () => void;
}

/**
 * Crawl start hour: "now" (clamped to daytime 8-21) when planning today —
 * the engine's default 15:00 sent evening users routes whose meet time was
 * hours in the past. Future dates use the picker's window start.
 */
function crawlStartHour(dateStr: string): number {
  if (dateStr === todayAmsterdamDateStr()) {
    return Math.min(21, Math.max(8, Math.floor(nowAmsterdamHourFloat())));
  }
  // Future date. Use the picker's window start when the user actually
  // selected that date; via the post-sunset pivot the store still says
  // "today" with a stale evening window, so fall back to the same
  // representative afternoon the landing/Sun Run pivots use.
  const { dateOffset, fromHour } = useTimeStore.getState();
  const h = selectedDateStr(dateOffset) === dateStr ? fromHour : 13;
  return Math.min(21, Math.max(8, h));
}

export const useCrawlStore = create<CrawlState>((set, get) => ({
  plan: null,
  originId: null,
  isOpen: false,
  lastExcluded: [],

  start: (originId, dateStr, weatherProfile, hourlyWeather) => {
    const plan = generateSunCrawl(originId, dateStr, weatherProfile, hourlyWeather, {
      startHour: crawlStartHour(dateStr),
    });
    if (plan !== null) {
      set({
        plan,
        originId,
        isOpen: true,
        // Reset accumulated exclusions whenever we start a fresh crawl.
        lastExcluded: [],
      });
    } else {
      // Engine returned null — not viable. Don't open; let caller handle it.
      set({ plan: null, originId, isOpen: false, lastExcluded: [] });
    }
  },

  shuffle: (dateStr, weatherProfile, hourlyWeather) => {
    const { plan, originId, lastExcluded } = get();
    if (originId === null) return;

    // Accumulate the current plan's non-origin stop IDs to force a new route.
    // Stop 0 is the origin — we never exclude it (it's where the user is).
    const currentNonOriginIds: number[] =
      plan != null
        ? plan.stops.slice(1).map((s) => s.terrace.id)
        : [];

    // Merge with previously excluded IDs so repeated shuffles keep diverging.
    const excludeIds = [...new Set([...lastExcluded, ...currentNonOriginIds])];

    const newPlan = generateSunCrawl(originId, dateStr, weatherProfile, hourlyWeather, {
      excludeIds,
      startHour: crawlStartHour(dateStr),
    });

    if (newPlan !== null) {
      set({ plan: newPlan, lastExcluded: excludeIds });
    }
    // If null: keep current plan intact (no-op for the user).
  },

  // Keep `plan` through the dismiss animation — clearing it here blanked the
  // sheet's content mid-slide. start() always sets a fresh plan on open.
  close: () => set({ isOpen: false }),
}));
