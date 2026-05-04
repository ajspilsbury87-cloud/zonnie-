import { _resetBuildingsCache, getBuildings } from '@/src/data/buildings';
import { AREA_CENTROIDS } from '@/src/data/areas';
import { TERRACES } from '@/src/data/terraces';

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

  test('count = area-clustered baseline + ~2 per non-rooftop terrace', () => {
    const areaCount = AREA_CENTROIDS.reduce(
      (sum, a) => sum + Math.floor(20 * a.density) + 6,
      0,
    );
    // Per-terrace generation adds 2 buildings per terrace whose `facing`
    // is a compass direction (i.e., not 'All'). Loose lower bound only —
    // exact is `2 × non-All terraces` plus the area-clustered set.
    const nonAll = TERRACES.filter((t) => t.facing !== 'All').length;
    const expected = areaCount + 2 * nonAll;
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
