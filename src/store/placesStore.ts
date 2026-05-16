/**
 * In-memory cache of Google Places details, keyed by `placeId`.
 *
 * Same pattern as `weatherStore` — entries have a status (idle/loading/
 * ready/error) so the UI can show skeletons while a fetch is in flight.
 * Fetches are idempotent: if a `placeId` is already loading or loaded,
 * `ensure` is a no-op.
 *
 * Cache lifetime: in-memory only. Cold launching the app refetches what
 * the user opens. Worst case: ~1 fetch per terrace tap = pennies on the
 * Places API basic SKU. AsyncStorage persistence is a future optimization.
 */

import { create } from 'zustand';

import { fetchPlaceDetails, type PlaceDetails } from '@/src/data/places';

type EntryStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CacheEntry {
  status: EntryStatus;
  data?: PlaceDetails;
  error?: string;
  fetchedAt?: number;
}

interface PlacesState {
  /** placeId → cache entry */
  byPlaceId: Record<string, CacheEntry>;
  ensure: (placeId: string) => void;
}

export const usePlacesStore = create<PlacesState>((set, get) => ({
  byPlaceId: {},
  ensure: (placeId) => {
    const existing = get().byPlaceId[placeId];
    if (existing?.status === 'loading') return;
    // Re-fetch if ready but photoNames is missing or empty — could be
    // cached before photos were added to the API field mask.
    if (existing?.status === 'ready' && existing.data?.photoNames?.length) return;
    set((s) => ({
      byPlaceId: { ...s.byPlaceId, [placeId]: { status: 'loading' } },
    }));
    fetchPlaceDetails(placeId)
      .then((details) => {
        if (!details) {
          // null = no key configured or network/HTTP error. Mark as error
          // so the UI shows graceful fallback rather than spinning forever.
          set((s) => ({
            byPlaceId: {
              ...s.byPlaceId,
              [placeId]: { status: 'error', error: 'no_details' },
            },
          }));
          return;
        }
        set((s) => ({
          byPlaceId: {
            ...s.byPlaceId,
            [placeId]: { status: 'ready', data: details, fetchedAt: Date.now() },
          },
        }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        set((s) => ({
          byPlaceId: {
            ...s.byPlaceId,
            [placeId]: { status: 'error', error: message },
          },
        }));
      });
  },
}));
