import { isInShadow, shadowDirection, shadowLength } from '@/src/engines/shadow';
import type { Building } from '@/src/engines/types';

const TERRACE = { lat: 52.3676, lng: 4.9041 };

// 1m at Amsterdam latitude ≈ 1/110540 deg lat, 1/(111320*cos(52.37)) deg lng.
const M_PER_DEG_LAT = 110540;

function buildingAt(bearingDeg: number, distanceM: number, height = 20, width = 15): Building {
  const rad = (bearingDeg * Math.PI) / 180;
  const dy = (Math.cos(rad) * distanceM) / M_PER_DEG_LAT;
  const dx = (Math.sin(rad) * distanceM) / (111320 * Math.cos((TERRACE.lat * Math.PI) / 180));
  return { lat: TERRACE.lat + dy, lng: TERRACE.lng + dx, height, width };
}

describe('shadow primitives', () => {
  test('shadow length grows as sun gets lower', () => {
    expect(shadowLength(20, 60)).toBeCloseTo(20 / Math.tan((60 * Math.PI) / 180), 5);
    expect(shadowLength(20, 5)).toBeGreaterThan(shadowLength(20, 30));
  });

  test('sun below horizon → infinite shadow', () => {
    expect(shadowLength(20, 0)).toBe(Infinity);
    expect(shadowLength(20, -5)).toBe(Infinity);
  });

  test('shadow falls opposite to the sun', () => {
    expect(shadowDirection(180)).toBe(0);
    expect(shadowDirection(90)).toBe(270);
    expect(shadowDirection(45)).toBe(225);
  });
});

describe('isInShadow', () => {
  test('sun below horizon → always shadowed', () => {
    expect(isInShadow(TERRACE, [], -5, 180)).toBe(true);
    expect(isInShadow(TERRACE, [], 1, 180)).toBe(true);
  });

  test('no buildings + sun up → never shadowed', () => {
    expect(isInShadow(TERRACE, [], 30, 180)).toBe(false);
  });

  test('building between terrace and sun → shadow detected', () => {
    // Sun in the south (azimuth 180°). Building 30m south of terrace blocks it.
    const buildings = [buildingAt(180, 30, 20)];
    expect(isInShadow(TERRACE, buildings, 30, 180)).toBe(true);
  });

  test('building opposite the sun → no shadow (the geometry bug fixed in PR 2)', () => {
    // Sun south, building NORTH of terrace: building is downstream of sun rays.
    // Prototype (buggy) reported this as shadow. Correct answer: full sun.
    const buildings = [buildingAt(0, 30, 20)];
    expect(isInShadow(TERRACE, buildings, 30, 180)).toBe(false);
  });

  test('building too far for its shadow length → no shadow', () => {
    // 5m-tall building 100m south, sun at 60°: shadow length ~2.9m, doesn't reach.
    const buildings = [buildingAt(180, 100, 5)];
    expect(isInShadow(TERRACE, buildings, 60, 180)).toBe(false);
  });

  test('building tangentially east while sun is south → no shadow', () => {
    const buildings = [buildingAt(90, 30, 20)];
    expect(isInShadow(TERRACE, buildings, 30, 180)).toBe(false);
  });
});
