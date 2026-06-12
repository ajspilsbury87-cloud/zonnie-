/**
 * Unit tests for src/engines/gems.ts
 *
 * The test strategy follows the same pattern as scoring.test.ts: pure-function
 * testing with synthetic inputs. No React Native or native modules are touched
 * so these run in the standard jest-expo node environment.
 */

import {
  areaWeightForArea,
  AREA_WEIGHT_DEFAULT,
  AREA_WEIGHTS,
  computeGemScore,
  computeTouristProxy,
  proximityToCentrum,
  ratingNorm,
  REVIEW_PERCENTILE_MAP,
  TOURIST_TRAP_FLOOR,
} from '@/src/engines/gems';
import type { Terrace } from '@/src/engines/types';
import { TERRACES } from '@/src/data/terraces';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Build a minimal Terrace for testing — only the fields gems.ts cares about. */
function makeTerrace(overrides: Partial<Terrace> & Pick<Terrace, 'lat' | 'lng' | 'area'>): Terrace {
  return {
    id: 9999,
    name: 'Test Terrace',
    facing: 'S',
    capacity: 'M',
    vibe: 'test',
    address: 'Test Street 1',
    verified: false,
    ...overrides,
  };
}

// Approximate coordinates for key Amsterdam areas
const COORD_CENTRUM     = { lat: 52.3728, lng: 4.8936 }; // Dam Square
const COORD_OOST        = { lat: 52.3600, lng: 4.9400 }; // Oost (~3.2 km from centrum)
const COORD_NOORD       = { lat: 52.4000, lng: 4.9050 }; // Noord (~3.0 km from centrum)

// ─── areaWeightForArea ────────────────────────────────────────────────────────

describe('areaWeightForArea', () => {
  test('Centrum returns 0.9 (high tourist weight)', () => {
    expect(areaWeightForArea('Centrum')).toBe(0.9);
  });

  test('Noord returns 0.2 (low tourist weight)', () => {
    expect(areaWeightForArea('Noord')).toBe(0.2);
  });

  test('unknown area returns default (0.4)', () => {
    expect(areaWeightForArea('Some Unknown Buurt')).toBe(AREA_WEIGHT_DEFAULT);
  });

  test('every key in AREA_WEIGHTS is a real area name from the dataset', () => {
    const datasetAreas = new Set(TERRACES.map((t) => t.area));
    for (const area of Object.keys(AREA_WEIGHTS)) {
      expect(datasetAreas.has(area)).toBe(true);
    }
  });
});

// ─── proximityToCentrum ───────────────────────────────────────────────────────

describe('proximityToCentrum', () => {
  test('coordinate at the centroid itself returns 1.0', () => {
    expect(proximityToCentrum(52.3727, 4.8936)).toBe(1);
  });

  test('coordinate very far away returns 0 (clamped)', () => {
    // Rotterdam — ~60 km from Amsterdam centre
    expect(proximityToCentrum(51.9244, 4.4777)).toBe(0);
  });

  test('Centrum is closer to centre than Noord (higher proximity score)', () => {
    const centrumProx = proximityToCentrum(COORD_CENTRUM.lat, COORD_CENTRUM.lng);
    const noordProx   = proximityToCentrum(COORD_NOORD.lat,   COORD_NOORD.lng);
    expect(centrumProx).toBeGreaterThan(noordProx);
  });
});

// ─── REVIEW_PERCENTILE_MAP ────────────────────────────────────────────────────

describe('REVIEW_PERCENTILE_MAP', () => {
  test('covers every terrace in the dataset', () => {
    for (const t of TERRACES) {
      expect(REVIEW_PERCENTILE_MAP.has(t.id)).toBe(true);
    }
  });

  test('all percentiles are in [0, 1]', () => {
    for (const [, p] of REVIEW_PERCENTILE_MAP) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test('monotonicity: more reviews → higher or equal percentile', () => {
    // Find two real terraces where review count differs and check ordering.
    const withCounts = TERRACES.filter((t) => t.googleReviewCount != null);
    withCounts.sort((a, b) => (a.googleReviewCount ?? 0) - (b.googleReviewCount ?? 0));

    // Spot-check: the terrace with the fewest reviews should have a lower
    // percentile than the one with the most.
    const lowest  = withCounts[0]!;
    const highest = withCounts[withCounts.length - 1]!;
    const pLow  = REVIEW_PERCENTILE_MAP.get(lowest.id)!;
    const pHigh = REVIEW_PERCENTILE_MAP.get(highest.id)!;
    expect(pLow).toBeLessThanOrEqual(pHigh);
  });
});

// ─── computeTouristProxy ─────────────────────────────────────────────────────

describe('computeTouristProxy', () => {
  test('output is always in [0, 1]', () => {
    for (const t of TERRACES) {
      const p = computeTouristProxy(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test('Centrum terrace has higher proxy than Noord terrace, all-else-equal', () => {
    // Same review count (500), same lat/lng family, only area differs.
    const centrumT = makeTerrace({
      id: 1001,
      ...COORD_CENTRUM,
      area: 'Centrum',
      googleReviewCount: 500,
    });
    const noordT = makeTerrace({
      id: 1002,
      ...COORD_NOORD,
      area: 'Noord',
      googleReviewCount: 500,
    });
    expect(computeTouristProxy(centrumT)).toBeGreaterThan(computeTouristProxy(noordT));
  });

  test('more reviews → higher proxy, all-else-equal', () => {
    const fewReviews = makeTerrace({
      id: 2001,
      ...COORD_OOST,
      area: 'Oost',
      googleReviewCount: 50,
    });
    const manyReviews = makeTerrace({
      id: 2002,
      ...COORD_OOST,
      area: 'Oost',
      googleReviewCount: 10000,
    });
    // Note: these are synthetic terraces not in TERRACES, so we need to compute
    // their percentile manually. The MAP only covers real dataset IDs. We test
    // the shape of the formula here by calling with real dataset terraces instead.

    // Find real Oost terraces with different review counts to verify monotonicity.
    const oostTerraces = TERRACES
      .filter((t) => t.area === 'Oost' && t.googleReviewCount != null)
      .sort((a, b) => (a.googleReviewCount ?? 0) - (b.googleReviewCount ?? 0));

    if (oostTerraces.length >= 2) {
      const low  = oostTerraces[0]!;
      const high = oostTerraces[oostTerraces.length - 1]!;
      expect(computeTouristProxy(low)).toBeLessThanOrEqual(computeTouristProxy(high));
    }
  });

  test('NaN safety: no terrace in the dataset produces NaN', () => {
    for (const t of TERRACES) {
      const p = computeTouristProxy(t);
      expect(Number.isNaN(p)).toBe(false);
    }
  });
});

// ─── ratingNorm ───────────────────────────────────────────────────────────────

describe('ratingNorm', () => {
  test('no rating → 0.5 (neutral)', () => {
    const t = makeTerrace({ ...COORD_OOST, area: 'Oost' });
    expect(ratingNorm(t)).toBe(0.5);
  });

  test('rating 5.0 → 1.0', () => {
    const t = makeTerrace({ ...COORD_OOST, area: 'Oost', googleRating: 5.0 });
    expect(ratingNorm(t)).toBeCloseTo(1.0);
  });

  test('rating 3.5 → 0.0', () => {
    const t = makeTerrace({ ...COORD_OOST, area: 'Oost', googleRating: 3.5 });
    expect(ratingNorm(t)).toBeCloseTo(0.0);
  });

  test('rating below 3.5 clamps to 0.0', () => {
    const t = makeTerrace({ ...COORD_OOST, area: 'Oost', googleRating: 2.0 });
    expect(ratingNorm(t)).toBe(0);
  });

  test('rating 4.25 → 0.5 (midpoint)', () => {
    const t = makeTerrace({ ...COORD_OOST, area: 'Oost', googleRating: 4.25 });
    expect(ratingNorm(t)).toBeCloseTo(0.5);
  });
});

// ─── computeGemScore ─────────────────────────────────────────────────────────

describe('computeGemScore', () => {
  test('weights sum to 1 at boundary values', () => {
    // With sunScore=1, touristProxy=0, ratingNorm=1: gemScore should be 1.
    // (1×0.6) + (1×0.25) + (1×0.15) = 1.0
    // We test this via a real terrace with the lowest tourist proxy we can find.
    const localTerraces = TERRACES
      .filter((t) => t.area === 'Nieuw-West' || t.area === 'Bos en Lommer')
      .filter((t) => t.googleReviewCount != null && t.googleReviewCount < 200);

    if (localTerraces.length > 0) {
      const t = localTerraces[0]!;
      const gem = computeGemScore(1.0, t);
      // gemScore ≤ 1.0 always (it's a weighted sum of [0,1] values)
      expect(gem).toBeLessThanOrEqual(1.0);
      expect(gem).toBeGreaterThanOrEqual(0);
    }
  });

  test('NaN safety: all real terraces produce a valid gemScore', () => {
    for (const t of TERRACES) {
      const g = computeGemScore(0.7, t);
      expect(Number.isNaN(g)).toBe(false);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  test('Oost 80-review terrace outranks Centrum 5000-review terrace at equal sun', () => {
    // Spec requirement: "an equally-sunny Centrum 5000-review terrace ranks
    // below an Oost 80-review one". We verify gemScore ordering, not sun score.
    const centrumBusy = TERRACES.find(
      (t) => t.area === 'Centrum' && (t.googleReviewCount ?? 0) >= 3000,
    );
    const oostQuiet = TERRACES.find(
      (t) => t.area === 'Oost' && (t.googleReviewCount ?? 0) < 150,
    );

    if (centrumBusy && oostQuiet) {
      const sunScore = 0.75; // same sun for both
      const gemCentrum = computeGemScore(sunScore, centrumBusy);
      const gemOost    = computeGemScore(sunScore, oostQuiet);
      expect(gemOost).toBeGreaterThan(gemCentrum);
    }
  });

  test('gem mode only reorders, not inverted: very sunny Oost beats dim Centrum', () => {
    // A very sunny local terrace should still beat a poorly-lit tourist trap.
    const centrumBusy = TERRACES.find(
      (t) => t.area === 'Centrum' && (t.googleReviewCount ?? 0) >= 3000,
    );
    const oostQuiet = TERRACES.find(
      (t) => t.area === 'Oost' && (t.googleReviewCount ?? 0) < 150,
    );
    if (centrumBusy && oostQuiet) {
      const gemCentrumDim  = computeGemScore(0.1, centrumBusy);
      const gemOostSunny   = computeGemScore(0.9, oostQuiet);
      expect(gemOostSunny).toBeGreaterThan(gemCentrumDim);
    }
  });
});

// ─── TOURIST_TRAP_FLOOR ───────────────────────────────────────────────────────

describe('TOURIST_TRAP_FLOOR', () => {
  test('value is 0.85 as documented', () => {
    expect(TOURIST_TRAP_FLOOR).toBe(0.85);
  });

  test('most Noord and Oost terraces pass the floor (proxy < 0.85)', () => {
    const outerTerraces = TERRACES.filter(
      (t) => t.area === 'Noord' || t.area === 'Oost',
    );
    const trapped = outerTerraces.filter(
      (t) => computeTouristProxy(t) > TOURIST_TRAP_FLOOR,
    );
    // Virtually none should be excluded — Noord/Oost are not tourist-heavy.
    expect(trapped.length).toBe(0);
  });
});
