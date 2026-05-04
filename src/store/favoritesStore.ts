/**
 * Favorites — terraces the user has saved.
 *
 * Persisted to AsyncStorage so the list survives app restarts. Stored as
 * a Set of terrace IDs; the actual terrace data is looked up from
 * `TERRACES` at use time so stale-cache concerns don't apply.
 *
 * Behaviour:
 *   - `toggle(id)` flips membership and writes async; UI updates
 *     optimistically.
 *   - `hydrate()` is called once at app launch by `app/_layout.tsx` to
 *     load the persisted set. Until it resolves, `selectedIds` is empty
 *     — that's fine; first paint never has favorites yet anyway.
 *   - Storage key is namespaced (`zonnie:favorites:v1`) so a future
 *     schema change can be migrated without touching v1 data.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zonnie:favorites:v1';

interface FavoritesState {
  /** Terrace IDs the user has favorited. */
  favoriteIds: Set<number>;
  /** True after the persisted set has been loaded from disk. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (id: number) => void;
  isFavorite: (id: number) => boolean;
  clear: () => void;
}

async function persist(ids: Set<number>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort — losing a write isn't fatal, the in-memory state stays.
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set<number>(),
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const ids = new Set<number>(parsed.filter((x): x is number => typeof x === 'number'));
          set({ favoriteIds: ids, hydrated: true });
          return;
        }
      }
    } catch {
      // fall through to empty set + hydrated true
    }
    set({ hydrated: true });
  },
  toggle: (id) => {
    const next = new Set(get().favoriteIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ favoriteIds: next });
    void persist(next);
  },
  isFavorite: (id) => get().favoriteIds.has(id),
  clear: () => {
    set({ favoriteIds: new Set() });
    void persist(new Set());
  },
}));
