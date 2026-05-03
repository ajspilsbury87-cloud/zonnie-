import { create } from 'zustand';

import type { Region } from '@/src/data/regions';

interface AreaState {
  /**
   * Set of selected macro-regions (Jordaan / Zuid / Oost / West / Centrum /
   * Noord). Empty = "All" (no filter). `Set<Region>` so toggle is O(1) and
   * we replace the Set on every change for cheap referential equality.
   */
  selectedRegions: Set<Region>;
  toggle: (region: Region) => void;
  setAll: (regions: Region[]) => void;
  clear: () => void;
}

export const useAreaStore = create<AreaState>((set) => ({
  selectedRegions: new Set<Region>(),
  toggle: (region) =>
    set((s) => {
      const next = new Set(s.selectedRegions);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return { selectedRegions: next };
    }),
  setAll: (regions) => set({ selectedRegions: new Set(regions) }),
  clear: () => set({ selectedRegions: new Set() }),
}));
