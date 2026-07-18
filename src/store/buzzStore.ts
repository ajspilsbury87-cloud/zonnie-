/**
 * buzzStore — terrace-buzz counts cache + the device's own check-in days
 * (community Phase B). Counts come from the buzz worker (lib/buzz.ts);
 * check-in days persist locally so the button can show "✓ checked in"
 * without asking the server.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchBuzz, postCheckin, type BuzzCounts } from '@/src/lib/buzz';
import { useSunLogStore } from '@/src/store/sunLogStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';

const STORAGE_KEY = 'zonnie:buzz:mydays:v1';

interface BuzzState {
  /** Session cache: terraceId → latest counts from the worker. */
  counts: Record<number, BuzzCounts>;
  /** terraceId → Amsterdam day (yyyy-MM-dd) of this device's last check-in. */
  checkedDays: Record<number, string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Fetch counts for a terrace into the cache (quiet on failure). */
  load: (terraceId: number) => Promise<void>;
  /** Check in: optimistic local mark, server post, counts refresh. */
  checkIn: (terraceId: number) => Promise<void>;
}

async function persist(checkedDays: Record<number, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(checkedDays));
  } catch {
    // Best-effort — worst case the button re-enables after a relaunch.
  }
}

export const useBuzzStore = create<BuzzState>((set, get) => ({
  counts: {},
  checkedDays: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Merge UNDER anything marked before hydration finished.
          set((s) => ({ checkedDays: { ...(parsed as Record<number, string>), ...s.checkedDays }, hydrated: true }));
          return;
        }
      }
    } catch {
      // fall through — empty map
    }
    set({ hydrated: true });
  },

  load: async (terraceId) => {
    const counts = await fetchBuzz(terraceId);
    if (counts != null) {
      set((s) => ({ counts: { ...s.counts, [terraceId]: counts } }));
    }
  },

  checkIn: async (terraceId) => {
    const today = todayAmsterdamDateStr();
    // Optimistic local mark so the button flips instantly.
    set((s) => ({ checkedDays: { ...s.checkedDays, [terraceId]: today } }));
    void persist(get().checkedDays);
    // Check-ins are real interactions — they feed My Sun Summer too.
    useSunLogStore.getState().log({ ts: Date.now(), terraceId, action: 'checkin' });
    const result = await postCheckin(terraceId);
    if (result != null) {
      set((s) => ({ counts: { ...s.counts, [terraceId]: { week: result.week, total: result.total } } }));
    }
  },
}));
