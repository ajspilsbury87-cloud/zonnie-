/**
 * Shadow-overlay store — single boolean that gates the Pro map overlay.
 *
 * `shadowEnabled` is toggled by the "Show shadows" button inside
 * `TimeRangeFineTune`. `ZonnieMap` reads it and renders (or hides)
 * the `ShadowOverlay` component accordingly.
 *
 * Deliberately not persisted: the overlay is a one-session exploration
 * tool. Leaving it on by default would slow cold start and surprise
 * returning users who forgot they had it on.
 */

import { create } from 'zustand';

interface ShadowState {
  shadowEnabled: boolean;
  toggleShadow: () => void;
  /** Explicit setter — useful when toggling to off on Pro downgrade. */
  setShadowEnabled: (enabled: boolean) => void;
}

export const useShadowStore = create<ShadowState>((set) => ({
  shadowEnabled: false,
  toggleShadow: () => set((s) => ({ shadowEnabled: !s.shadowEnabled })),
  setShadowEnabled: (enabled) => set({ shadowEnabled: enabled }),
}));
