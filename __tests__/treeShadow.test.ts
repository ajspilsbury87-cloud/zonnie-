/**
 * treeShadowCoverage — the crown is an ELEVATED band [trunkHeight, height],
 * so it blocks only when the sun's altitude falls inside that band: high sun
 * clears the crown top, low sun passes under through the transparent trunk.
 */
import { treeShadowCoverage } from '@/src/engines/shadow';
import type { Tree } from '@/src/engines/types';

const M_LAT = 110540;
const TERRACE = { lat: 52.36, lng: 4.9 };

/** A tree `d` metres due SOUTH of the terrace (azimuth 180°). */
function treeSouth(d: number, height: number, trunkHeight?: number): Tree {
  return { lat: TERRACE.lat - d / M_LAT, lng: TERRACE.lng, height, crownRadius: 4, trunkHeight };
}

const SOUTH = 180;
// Tree 20 m away, 12 m tall, 2.5 m trunk → crown band spans
// atan(2.5/20)=7.1° … atan(12/20)=31.0°.
const TREE = treeSouth(20, 12, 2.5);

describe('treeShadowCoverage — elevated crown band', () => {
  test('mid-altitude sun inside the band is blocked', () => {
    // 20° is between 7.1° and 31° → fully blocked.
    expect(treeShadowCoverage(TERRACE, [TREE], 20, SOUTH)).toBeGreaterThan(0.9);
  });

  test('high sun clears the crown top (old model wrongly let this through)', () => {
    // 45° is above the 31° crown top → sun clears it → not blocked.
    expect(treeShadowCoverage(TERRACE, [TREE], 45, SOUTH)).toBeLessThan(0.1);
  });

  test('low sun passes under the crown through the transparent trunk', () => {
    // 4° is below the 7.1° crown bottom → passes under → not blocked
    // (the old model blocked this, treating the crown as a ground block).
    expect(treeShadowCoverage(TERRACE, [TREE], 4, SOUTH)).toBeLessThan(0.1);
  });

  test('sun below the horizon is fully blocked (night)', () => {
    expect(treeShadowCoverage(TERRACE, [TREE], -2, SOUTH)).toBe(1);
  });

  test('no trees → no coverage', () => {
    expect(treeShadowCoverage(TERRACE, [], 20, SOUTH)).toBe(0);
  });

  test('sun on the opposite side (azimuth) is not blocked', () => {
    // Tree is due south; sun due north (0°) can't be behind it.
    expect(treeShadowCoverage(TERRACE, [TREE], 20, 0)).toBeLessThan(0.1);
  });

  test('trunkHeight absent → band starts at the ground (blocks low sun too)', () => {
    const noTrunk = treeSouth(20, 12); // no trunkHeight
    // At 4° a trunkless tree still blocks (no transparent gap).
    expect(treeShadowCoverage(TERRACE, [noTrunk], 4, SOUTH)).toBeGreaterThan(0.9);
  });
});
