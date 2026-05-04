import { create } from 'zustand';

import type { Region } from '@/src/data/regions';

interface AreaState {
  /**
   * Set of selected macro-regions (Jordaan / Zuid / Oost / West / Centrum /
   * Noord). Empty = "All" (no filter). `Set<Region>` so toggle is O(1) and
   * we replace the Set on every change for cheap referential equality.
   */
  selectedRegions: Set<Region>;
  /**
   * When true, the ranked list and map markers are restricted to the user's
   * favorites (from `favoritesStore`). Composes with region/search/time
   * filters — they all AND together.
   */
  favoritesOnly: boolean;
  toggle: (region: Region) => void;
  setAll: (regions: Region[]) => void;
  clear: () => void;
  setFavoritesOnly: (on: boolean) => void;
  toggleFavoritesOnly: () => void;
}

export const useAreaStore = create<AreaState>((set, get) => ({
  selectedRegions: new Set<Region>(),
  favoritesOnly: false,
  toggle: (region) =>
    set((s) => {
      const next = new Set(s.selectedRegions);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return { selectedRegions: next };
    }),
  setAll: (regions) => set({ selectedRegions: new Set(regions) }),
  clear: () => set({ selectedRegions: new Set(), favoritesOnly: false }),
  setFavoritesOnly: (on) => set({ favoritesOnly: on }),
  toggleFavoritesOnly: () => set({ favoritesOnly: !get().favoritesOnly }),
}));
