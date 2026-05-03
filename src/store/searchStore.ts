import { create } from 'zustand';

interface SearchState {
  /** Free-text query — matched case-insensitively against name, area, vibe, address. */
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  clear: () => set({ query: '' }),
}));
