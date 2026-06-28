/**
 * sunsOutStore — persists the last Amsterdam date the "Sun's out" in-app
 * moment was shown, so it appears at most once per calendar day.
 *
 * Same hand-rolled AsyncStorage pattern as favoritesStore / sunLogStore
 * (no persist middleware — explicit, easy to reason about). The value is a
 * single 'YYYY-MM-DD' string. Hydrated lazily by the banner component before
 * it decides whether to show.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zonnie:sunsout:v1';

interface SunsOutState {
  /** Amsterdam date ('YYYY-MM-DD') the moment was last shown, or null. */
  lastShownDate: string | null;
  /** True once the persisted value has been loaded from AsyncStorage. */
  hydrated: boolean;
  /** Load the persisted date. Safe to call repeatedly; no-ops after success. */
  hydrate: () => Promise<void>;
  /** Record that the moment was shown on `dateStr` (optimistic + async persist). */
  markShownToday: (dateStr: string) => void;
}

export const useSunsOutStore = create<SunsOutState>((set, get) => ({
  lastShownDate: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        set({ lastShownDate: raw, hydrated: true });
        return;
      }
    } catch {
      // fall through to hydrated-with-null
    }
    set({ hydrated: true });
  },

  markShownToday: (dateStr) => {
    set({ lastShownDate: dateStr });
    AsyncStorage.setItem(STORAGE_KEY, dateStr).catch(() => {
      // best-effort — a lost write just means the moment may show again.
    });
  },
}));
