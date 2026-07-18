/**
 * sunStatsStore — open/close state for the "My sun summer" sheet
 * (Phase A of the community plan). Mirrors sunRunStore's minimal pattern.
 */

import { create } from 'zustand';

interface SunStatsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useSunStatsStore = create<SunStatsState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
