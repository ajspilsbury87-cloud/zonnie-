import { create } from 'zustand';

interface LandingState {
  /** Whether the Home overlay is currently visible. Starts true on every app launch. */
  visible: boolean;
  /** Whether the intro animation has already played this app session. */
  introPlayed: boolean;
  /** Show the Home overlay (e.g. from the home button on the map). */
  show: () => void;
  /** Hide the Home overlay (e.g. "See all terraces" CTA). */
  hide: () => void;
  /** Mark the intro animation as played — called once at the end of the first run. */
  markIntroPlayed: () => void;
}

export const useLandingStore = create<LandingState>((set) => ({
  visible: true,
  introPlayed: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  markIntroPlayed: () => set({ introPlayed: true }),
}));
