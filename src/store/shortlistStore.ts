/**
 * Shortlist store — ephemeral, NOT persisted.
 *
 * Holds the 2–3 terraces the user is building for a "Terras? ☀️" group vote.
 * Lives only in memory: once the user shares (or cancels), the state is gone.
 * This is intentional — a shortlist is a one-shot action, not something to
 * accumulate between sessions.
 *
 * Cap policy: FIFO — if the list already has MAX_SHORTLIST items and the user
 * selects another, the OLDEST item is dropped to make room. This matches how
 * multi-select behaves on iOS Photos and is more forgiving than a hard reject
 * (which would confuse users as to "why didn't that tap do anything?").
 * The floating bar's count badge makes the effective cap obvious in real time.
 *
 * `isSelecting`: true while the user is actively picking terraces. The list UI
 * shows checkmarks and the floating bar while this is true. Entering selection
 * mode (long-press on a row) flips this on; Cancel or Share flips it off.
 */

import { create } from 'zustand';

export const MAX_SHORTLIST = 3;

export interface ShortlistState {
  /** Terrace IDs in selection order (oldest first). Max MAX_SHORTLIST items. */
  selectedIds: number[];
  /** True while the user is actively picking terraces. */
  isSelecting: boolean;
  /**
   * Toggle a terrace in/out of the shortlist.
   * - If already selected: removes it.
   * - If not selected and under cap: adds it.
   * - If not selected and AT cap: drops the oldest (FIFO), adds the new one.
   */
  toggle: (id: number) => void;
  /** Clear the selection AND exit selecting mode. */
  clear: () => void;
  /** Enter selection mode (call on first long-press + select). */
  enterSelecting: () => void;
}

export const useShortlistStore = create<ShortlistState>((set, get) => ({
  selectedIds: [],
  isSelecting: false,

  toggle: (id) => {
    const current = get().selectedIds;

    if (current.includes(id)) {
      // Remove it — always succeeds.
      set({ selectedIds: current.filter((x) => x !== id) });
      return;
    }

    if (current.length < MAX_SHORTLIST) {
      // Under cap — just append.
      set({ selectedIds: [...current, id] });
    } else {
      // At cap — drop oldest (index 0) and append new. FIFO.
      set({ selectedIds: [...current.slice(1), id] });
    }
  },

  clear: () => set({ selectedIds: [], isSelecting: false }),

  enterSelecting: () => set({ isSelecting: true }),
}));
