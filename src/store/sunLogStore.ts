/**
 * Sun Log — on-device record of terrace interactions.
 *
 * Purpose: a silent, local event log that future features can read to
 * produce personalised insights — daily verdict ("your top terrace today"),
 * Sun Wrapped (year-in-review), streaks, and personalised sorting.
 *
 * Design decisions:
 *   - All data stays on-device. No server, no new permission, no account
 *     required. AsyncStorage is the same storage layer used by favoritesStore.
 *   - Events are append-only with a rolling cap of 2 000. When the cap is
 *     reached, the oldest event is dropped (FIFO). This bounds storage to
 *     roughly 200 KB in the worst case (2 000 × ~100 bytes).
 *   - The store is NOT hydrated at boot — no call needed in _layout.tsx.
 *     Consumers that need history call hydrate() themselves; everything else
 *     can call log() immediately because writes are optimistic (in-memory
 *     first, AsyncStorage second — same pattern as favoritesStore).
 *
 * Groundwork for: daily verdict, Sun Wrapped, terrace streaks.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zonnie:sunlog:v1';

/** Maximum number of events kept in the rolling log. */
export const SUN_LOG_CAP = 2_000;

/** A single recorded user interaction with a terrace. */
export interface SunLogEvent {
  /** Unix timestamp in milliseconds (Date.now()). */
  ts: number;
  /** Terrace ID (matches TERRACES[n].id). */
  terraceId: number;
  /** What the user did. The sunrun_* pair are Phase-0 Sun Run signals
   *  (SPEC-sun-run-phase0.md §1) — generation vs actual share-through.
   *  Pride events track WorldPride seasonal moment engagement. */
  action: 'open' | 'favorite' | 'share' | 'directions' | 'sunrun_generate' | 'sunrun_share' | 'wrapped_share' | 'checkin' | 'pride_spotlight_view' | 'pride_filter_apply' | 'pride_terrace_open';
  /**
   * The computed sun score (0–1) at the time the action was taken, when
   * readily available at the call site. Omitted if not in scope — never
   * recompute just to log it.
   */
  score?: number;
}

interface SunLogState {
  events: SunLogEvent[];
  /** True once the persisted log has been loaded from AsyncStorage. */
  hydrated: boolean;
  /**
   * Load the persisted log from AsyncStorage. Safe to call multiple times —
   * no-ops after the first successful hydration. Consumers that need
   * historical data should await this before reading `events`.
   */
  hydrate: () => Promise<void>;
  /**
   * Append a new event. Enforces the FIFO cap immediately on the in-memory
   * list; persists async (best-effort, same pattern as favoritesStore).
   */
  log: (event: SunLogEvent) => void;
  /** Number of distinct terraces that appear at least once in the log. */
  distinctTerraceCount: () => number;
}

async function persist(events: SunLogEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Best-effort — losing a write isn't fatal; the in-memory state stays.
  }
}

export const useSunLogStore = create<SunLogState>((set, get) => ({
  events: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          // Validate each entry minimally — guard against stale/malformed data.
          const events = parsed.filter(
            (x): x is SunLogEvent =>
              x !== null &&
              typeof x === 'object' &&
              typeof (x as SunLogEvent).ts === 'number' &&
              typeof (x as SunLogEvent).terraceId === 'number' &&
              typeof (x as SunLogEvent).action === 'string',
          );
          // Merge UNDER any events logged before hydration finished, so a
          // fast first tap can never clobber the persisted history.
          set((st) => ({ events: [...events, ...st.events].slice(-SUN_LOG_CAP), hydrated: true }));
          return;
        }
      }
    } catch {
      // fall through to empty log + hydrated true
    }
    set({ hydrated: true });
  },

  log: (event) => {
    const current = get().events;
    // Append then slice from the tail to enforce the cap.
    // slice(-CAP) keeps the MOST recent CAP items, dropping the oldest.
    const next = [...current, event].slice(-SUN_LOG_CAP);
    set({ events: next });
    if (get().hydrated) {
      void persist(next);
      return;
    }
    // First log of a session: persisting now would overwrite the stored
    // history with just this event. Load it first (hydrate merges stored
    // events UNDER anything already in memory), then persist the union.
    void get().hydrate().then(() => persist(get().events));
  },

  distinctTerraceCount: () => {
    // Ignore sentinel ids (< 0) used by non-terrace events (pride spotlight/
    // filter) — they'd otherwise inflate "terraces explored" by one.
    const ids = new Set(get().events.filter((e) => e.terraceId >= 0).map((e) => e.terraceId));
    return ids.size;
  },
}));
