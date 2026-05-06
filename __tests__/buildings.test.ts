import {
  _resetBuildingsCache,
  getBuildings,
  getBuildingsForTerrace,
  isUsingRealBuildingData,
} from '@/src/data/buildings';
import { TERRACES } from '@/src/data/terraces';

describe('getBuildings', () => {
  beforeEach(() => {
    _resetBuildingsCache();
  });

  test('returns a non-empty list', () => {
    expect(getBuildings().length).toBeGreaterThan(0);
  });

  test('cached on second call (returns the same array reference)', () => {
    const a = getBuildings();
    const b = getBuildings();
    expect(a).toBe(b);
  });

  test('every building has positive height and a width', () => {
    for (const b of getBuildings()) {
      // OSM occasionally has 1-storey buildings (sheds, garages).
      // Anything below 3m is unlikely to cast a meaningful shadow but
      // shouldn't be filtered out — leave the threshold permissive.
      expect(b.height).toBeGreaterThan(0);
      expect(b.width).toBeDefined();
      expect(b.width!).toBeGreaterThan(0);
    }
  });
});

describe('getBuildingsForTerrace', () => {
  beforeEach(() => {
    _resetBuildingsCache();
  });

  test('every terrace gets at least one nearby building', () => {
    for (const t of TERRACES) {
      const nearby = getBuildingsForTerrace(t.id);
      expect(nearby.length).toBeGreaterThan(0);
    }
  });

  test('nearby buildings are within reasonable distance (200m)', () => {
    const M_PER_DEG_LAT = 110540;
    const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
    // Sample first 30 terraces — checking all 886 takes a while.
    for (const t of TERRACES.slice(0, 30)) {
      for (const b of getBuildingsForTerrace(t.id)) {
        const dy = (b.lat - t.lat) * M_PER_DEG_LAT;
        const dx = (b.lng - t.lng) * M_PER_DEG_LNG;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeLessThan(220); // 200m + small slack for float drift
      }
    }
  });

  test('unknown terrace id returns empty list', () => {
    expect(getBuildingsForTerrace(999999)).toEqual([]);
  });
});

describe('isUsingRealBuildingData', () => {
  test('reports whether OSM-sourced data is loaded', () => {
    // No assertion either way — depends on whether `npm run
    // fetch-osm-buildings -- --apply` has been run in this checkout.
    // Just exercising the function doesn't throw.
    const flag = isUsingRealBuildingData();
    expect(typeof flag).toBe('boolean');
  });
});
