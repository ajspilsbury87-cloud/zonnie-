import { create } from 'zustand';

import type { Region } from '@/src/data/regions';
import type { VenueCategory } from '@/src/data/categories';
import { useTimeStore } from '@/src/store/timeStore';

/**
 * Category-aware default visit window. When the user toggles a venue
 * category ON, we shift the time scrubber to that category's natural
 * hours — coffee shops live mornings, bars and restaurants live
 * afternoons/evenings. This addresses user-test feedback that coffee
 * shops appeared to rank "badly" at the default 12:00-17:00 window
 * (their morning peak was already over). The user can still scrub
 * manually after a category toggle; we only nudge the default once
 * per ON toggle.
 *
 * Same defaults for bar + restaurant — they share the afternoon
 * pattern. Coffee gets the morning slot.
 */
const CATEGORY_DEFAULT_WINDOW: Record<VenueCategory, readonly [number, number]> = {
  bar: [12, 17],
  restaurant: [12, 17],
  coffee: [9, 12],
};

interface AreaState {
  /**
   * Set of selected macro-regions (Jordaan / Zuid / Oost / West / Centrum /
   * Noord). Empty = "All" (no filter). `Set<Region>` so toggle is O(1) and
   * we replace the Set on every change for cheap referential equality.
   */
  selectedRegions: Set<Region>;
  /**
   * Selected venue categories (Café / Bar / Restaurant / Outdoor). Empty =
   * no category filter. OR semantics: a terrace passes if it matches ANY
   * selected category.
   */
  selectedCategories: Set<VenueCategory>;
  /**
   * When true, the ranked list and map markers are restricted to the user's
   * favorites (from `favoritesStore`). Composes with region/search/time
   * filters — they all AND together.
   */
  favoritesOnly: boolean;
  /**
   * When true, restrict to terraces with at least one outdoor TV screen
   * (`outdoorScreens > 0`). Designed for the World Cup 2026 launch
   * use case — "where do I watch the match in the sun?". ANDs with all
   * other filters.
   */
  matchModeOnly: boolean;
  toggle: (region: Region) => void;
  toggleCategory: (cat: VenueCategory) => void;
  setAll: (regions: Region[]) => void;
  clear: () => void;
  setFavoritesOnly: (on: boolean) => void;
  toggleFavoritesOnly: () => void;
  setMatchModeOnly: (on: boolean) => void;
  toggleMatchModeOnly: () => void;
}

export const useAreaStore = create<AreaState>((set, get) => ({
  selectedRegions: new Set<Region>(),
  selectedCategories: new Set<VenueCategory>(),
  favoritesOnly: false,
  matchModeOnly: false,
  toggle: (region) =>
    set((s) => {
      const next = new Set(s.selectedRegions);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return { selectedRegions: next };
    }),
  toggleCategory: (cat) =>
    set((s) => {
      const next = new Set(s.selectedCategories);
      const wasOn = next.has(cat);
      if (wasOn) next.delete(cat);
      else next.add(cat);
      // When the user adds (not removes) a category, nudge the visit
      // window to that category's natural hours. Cross-store call:
      // safe because both stores are top-level singletons, and the
      // user is allowed to override with the time scrubber after.
      if (!wasOn) {
        const [from, to] = CATEGORY_DEFAULT_WINDOW[cat];
        useTimeStore.getState().setRange(from, to);
      }
      return { selectedCategories: next };
    }),
  setAll: (regions) => set({ selectedRegions: new Set(regions) }),
  clear: () =>
    set({
      selectedRegions: new Set(),
      selectedCategories: new Set(),
      favoritesOnly: false,
      matchModeOnly: false,
    }),
  setFavoritesOnly: (on) => set({ favoritesOnly: on }),
  toggleFavoritesOnly: () => set({ favoritesOnly: !get().favoritesOnly }),
  setMatchModeOnly: (on) => set({ matchModeOnly: on }),
  toggleMatchModeOnly: () => set({ matchModeOnly: !get().matchModeOnly }),
}));
