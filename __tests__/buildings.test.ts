import { _resetBuildingsCache, getBuildings } from '@/src/data/buildings';
import { AREA_CENTROIDS } from '@/src/data/areas';

describe('getBuildings', () => {
  beforeEach(() => {
    _resetBuildingsCache();
  });

  test('produces the same set every run (deterministic seed)', () => {
    const a = getBuildings();
    _resetBuildingsCache();
    const b = getBuildings();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.lat).toBe(b[i]!.lat);
      expect(a[i]!.lng).toBe(b[i]!.lng);
      expect(a[i]!.height).toBe(b[i]!.height);
      expect(a[i]!.width).toBe(b[i]!.width);
    }
  });

  test('cached on second call (returns the same array reference)', () => {
    const a = getBuildings();
    const b = getBuildings();
    expect(a).toBe(b);
  });

  test('count matches the prototype formula: sum(20*density + 6) per area', () => {
    const expected = AREA_CENTROIDS.reduce(
      (sum, a) => sum + Math.floor(20 * a.density) + 6,
      0,
    );
    expect(getBuildings().length).toBe(expected);
  });

  test('every building has positive height and a width', () => {
    for (const b of getBuildings()) {
      expect(b.height).toBeGreaterThanOrEqual(5);
      expect(b.width).toBeDefined();
      expect(b.width!).toBeGreaterThan(0);
    }
  });
});
