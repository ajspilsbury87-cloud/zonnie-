/**
 * Persistent cache of Google Places details, keyed by `placeId`.
 *
 * Persistence model (v1.2 — added in the Pro-launch build to cap
 * Places API spend at scale):
 *
 *   - In-memory entries are mirrored to AsyncStorage via Zustand's
 *     `persist` middleware. Cold-launch reads them back, so the user
 *     who opened "Café Kobalt" yesterday doesn't pay another API call
 *     to see the same rating today.
 *
 *   - TTL = 7 days. Ratings + opening hours rarely change overnight,
 *     and Google's data is rarely updated faster than that anyway.
 *     Once an entry crosses the TTL it's silently dropped on
 *     rehydrate, then refetched on next demand. First fetch each
 *     week per venue.
 *
 *   - Only successful (`status: 'ready'`) entries are persisted.
 *     Loading/error entries are scratch and shouldn't survive a
 *     cold launch (an error caused by transient network would
 *     otherwise stick forever).
 *
 *   - Persistence key is `places-cache-v1`. Bump the suffix if the
 *     PlaceDetails schema ever changes shape — that invalidates
 *     the disk cache without users noticing anything.
 *
 * ensure() is idempotent: if a placeId is already loading or ready
 * (and within TTL), it no-ops. Otherwise it kicks off a fresh
 * Places API call and stores the result.
 *
 * Cost model: with the cache + the isPro gate at the call site
 * (TerraceDetailSheet only calls ensure() when the user is Pro),
 * a typical Pro user fetches each venue's details ~once per week.
 * At ~$0.025/Atmosphere-SKU call, that's well under €5/mo even
 * at 1,000 Pro users opening 10 venues each per week.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/** Cache TTL — 7 days. Google ratings + hours don't churn faster than this. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(entry: CacheEntry, now: number): boolean {
  if (entry.status !== 'ready') return false;
  if (entry.fetchedAt == null) return false;
  return now - entry.fetchedAt < CACHE_TTL_MS;
}

export const usePlacesStore = create<PlacesState>()(
  persist(
    (set, get) => ({
      byPlaceId: {},
      ensure: (placeId) => {
        const existing = get().byPlaceId[placeId];
        if (existing?.status === 'loading') return;
        // Re-fetch if ready but photoNames is missing/empty (cached
        // before photos were added to the API field mask), OR if the
        // entry has aged past TTL.
        if (
          existing?.status === 'ready' &&
          existing.data?.photoNames?.length &&
          isFresh(existing, Date.now())
        ) {
          return;
        }
        set((s) => ({
          byPlaceId: { ...s.byPlaceId, [placeId]: { status: 'loading' } },
        }));
        fetchPlaceDetails(placeId)
          .then((details) => {
            if (!details) {
              // null = no key configured or network/HTTP error. Mark
              // as error so the UI shows graceful fallback rather
              // than spinning. NOT persisted — see partialize below.
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
                [placeId]: {
                  status: 'ready',
                  data: details,
                  fetchedAt: Date.now(),
                },
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
    }),
    {
      name: 'places-cache-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the cache map, never function refs. (Functions
      // can't be JSON-serialised anyway, but persist would still try
      // to and warn in dev.)
      partialize: (state) => ({ byPlaceId: state.byPlaceId }),
      // Prune stale and error entries on rehydrate. Loading entries
      // shouldn't survive a cold launch either — they'd block the
      // ensure() guard but the promise never resolved.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const now = Date.now();
        const fresh: Record<string, CacheEntry> = {};
        for (const [id, entry] of Object.entries(state.byPlaceId)) {
          if (isFresh(entry, now)) fresh[id] = entry;
        }
        state.byPlaceId = fresh;
      },
    },
  ),
);
