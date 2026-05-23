/**
 * Language preference store — persisted so the user's choice survives
 * app restarts. Defaults to Dutch ('nl'), the primary Amsterdam market.
 *
 * Switch language at any time via the 🌐 button in MoreFiltersToggle,
 * or on first run via the language-picker slide in OnboardingIntro.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'nl' | 'en';

interface LanguageState {
  lang: Language;
  setLang: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      lang: 'nl',
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'language-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
