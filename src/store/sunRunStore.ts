/**
 * sunRunStore — open/close state for the Sun Run sheet (SPEC-sun-run-phase0).
 * Same minimal pattern as crawlStore's visibility flag: the sheet owns all
 * its input state locally; this store only exists so entry points elsewhere
 * (Perfect-For card on the landing page) can summon it.
 */

import { create } from 'zustand';

interface SunRunState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useSunRunStore = create<SunRunState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
