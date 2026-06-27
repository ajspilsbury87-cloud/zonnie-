/**
 * Unit tests for src/engines/handoff.ts — the "next sunny spot" engine.
 *
 * Strategy:
 *   - Use synthetic terrace fixtures so no buildings.json or trees.json
 *     data is required — getBuildingsForTerrace returns [] for unknown ids
 *     (the procedural fallback), and getTreesForTerrace similarly.
 *   - Test clear-sky 'sunny' profile on a summer date so shadow geometry
 *     doesn't obscure the intent of each test.
 *   - All terraces are placed in Amsterdam (52.37°N, 4.90°E) to match
 *     the engine's solar calculations. Neighbours are placed ~300 m apart
 *     (within the 500m walk cutoff) or ~700 m apart (beyond it).
 *
 * WHY no mocks for getBuildingsForTerrace / getTreesForTerrace:
 *   Returning empty arrays is the real behaviour for unknown IDs — it's
 *   not a stub. We're testing the engine logic, not the data lookup.
 */

import { findNextSunnySpot } from '@/src/engines/handoff';
import type { Terrace } from '@/src/engines/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Summer solstice — maximum Amsterdam afternoon sun window. */
const DATE = '2026-06-21';

/** Origin terrace: south-facing at Amsterdam lat/lng. IDs are large (90000+) so
 *  getBuildingsForTerrace returns [] (no shadow, pure solar score). */
function makeTerrace(
  id: number,
  lat: number,
  lng: number,
  facing: Terrace['facing'] = 'S',
): Terrace {
  return {
    id,
    name: `Test Terrace ${id}`,
    lat,
    lng,
    area: 'Centrum',
    facing,
    capacity: 'M',
    vibe: 'test',
    address: 'Test Street 1',
    verified: false,
  };
}

// Amsterdam reference point.
const BASE_LAT = 52.372;
const BASE_LNG = 4.903;

// ~300 m north — within the 500 m walk cutoff.
const NEAR_LAT = BASE_LAT + 300 / 110540;
const NEAR_LNG = BASE_LNG;

// ~700 m north — beyond the 500 m walk cutoff.
const FAR_LAT = BASE_LAT + 700 / 110540;
const FAR_LNG = BASE_LNG;

// A second nearby candidate, ~350 m east.
const NEAR2_LAT = BASE_LAT;
const NEAR2_LNG = BASE_LNG + 350 / (111320 * Math.cos((52.372 * Math.PI) / 180));

// Origin: south-facing (sunny through midday, loses sun mid-afternoon as
// the sun moves west). West-facing candidate stays sunny LATER in the
// evening when the sun is in the western sky — exactly the hand-off scenario.
const origin = makeTerrace(90001, BASE_LAT, BASE_LNG, 'S');
const nearCandidate = makeTerrace(90002, NEAR_LAT, NEAR_LNG, 'W');
const farCandidate = makeTerrace(90003, FAR_LAT, FAR_LNG, 'W');
const nearCandidate2 = makeTerrace(90004, NEAR2_LAT, NEAR2_LNG, 'W');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('findNextSunnySpot', () => {
  test('finds a valid hand-off when a nearby terrace is sunny', () => {
    // On a clear summer afternoon at 15:00 both S-facing terraces are sunny.
    // The origin will go shady at some hour; the near candidate should qualify.
    const result = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, nearCandidate],
    );
    // Should find the near candidate (the only non-origin terrace).
    expect(result).not.toBeNull();
    expect(result!.terrace.id).toBe(nearCandidate.id);
    // sunnyUntilHour must be a reasonable afternoon hour (17–22 for a summer day).
    expect(result!.sunnyUntilHour).toBeGreaterThanOrEqual(17);
    expect(result!.sunnyUntilHour).toBeLessThanOrEqual(22);
    // Walk distance should be ~300 m.
    expect(result!.walkMeters).toBeGreaterThan(200);
    expect(result!.walkMeters).toBeLessThan(450);
    // Walk minutes should be walkMeters / 80, rounded.
    expect(result!.walkMinutes).toBe(Math.round(result!.walkMeters / 80));
  });

  test('returns null when all candidates are beyond the walk cutoff', () => {
    // Only far candidate (700 m) — beyond the 500 m cutoff.
    const result = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, farCandidate],
    );
    expect(result).toBeNull();
  });

  test('returns null when the only nearby terrace is the origin itself', () => {
    const result = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin],
    );
    expect(result).toBeNull();
  });

  test('prefers the candidate that stays sunny longest', () => {
    // Two nearby candidates. We can't easily force one to be sunnier than the
    // other via facing on identical coords, so we place them at identical coords
    // but with different facings to create a spread in sunnyUntilHour.
    //
    // S-facing stays in sun through afternoon on 21 June.
    // N-facing is in the building's own shadow much of the afternoon — it will
    // lose sun earlier than S-facing in summer when the sun is to the south.
    const sFacingNearby = { ...nearCandidate, id: 90010, facing: 'S' as const };
    const nFacingNearby = { ...nearCandidate, id: 90011, facing: 'N' as const };

    const result = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, sFacingNearby, nFacingNearby],
    );

    // Should pick one of the two (both are nearby); if they have different
    // sunnyUntilHour values, the S-facing should win.
    expect(result).not.toBeNull();

    // Run both independently to compare.
    const withSOnly = findNextSunnySpot(
      origin, DATE, 'sunny', undefined, [origin, sFacingNearby],
    );
    const withNOnly = findNextSunnySpot(
      origin, DATE, 'sunny', undefined, [origin, nFacingNearby],
    );

    if (withSOnly && withNOnly) {
      // If they differ, combined result should match the longer-lasting one.
      if (withSOnly.sunnyUntilHour !== withNOnly.sunnyUntilHour) {
        const longerUntil = Math.max(withSOnly.sunnyUntilHour, withNOnly.sunnyUntilHour);
        expect(result!.sunnyUntilHour).toBe(longerUntil);
      }
      // If they're equal, either is valid — just confirm a result was returned.
    }
  });

  test('returns null when terrace list has no other entries', () => {
    const result = findNextSunnySpot(origin, DATE, 'sunny', undefined, []);
    expect(result).toBeNull();
  });

  test('respects the distance cutoff — near candidate passes, far does not', () => {
    // Include both near and far; only near should be returned.
    const resultBoth = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, nearCandidate, farCandidate],
    );
    // If a result exists, it must be the near candidate, not the far one.
    if (resultBoth) {
      expect(resultBoth.terrace.id).toBe(nearCandidate.id);
    }
    // Far-only case should return null.
    const resultFarOnly = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, farCandidate],
    );
    expect(resultFarOnly).toBeNull();
  });

  test('walkMinutes is walkMeters divided by 80 m/min, rounded', () => {
    const result = findNextSunnySpot(
      origin,
      DATE,
      'sunny',
      undefined,
      [origin, nearCandidate2],
    );
    if (result) {
      expect(result.walkMinutes).toBe(Math.round(result.walkMeters / 80));
    }
  });
});
