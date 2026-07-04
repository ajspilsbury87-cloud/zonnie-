/**
 * Tests for the selection store's peek/full stage machine.
 *
 * The store is where the peek-card pattern lives: map pins call peek(),
 * the peek card calls expand(), and every committed entry point (list
 * rows, landing cards, deep links, handoff taps) calls select(). These
 * tests pin down the transitions the UI components rely on — in
 * particular TerraceDetailSheet's close-guard, which distinguishes a
 * user closing the FULL sheet from the programmatic close that happens
 * while a peek is active purely by reading `stage`.
 */

import { useSelectionStore } from '@/src/store/selectionStore';

const initial = useSelectionStore.getState();

beforeEach(() => {
  useSelectionStore.setState(initial, true);
});

describe('selectionStore stage machine', () => {
  it('starts with no selection at the resting peek stage', () => {
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.stage).toBe('peek');
  });

  it('peek() selects at stage peek (map pin tap)', () => {
    useSelectionStore.getState().peek(7);
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(7);
    expect(s.stage).toBe('peek');
  });

  it('expand() promotes a peek to the full sheet', () => {
    useSelectionStore.getState().peek(7);
    useSelectionStore.getState().expand();
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(7);
    expect(s.stage).toBe('full');
  });

  it('select() always opens full — list rows, deep links, handoff', () => {
    useSelectionStore.getState().select(3);
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(3);
    expect(s.stage).toBe('full');
  });

  it('switching pins while peeking stays at peek', () => {
    useSelectionStore.getState().peek(1);
    useSelectionStore.getState().peek(2);
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(2);
    expect(s.stage).toBe('peek');
  });

  it('select() during an active peek promotes to full (list tap wins)', () => {
    useSelectionStore.getState().peek(1);
    useSelectionStore.getState().select(9);
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(9);
    expect(s.stage).toBe('full');
  });

  it('peek() while the full sheet is open demotes to peek for the new pin', () => {
    // Full sheet open for A, user taps pin B on the map behind it: the
    // sheet closes (stage no longer full) and B's peek card shows.
    useSelectionStore.getState().select(1);
    useSelectionStore.getState().peek(2);
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(2);
    expect(s.stage).toBe('peek');
  });

  it('collapse() demotes the full sheet to a peek, keeping the selection', () => {
    // Drag-down on the full sheet and "Show on Map" both use this: the
    // user asked for the map back, not to forget the terrace.
    useSelectionStore.getState().select(6);
    useSelectionStore.getState().collapse();
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBe(6);
    expect(s.stage).toBe('peek');
  });

  it('collapse() with nothing selected is a harmless no-op state', () => {
    useSelectionStore.getState().collapse();
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.stage).toBe('peek');
  });

  it('clear() resets selection AND returns stage to the resting peek value', () => {
    // The reset matters: TerraceDetailSheet's onClose guard only clears
    // when stage === 'full', so a stale 'full' after clear() would make
    // spurious onClose events destructive to the next peek.
    useSelectionStore.getState().select(5);
    useSelectionStore.getState().clear();
    const s = useSelectionStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.stage).toBe('peek');
  });

  it('full peek → expand → clear → peek cycle lands back at peek', () => {
    const store = useSelectionStore.getState;
    store().peek(4);
    store().expand();
    store().clear();
    store().peek(8);
    expect(store().selectedId).toBe(8);
    expect(store().stage).toBe('peek');
  });
});
