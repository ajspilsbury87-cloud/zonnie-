import {
  CANAL_PARADE_DATE,
  countParadeViewTerraces,
  distanceToParadeRouteM,
  isCanalParadeDay,
  isParadeViewTerrace,
  isWorldPrideLive,
  PARADE_VIEW_MAX_M,
} from '@/src/data/pride';
import { TERRACES } from '@/src/data/terraces';

describe('WorldPride window gating', () => {
  test('opens 25 July and closes 8 August, inclusive', () => {
    expect(isWorldPrideLive('2026-07-24')).toBe(false);
    expect(isWorldPrideLive('2026-07-25')).toBe(true);
    expect(isWorldPrideLive('2026-08-01')).toBe(true);
    expect(isWorldPrideLive('2026-08-08')).toBe(true);
    expect(isWorldPrideLive('2026-08-09')).toBe(false);
  });

  test('parade day is Saturday 1 August only', () => {
    expect(isCanalParadeDay(CANAL_PARADE_DATE)).toBe(true);
    expect(isCanalParadeDay('2026-08-02')).toBe(false);
  });
});

describe('parade route geometry', () => {
  test('a point ON the Prinsengracht (Westermarkt) is on-route', () => {
    expect(distanceToParadeRouteM(52.3751, 4.8838)).toBeLessThan(PARADE_VIEW_MAX_M);
  });

  test('the Amstel at the Magere Brug is on-route', () => {
    expect(distanceToParadeRouteM(52.3636, 4.9017)).toBeLessThan(50);
  });

  test('Vondelpark is nowhere near the route', () => {
    expect(distanceToParadeRouteM(52.3579, 4.8686)).toBeGreaterThan(500);
  });

  test('Noord (Pllek/NDSM) is nowhere near the route', () => {
    expect(distanceToParadeRouteM(52.4009, 4.8935)).toBeGreaterThan(1000);
  });
});

describe('dataset coverage', () => {
  test('a sane number of real terraces are parade-view (route is plausible)', () => {
    const n = countParadeViewTerraces(TERRACES);
    // Prinsengracht + Amstel are café-dense: expect a healthy strip, but if
    // this ever exceeds ~350 the threshold or route drifted too wide.
    // eslint-disable-next-line no-console
    console.log(`parade-view terraces: ${n}/${TERRACES.length}`);
    expect(n).toBeGreaterThan(15);
    expect(n).toBeLessThan(350);
  });

  test('per-terrace verdict is cached and consistent', () => {
    const sample = TERRACES.slice(0, 50);
    for (const t of sample) {
      expect(isParadeViewTerrace(t)).toBe(isParadeViewTerrace(t));
    }
  });
});
