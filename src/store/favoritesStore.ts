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
 *   - Free users can save exactly 1 favourite. Attempting to add a second
 *     returns `'paywall'` so the caller can open ProPaywall. Removing a
 *     favourite always succeeds regardless of Pro status.
 *   - Pro users have unlimited favourites.
 *   - `hydrate()` is called once at app launch by `app/_layout.tsx` to
 *     load the persisted set. Until it resolves, `selectedIds` is empty
 *     — that's fine; first paint never has favorites yet anyway.
 *   - Storage key is namespaced (`zonnie:favorites:v1`) so a future
 *     schema change can be migrated without touching v1 data.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePurchaseStore } from '@/src/store/purchaseStore';

const STORAGE_KEY = 'zonnie:favorites:v1';

/** How many favourites a free user may save. */
const FREE_TIER_LIMIT = 3;

interface FavoritesState {
  /** Terrace IDs the user has favorited. */
  favoriteIds: Set<number>;
  /** True after the persisted set has been loaded from disk. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /**
   * Toggle a favourite on or off.
   *
   * Returns:
   *   `'added'`   — terrace was added successfully
   *   `'removed'` — terrace was removed
   *   `'paywall'` — free-tier limit reached; terrace was NOT added.
   *                 The caller should open ProPaywall('favourites').
   */
  toggle: (id: number) => 'added' | 'removed' | 'paywall';
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
    const current = get().favoriteIds;

    // Removing always succeeds — never gate a removal.
    if (current.has(id)) {
      const next = new Set(current);
      next.delete(id);
      set({ favoriteIds: next });
      void persist(next);
      return 'removed';
    }

    // Adding: check free-tier limit for non-Pro users.
    const isPro = usePurchaseStore.getState().isPro;
    if (!isPro && current.size >= FREE_TIER_LIMIT) {
      // Do NOT mutate state — caller must open the paywall.
      return 'paywall';
    }

    const next = new Set(current);
    next.add(id);
    set({ favoriteIds: next });
    void persist(next);
    return 'added';
  },
  isFavorite: (id) => get().favoriteIds.has(id),
  clear: () => {
    set({ favoriteIds: new Set() });
    void persist(new Set());
  },
}));
