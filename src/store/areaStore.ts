import { create } from 'zustand';

import type { Region } from '@/src/data/regions';
import type { VenueCategory } from '@/src/data/categories';

// v1.1.3: removed the category-aware time-window auto-shift. v1.1
// added it (Coffee → 9-12, Bar/Restaurant → 12-17) based on early
// user-test feedback. Real users hated that toggling a chip yanked
// the time scrubber away from "now" — most people open the app
// thinking "where can I sit NOW?" and a Coffee tap moving them to
// 9 AM (after lunch) felt broken. The single-hour "live sun" default
// is more intuitive. Users who want to plan for a different time
// scrub the slider manually, same as before this feature existed.

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
  /**
   * When true, sort order blends sun score with distance from the user's
   * current GPS position — nearest sunny terraces surface first.
   * Does NOT filter; all terraces remain visible, just reordered.
   * Falls back to pure sun-score sort if location is unavailable.
   */
  sortByDistance: boolean;
  toggle: (region: Region) => void;
  toggleCategory: (cat: VenueCategory) => void;
  setAll: (regions: Region[]) => void;
  clear: () => void;
  setFavoritesOnly: (on: boolean) => void;
  toggleFavoritesOnly: () => void;
  setMatchModeOnly: (on: boolean) => void;
  toggleMatchModeOnly: () => void;
  setSortByDistance: (on: boolean) => void;
  toggleSortByDistance: () => void;
}

export const useAreaStore = create<AreaState>((set, get) => ({
  selectedRegions: new Set<Region>(),
  selectedCategories: new Set<VenueCategory>(),
  favoritesOnly: false,
  matchModeOnly: false,
  sortByDistance: false,
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
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { selectedCategories: next };
    }),
  setAll: (regions) => set({ selectedRegions: new Set(regions) }),
  clear: () =>
    set({
      selectedRegions: new Set(),
      selectedCategories: new Set(),
      favoritesOnly: false,
      matchModeOnly: false,
      sortByDistance: false,
    }),
  setFavoritesOnly: (on) => set({ favoritesOnly: on }),
  toggleFavoritesOnly: () => set({ favoritesOnly: !get().favoritesOnly }),
  setMatchModeOnly: (on) => set({ matchModeOnly: on }),
  toggleMatchModeOnly: () => set({ matchModeOnly: !get().matchModeOnly }),
  setSortByDistance: (on) => set({ sortByDistance: on }),
  toggleSortByDistance: () => set({ sortByDistance: !get().sortByDistance }),
}));
