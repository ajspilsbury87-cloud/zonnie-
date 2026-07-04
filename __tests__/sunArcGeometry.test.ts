/**
 * sunArcGeometry — the pure math behind TodaysVerdict's sun arc.
 *
 * The arc maps hours onto a shallow circle segment: both horizon ends sit on
 * the baseline (y = 0), the midpoint of the day is the arc's peak (ARC_RISE),
 * and x runs monotonically left → right across the day.
 */

import { ARC_RISE, ARC_WIDTH, arcPoint } from '@/src/engines/sunArcGeometry';

const FROM = 8;
const TO = 21;

describe('sunArcGeometry.arcPoint', () => {
  test('left horizon: fromHour sits at x=0, y=0', () => {
    const p = arcPoint(FROM, FROM, TO);
    expect(p.x).toBeCloseTo(0, 0);
    expect(p.y).toBeCloseTo(0, 0);
  });

  test('right horizon: toHour sits at x=ARC_WIDTH, y=0', () => {
    const p = arcPoint(TO, FROM, TO);
    expect(p.x).toBeCloseTo(ARC_WIDTH, 0);
    expect(p.y).toBeCloseTo(0, 0);
  });

  test('midday peak: middle of the range is centred and at full rise', () => {
    const p = arcPoint((FROM + TO) / 2, FROM, TO);
    expect(p.x).toBeCloseTo(ARC_WIDTH / 2, 0);
    expect(p.y).toBeCloseTo(ARC_RISE, 0);
  });

  test('x is strictly monotonic across the day', () => {
    let prevX = -Infinity;
    for (let h = FROM; h <= TO; h += 0.5) {
      const { x } = arcPoint(h, FROM, TO);
      expect(x).toBeGreaterThan(prevX);
      prevX = x;
    }
  });

  test('y never exceeds ARC_RISE and never dips below the baseline', () => {
    for (let h = FROM; h <= TO; h += 0.25) {
      const { y } = arcPoint(h, FROM, TO);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(ARC_RISE + 0.001);
    }
  });

  test('hours outside the range clamp to the horizon ends', () => {
    expect(arcPoint(FROM - 3, FROM, TO)).toEqual(arcPoint(FROM, FROM, TO));
    expect(arcPoint(TO + 3, FROM, TO)).toEqual(arcPoint(TO, FROM, TO));
  });

  test('degenerate range (from === to) stays finite at the left horizon', () => {
    const p = arcPoint(12, 12, 12);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeCloseTo(0, 0);
  });
});
