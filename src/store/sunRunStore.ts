/**
 * sunRunStore — open/close state for the Sun Run sheet (SPEC-sun-run-phase0).
 * The sheet is summoned FROM a terrace detail card: that terrace becomes the
 * run's start point, carried here as `originId`. The sheet owns all other
 * input state locally.
 */

import { create } from 'zustand';

interface SunRunState {
  isOpen: boolean;
  /** Terrace the run starts from; null = no fixed start (fallback mode). */
  originId: number | null;
  open: (originId?: number) => void;
  close: () => void;
}

export const useSunRunStore = create<SunRunState>((set) => ({
  isOpen: false,
  originId: null,
  open: (originId) => set({ isOpen: true, originId: originId ?? null }),
  close: () => set({ isOpen: false }),
}));
