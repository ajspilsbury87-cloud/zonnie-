import {
  TERRACES,
  getAreas,
  getTerraceById,
  getTerracesByArea,
  searchTerraces,
} from '@/src/data/terraces';

const FACINGS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'All']);
const CAPACITIES = new Set(['S', 'M', 'L']);

describe('terraces.json schema', () => {
  test('has roughly the documented count', () => {
    // Range expanded post-import (2026-05-05): bulk-imported ~750 venues
    // from Seats-in-the-Sun's competitor list → ~1,100. Upper bound is
    // generous to allow further imports without breaking this test;
    // tightens only if a regression would drop us below 800.
    expect(TERRACES.length).toBeGreaterThanOrEqual(800);
    expect(TERRACES.length).toBeLessThanOrEqual(2000);
  });

  test('every entry has the required fields and sane values', () => {
    for (const t of TERRACES) {
      expect(typeof t.id).toBe('number');
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.lat).toBe('number');
      expect(typeof t.lng).toBe('number');
      // Amsterdam metro bbox (loose). Wider than the city centre proper —
      // catches Amstelveen / Ouderkerk venues at the southern edge that
      // came in with the 2026-05-05 competitor import.
      expect(t.lat).toBeGreaterThan(52.27);
      expect(t.lat).toBeLessThan(52.45);
      expect(t.lng).toBeGreaterThan(4.7);
      expect(t.lng).toBeLessThan(5.05);
      expect(FACINGS.has(t.facing)).toBe(true);
      expect(CAPACITIES.has(t.capacity)).toBe(true);
      expect(typeof t.verified).toBe('boolean');
    }
  });

  test('IDs are unique', () => {
    const ids = new Set(TERRACES.map((t) => t.id));
    expect(ids.size).toBe(TERRACES.length);
  });
});

describe('getAreas', () => {
  test('starts with "All", then sorted distinct area names', () => {
    const areas = getAreas();
    expect(areas[0]).toBe('All');
    expect(areas.length).toBeGreaterThan(2);
    const tail = areas.slice(1);
    expect([...tail].sort((a, b) => a.localeCompare(b))).toEqual(tail);
    expect(new Set(tail).size).toBe(tail.length);
  });

  test('every area is non-empty', () => {
    for (const a of getAreas()) expect(a.length).toBeGreaterThan(0);
  });
});

describe('searchTerraces', () => {
  test('empty query returns the full set', () => {
    expect(searchTerraces('').length).toBe(TERRACES.length);
    expect(searchTerraces('   ').length).toBe(TERRACES.length);
  });

  test('case-insensitive substring match on name', () => {
    const results = searchTerraces('café');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const blob = `${r.name} ${r.area} ${r.vibe} ${r.address}`.toLowerCase();
      expect(blob).toContain('café');
    }
  });

  test('matches across area, vibe, and address', () => {
    const r1 = searchTerraces('Centrum').length;
    const r2 = searchTerraces('CENTRUM').length;
    expect(r1).toBe(r2);
    expect(r1).toBeGreaterThan(0);
  });
});

describe('getTerraceById / getTerracesByArea', () => {
  test('looks up an id', () => {
    const first = TERRACES[0]!;
    expect(getTerraceById(first.id)?.name).toBe(first.name);
    expect(getTerraceById(-9999)).toBeUndefined();
  });

  test('"All" returns everything', () => {
    expect(getTerracesByArea('All').length).toBe(TERRACES.length);
  });

  test('a specific area is a strict subset', () => {
    const areas = getAreas().filter((a) => a !== 'All');
    const sample = areas[0]!;
    const subset = getTerracesByArea(sample);
    expect(subset.length).toBeGreaterThan(0);
    expect(subset.length).toBeLessThan(TERRACES.length);
    for (const t of subset) expect(t.area).toBe(sample);
  });
});
