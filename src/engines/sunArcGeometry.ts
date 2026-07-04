/**
 * Geometry for the TodaysVerdict sun arc — a shallow horizon arc that maps
 * hours of the day onto points along a circle segment.
 *
 * Pure math, no React Native imports, so it's unit-testable in isolation
 * (same pattern as todaysVerdict.ts).
 *
 * The arc sweeps 150° → 30° on a circle of radius 150, giving a wide, low
 * "horizon" shape (260 wide, 75 high) rather than a full semicircle — the
 * sun's path as you'd sketch it, not a protractor.
 */

const RADIUS = 150;
const START_DEG = 150;
const END_DEG = 30;
const END_RAD = (END_DEG * Math.PI) / 180;

/** Total width of the arc's bounding box, in layout points. */
export const ARC_WIDTH = Math.round(2 * RADIUS * Math.cos(END_RAD)); // 260

/** Height of the arc's highest point above its baseline, in layout points. */
export const ARC_RISE = Math.round(RADIUS - RADIUS * Math.sin(END_RAD)); // 75

/**
 * Map an hour to its {x, y} position on the arc.
 *
 * - `x` runs 0 (fromHour, left horizon) → ARC_WIDTH (toHour, right horizon).
 * - `y` is height ABOVE the baseline: 0 at both horizons, ARC_RISE at the
 *   midpoint of the day.
 *
 * Hours outside [fromHour, toHour] clamp to the nearest horizon end.
 */
export function arcPoint(
  hour: number,
  fromHour: number,
  toHour: number,
): { x: number; y: number } {
  const span = toHour - fromHour;
  const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (hour - fromHour) / span));
  const rad = ((START_DEG + (END_DEG - START_DEG) * t) * Math.PI) / 180;
  return {
    x: ARC_WIDTH / 2 + RADIUS * Math.cos(rad),
    y: RADIUS * Math.sin(rad) - RADIUS * Math.sin(END_RAD),
  };
}
