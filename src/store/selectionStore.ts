import { create } from 'zustand';

interface PanTarget {
  lat: number;
  lng: number;
}

interface SelectionState {
  /** Terrace ID currently shown in the detail sheet, or null when closed. */
  selectedId: number | null;
  /**
   * One-shot pan request for the map: ZonnieMap watches this, animates to
   * the coords, and immediately clears it via `clearPanTo()`. We don't
   * couple "select" and "pan" because tapping a marker on the map shouldn't
   * pan (you're already looking at it) — only the detail sheet's
   * "Show on Map" action should.
   */
  panTo: PanTarget | null;
  select: (id: number) => void;
  clear: () => void;
  setPanTo: (target: PanTarget) => void;
  clearPanTo: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: null,
  panTo: null,
  select: (id) => set({ selectedId: id }),
  clear: () => set({ selectedId: null }),
  setPanTo: (target) => set({ panTo: target }),
  clearPanTo: () => set({ panTo: null }),
}));
