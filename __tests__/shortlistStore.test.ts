/**
 * Tests for the shortlist store — cap behaviour is the critical path.
 *
 * We import the store's raw Zustand creator rather than the hook so these
 * tests run in Node without a React renderer. Zustand stores expose a
 * `getState()` / `setState()` API that's easy to call synchronously.
 */

import { useShortlistStore, MAX_SHORTLIST } from '@/src/store/shortlistStore';

// Grab the plain store API (not the hook — no React needed here).
const store = useShortlistStore;

function getState() {
  return store.getState();
}

// Reset store between tests so state doesn't leak.
beforeEach(() => {
  store.setState({ selectedIds: [], isSelecting: false });
});

describe('shortlistStore — toggle', () => {
  test('adds an id when under cap', () => {
    getState().toggle(1);
    expect(getState().selectedIds).toEqual([1]);
  });

  test('removes an id that is already selected', () => {
    getState().toggle(1);
    getState().toggle(1);
    expect(getState().selectedIds).toEqual([]);
  });

  test('handles multiple adds up to MAX_SHORTLIST', () => {
    getState().toggle(1);
    getState().toggle(2);
    getState().toggle(3);
    expect(getState().selectedIds).toHaveLength(MAX_SHORTLIST);
    expect(getState().selectedIds).toEqual([1, 2, 3]);
  });

  test('FIFO: at cap, adding a 4th drops the oldest', () => {
    // Fill to cap
    getState().toggle(1);
    getState().toggle(2);
    getState().toggle(3);
    // Now add a 4th — should drop id 1 (oldest)
    getState().toggle(4);
    expect(getState().selectedIds).toHaveLength(MAX_SHORTLIST);
    expect(getState().selectedIds).toEqual([2, 3, 4]);
  });

  test('FIFO: second overflow drops the new oldest', () => {
    getState().toggle(1);
    getState().toggle(2);
    getState().toggle(3);
    getState().toggle(4); // drops 1 → [2,3,4]
    getState().toggle(5); // drops 2 → [3,4,5]
    expect(getState().selectedIds).toEqual([3, 4, 5]);
  });

  test('can remove one after overflow and add again', () => {
    getState().toggle(1);
    getState().toggle(2);
    getState().toggle(3);
    getState().toggle(4); // drops 1 → [2,3,4]
    getState().toggle(3); // remove 3 → [2,4]
    getState().toggle(99); // add under cap → [2,4,99]
    expect(getState().selectedIds).toEqual([2, 4, 99]);
  });
});

describe('shortlistStore — clear', () => {
  test('clears ids and exits selecting mode', () => {
    getState().toggle(10);
    getState().enterSelecting();
    expect(getState().isSelecting).toBe(true);
    getState().clear();
    expect(getState().selectedIds).toEqual([]);
    expect(getState().isSelecting).toBe(false);
  });
});

describe('shortlistStore — enterSelecting', () => {
  test('sets isSelecting to true without touching ids', () => {
    getState().toggle(7);
    getState().enterSelecting();
    expect(getState().isSelecting).toBe(true);
    expect(getState().selectedIds).toEqual([7]);
  });
});
