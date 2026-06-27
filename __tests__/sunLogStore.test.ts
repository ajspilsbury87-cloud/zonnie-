/**
 * Tests for sunLogStore — the silent on-device terrace-interaction log.
 *
 * We import the store directly (not the hook) so tests run in Node without
 * a React renderer. The same pattern used by shortlistStore.test.ts.
 *
 * AsyncStorage is mocked via the package's own Jest mock so persist() calls
 * don't crash (they're fire-and-forget; we don't test storage I/O here).
 */

// Mock AsyncStorage before the store module is imported.
// Jest hoists jest.mock() above ES imports, so require() here is intentional
// and cannot be replaced with an ES import — this is the canonical Jest pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/* eslint-disable import/first */
import { useSunLogStore, SUN_LOG_CAP } from '@/src/store/sunLogStore';
import type { SunLogEvent } from '@/src/store/sunLogStore';
/* eslint-enable import/first */

const store = useSunLogStore;

function getState() {
  return store.getState();
}

// Reset store between tests so state doesn't leak.
beforeEach(() => {
  store.setState({ events: [], hydrated: false });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeEvent(terraceId: number, action: SunLogEvent['action'] = 'open'): SunLogEvent {
  return { ts: Date.now(), terraceId, action };
}

// ── log() ─────────────────────────────────────────────────────────────────────

describe('sunLogStore — log', () => {
  test('appends a single event', () => {
    getState().log(makeEvent(1));
    expect(getState().events).toHaveLength(1);
    expect(getState().events[0]?.terraceId).toBe(1);
    expect(getState().events[0]?.action).toBe('open');
  });

  test('appends multiple events in order', () => {
    getState().log(makeEvent(1, 'open'));
    getState().log(makeEvent(2, 'share'));
    getState().log(makeEvent(3, 'directions'));
    const ids = getState().events.map((e) => e.terraceId);
    expect(ids).toEqual([1, 2, 3]);
  });

  test('stores the optional score field when provided', () => {
    getState().log({ ts: Date.now(), terraceId: 10, action: 'favorite', score: 0.85 });
    expect(getState().events[0]?.score).toBe(0.85);
  });

  test('score field is absent when not provided', () => {
    getState().log(makeEvent(10));
    expect(getState().events[0]?.score).toBeUndefined();
  });
});

// ── FIFO cap ──────────────────────────────────────────────────────────────────

describe('sunLogStore — FIFO cap', () => {
  test('does not drop events while under the cap', () => {
    for (let i = 0; i < 10; i++) {
      getState().log(makeEvent(i));
    }
    expect(getState().events).toHaveLength(10);
  });

  test('at exactly SUN_LOG_CAP events, length equals cap', () => {
    for (let i = 0; i < SUN_LOG_CAP; i++) {
      getState().log(makeEvent(i % 100));
    }
    expect(getState().events).toHaveLength(SUN_LOG_CAP);
  });

  test('adding one beyond the cap drops the oldest event', () => {
    // Fill to cap, each with a unique terraceId = its index.
    for (let i = 0; i < SUN_LOG_CAP; i++) {
      getState().log({ ts: i, terraceId: i, action: 'open' });
    }
    // Add one more — terraceId = SUN_LOG_CAP.
    getState().log({ ts: SUN_LOG_CAP, terraceId: SUN_LOG_CAP, action: 'open' });

    const events = getState().events;
    expect(events).toHaveLength(SUN_LOG_CAP);
    // Oldest (terraceId 0, ts 0) should be gone.
    expect(events[0]?.terraceId).toBe(1);
    // Newest should be at the end.
    expect(events[SUN_LOG_CAP - 1]?.terraceId).toBe(SUN_LOG_CAP);
  });

  test('adding N beyond the cap drops the N oldest events', () => {
    for (let i = 0; i < SUN_LOG_CAP; i++) {
      getState().log({ ts: i, terraceId: i, action: 'open' });
    }
    // Add 5 more.
    for (let i = 0; i < 5; i++) {
      getState().log({ ts: SUN_LOG_CAP + i, terraceId: SUN_LOG_CAP + i, action: 'open' });
    }
    const events = getState().events;
    expect(events).toHaveLength(SUN_LOG_CAP);
    // First 5 (terraceIds 0–4) should be gone; next oldest should be 5.
    expect(events[0]?.terraceId).toBe(5);
  });
});

// ── distinctTerraceCount() ────────────────────────────────────────────────────

describe('sunLogStore — distinctTerraceCount', () => {
  test('returns 0 with no events', () => {
    expect(getState().distinctTerraceCount()).toBe(0);
  });

  test('counts one terrace opened once', () => {
    getState().log(makeEvent(42));
    expect(getState().distinctTerraceCount()).toBe(1);
  });

  test('same terrace opened many times still counts as 1', () => {
    getState().log(makeEvent(5, 'open'));
    getState().log(makeEvent(5, 'share'));
    getState().log(makeEvent(5, 'directions'));
    expect(getState().distinctTerraceCount()).toBe(1);
  });

  test('counts multiple distinct terraces correctly', () => {
    getState().log(makeEvent(1));
    getState().log(makeEvent(2));
    getState().log(makeEvent(3));
    getState().log(makeEvent(2)); // duplicate — still 3 distinct
    expect(getState().distinctTerraceCount()).toBe(3);
  });
});
