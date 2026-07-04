import { create } from 'zustand';

interface PanTarget {
  lat: number;
  lng: number;
}

/**
 * How much of the selected terrace's detail is showing.
 *
 *   'peek' — compact peek card floating over the map (AllTrails pattern).
 *            Set by tapping a map pin; the map stays visible behind it.
 *   'full' — the full TerraceDetailSheet. Set by tapping the peek card,
 *            or directly by list rows / landing cards / deep links, where
 *            the user has already committed to a specific terrace.
 */
export type SelectionStage = 'peek' | 'full';

interface SelectionState {
  /** Terrace ID currently selected (peek card or detail sheet), or null. */
  selectedId: number | null;
  /** Whether the selection shows as a peek card or the full detail sheet. */
  stage: SelectionStage;
  /**
   * One-shot pan request for the map: ZonnieMap watches this, animates to
   * the coords, and immediately clears it via `clearPanTo()`. We don't
   * couple "select" and "pan" because tapping a marker on the map shouldn't
   * pan (you're already looking at it) — only the detail sheet's
   * "Show on Map" action should.
   */
  panTo: PanTarget | null;
  /** Open the full detail sheet directly (list rows, deep links, handoff). */
  select: (id: number) => void;
  /** Show the compact peek card for a terrace (map pin tap). */
  peek: (id: number) => void;
  /** Promote the current peek to the full detail sheet. */
  expand: () => void;
  /**
   * Demote the full detail sheet back to the peek card, keeping the
   * selection (and the pin halo). Used when the user drags the full
   * sheet closed and by "Show on Map" — both mean "give me the map
   * back" rather than "I'm done with this terrace".
   */
  collapse: () => void;
  clear: () => void;
  setPanTo: (target: PanTarget) => void;
  clearPanTo: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: null,
  // Stage is meaningless while selectedId is null; 'peek' as the resting
  // value keeps TerraceDetailSheet's close-guard inert until a real
  // full-stage selection exists.
  stage: 'peek',
  panTo: null,
  select: (id) => set({ selectedId: id, stage: 'full' }),
  peek: (id) => set({ selectedId: id, stage: 'peek' }),
  expand: () => set({ stage: 'full' }),
  collapse: () => set({ stage: 'peek' }),
  clear: () => set({ selectedId: null, stage: 'peek' }),
  setPanTo: (target) => set({ panTo: target }),
  clearPanTo: () => set({ panTo: null }),
}));
