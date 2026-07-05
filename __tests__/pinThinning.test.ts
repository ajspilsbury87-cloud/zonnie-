import { thinPins } from '@/src/engines/pinThinning';

const REGION = { latitude: 52.36, longitude: 4.9, latitudeDelta: 0.1, longitudeDelta: 0.1 };

/** item at a fractional position within the region (0..1 on each axis). */
function at(fx: number, fy: number, id: number) {
  return {
    id,
    terrace: {
      lat: REGION.latitude - REGION.latitudeDelta / 2 + fy * REGION.latitudeDelta,
      lng: REGION.longitude - REGION.longitudeDelta / 2 + fx * REGION.longitudeDelta,
    },
  };
}

describe('thinPins', () => {
  test('returns input unchanged when under the cap', () => {
    const items = [at(0.1, 0.1, 1), at(0.9, 0.9, 2)];
    expect(thinPins(items, 30, REGION).map((i) => i.id)).toEqual([1, 2]);
  });

  test('never exceeds the cap', () => {
    const items = Array.from({ length: 200 }, (_, i) => at(Math.random(), Math.random(), i));
    expect(thinPins(items, 30, REGION).length).toBe(30);
  });

  test('spreads across the map: a far corner survives a dominant hotspot', () => {
    // 50 high-priority pins crammed in one corner + 1 low-priority pin far away.
    const hotspot = Array.from({ length: 50 }, (_, i) => at(0.05, 0.05, i));
    const loner = at(0.95, 0.95, 999);
    const picked = thinPins([...hotspot, loner], 10, REGION).map((i) => i.id);
    // Old slice(0, cap) behaviour would drop the loner; thinning must keep it.
    expect(picked).toContain(999);
  });

  test('within a cell, higher input priority wins', () => {
    const items = [at(0.5, 0.5, 1), at(0.51, 0.51, 2), at(0.52, 0.52, 3)];
    expect(thinPins(items, 1, REGION).map((i) => i.id)).toEqual([1]);
  });

  test('output preserves the input relative order', () => {
    const items = [at(0.9, 0.9, 7), at(0.1, 0.1, 3), at(0.5, 0.5, 5)];
    const picked = thinPins(items, 3, REGION).map((i) => i.id);
    expect(picked).toEqual([7, 3, 5]);
  });

  test('items slightly outside the region clamp to edge cells instead of crashing', () => {
    const outside = { id: 42, terrace: { lat: REGION.latitude + REGION.latitudeDelta, lng: REGION.longitude + REGION.longitudeDelta } };
    const items = [outside, ...Array.from({ length: 40 }, (_, i) => at(0.5, 0.5, i))];
    const picked = thinPins(items, 5, REGION);
    expect(picked.length).toBe(5);
    expect(picked.map((i) => i.id)).toContain(42);
  });
});
