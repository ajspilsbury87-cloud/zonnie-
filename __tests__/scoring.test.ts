import {
  AMSTERDAM_TZ,
  amsterdamLocalToUtc,
  computeRangeScore,
  computeSunScore,
  getWeather,
  scoreLabel,
  windShelterFactor,
} from '@/src/engines/scoring';
import { bandForScore } from '@/src/engines/bands';
import { scoreToColor } from '@/src/theme/tokens';
import { solarPosition } from '@/src/engines/solar';
import type { Building, Facing, Terrace, Tree, Weather } from '@/src/engines/types';

const AMS_LAT = 52.3676;
const AMS_LNG = 4.9041;

function terrace(facing: Facing): Pick<Terrace, 'lat' | 'lng' | 'facing'> {
  return { lat: AMS_LAT, lng: AMS_LNG, facing };
}

describe('amsterdamLocalToUtc — DST handling', () => {
  test('summer time (CEST = UTC+2): 13:00 local → 11:00 UTC', () => {
    const utc = amsterdamLocalToUtc('2025-06-21', 13);
    expect(utc.toISOString()).toBe('2025-06-21T11:00:00.000Z');
  });

  test('winter time (CET = UTC+1): 13:00 local → 12:00 UTC', () => {
    const utc = amsterdamLocalToUtc('2025-12-21', 13);
    expect(utc.toISOString()).toBe('2025-12-21T12:00:00.000Z');
  });

  test('fractional hour: 13:30 local in summer → 11:30 UTC', () => {
    const utc = amsterdamLocalToUtc('2025-07-15', 13.5);
    expect(utc.toISOString()).toBe('2025-07-15T11:30:00.000Z');
  });

  test('Europe/Amsterdam timezone constant matches IANA', () => {
    expect(AMSTERDAM_TZ).toBe('Europe/Amsterdam');
  });
});

describe('computeSunScore', () => {
  test('south-facing terrace at noon scores higher than north-facing', () => {
    const south = computeSunScore(terrace('S'), 13, '2025-06-21', 'sunny');
    const north = computeSunScore(terrace('N'), 13, '2025-06-21', 'sunny');
    expect(south.score).toBeGreaterThan(north.score);
  });

  test('midnight → score 0 (sun below horizon)', () => {
    const result = computeSunScore(terrace('S'), 0, '2025-06-21', 'sunny');
    expect(result.score).toBe(0);
    expect(result.sun.altitude).toBeLessThan(0);
  });

  test('overcast weather drops score noticeably vs sunny', () => {
    const sunny = computeSunScore(terrace('S'), 13, '2025-06-21', 'sunny');
    const overcast = computeSunScore(terrace('S'), 13, '2025-06-21', 'overcast');
    // Overcast should be clearly lower, but not crushed.
    //
    // With cloud coefficient 0.30 (vs old 0.55), 100% overcast → ×0.70 and
    // a typical sunny day (~10% cloud) → ×0.97. The realistic ratio is
    // overcast ≈ 72–76% of sunny, so we test < 80% (meaningfully different)
    // and > 30% (not completely floored — diffuse light still counts).
    expect(overcast.score).toBeLessThan(sunny.score * 0.80);
    expect(overcast.score).toBeGreaterThan(sunny.score * 0.3);
  });

  test('on cloudy days the score range stays wide enough to differentiate facings', () => {
    // 95% cloud cover (overcast profile). Even with most direct sun blocked,
    // a south-facing terrace at noon must still score meaningfully higher
    // than a north-facing one — otherwise pin colors collapse to one band.
    const south = computeSunScore(terrace('S'), 13, '2025-06-21', 'overcast');
    const north = computeSunScore(terrace('N'), 13, '2025-06-21', 'overcast');
    // Either S/N gap ≥ 10 percentage points, OR S exceeds N by ≥ 30% (relative).
    // Both express "the cloud factor didn't crush all variation".
    const gap = south.score - north.score;
    expect(gap).toBeGreaterThan(0.1);
  });

  test('"All" facing terrace gets a flat bonus over a fixed-facing one', () => {
    // Use a direction where a fixed facing gets ZERO bonus (>=90° from sun).
    // At summer noon (sun ~south), an N-facing terrace has facingDiff = 180 → no bonus.
    const all = computeSunScore(terrace('All'), 13, '2025-06-21', 'sunny');
    const facingNorth = computeSunScore(terrace('N'), 13, '2025-06-21', 'sunny');
    expect(all.score).toBeGreaterThan(facingNorth.score);
  });

  test('DST: same wall-clock time in summer vs winter resolves to different sun positions', () => {
    const summer = computeSunScore(terrace('S'), 13, '2025-06-21', 'sunny');
    const winter = computeSunScore(terrace('S'), 13, '2025-12-21', 'sunny');
    // Summer noon is much higher than winter noon — score should reflect that.
    expect(summer.sun.altitude).toBeGreaterThan(50);
    expect(winter.sun.altitude).toBeGreaterThan(0);
    expect(winter.sun.altitude).toBeLessThan(20);
  });

  test('returned sun position matches solarPosition for the resolved UTC instant', () => {
    const result = computeSunScore(terrace('S'), 14, '2025-06-21', 'sunny');
    const expected = solarPosition(amsterdamLocalToUtc('2025-06-21', 14), AMS_LAT, AMS_LNG);
    expect(result.sun.altitude).toBeCloseTo(expected.altitude, 5);
    expect(result.sun.azimuth).toBeCloseTo(expected.azimuth, 5);
  });
});

describe('computeSunScore — shadow attenuation regression', () => {
  // Place a 25m building 20m due south of the terrace.
  // At summer noon, sun azimuth ≈ 180° so the building is squarely
  // between terrace and sun. Sun altitude ≈ 61°; building apparent
  // height ≈ atan(25/20) ≈ 51.3° → heightRatio ≈ 51.3/61 ≈ 0.84.
  // With HEIGHT_RATIO_FLOOR = 0.95, this building just barely falls
  // below the penumbra band so coverage ≈ 0 and scores are similar.
  // BUT at winter noon (alt ≈ 14°) the same building is clearly above
  // the sun → full shadow, big score drop. So we test winter noon.
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320 * Math.cos(52.3676 * (Math.PI / 180));
  const distM = 20;
  const heightM = 25;

  function buildingDueSouth(from: { lat: number; lng: number }): Building {
    // Place building 20m due south (bearing 180°) → north of building
    return {
      lat: from.lat - distM / M_PER_DEG_LAT,
      lng: from.lng,
      height: heightM,
      width: 15,
    };
  }

  test('tall south building at winter noon drops score materially (shadow bites)', () => {
    const t = terrace('S');
    const building = buildingDueSouth(t);
    // Winter noon: sun altitude ≈ 14°, azimuth ≈ 180°.
    // Building apparent height ≈ 51.3° >> sun 14° → heightRatio >> 1 → full coverage → big penalty.
    const withShadow = computeSunScore(t, 12, '2025-12-21', 'sunny', undefined, [building]);
    const noShadow = computeSunScore(t, 12, '2025-12-21', 'sunny', undefined, []);
    // Shadow should bite hard — at least 50% score reduction.
    expect(withShadow.score).toBeLessThan(noShadow.score * 0.5);
    // The shadow coverage should be reported in the result.
    expect(withShadow.shadow).toBeGreaterThan(0.5);
    expect(noShadow.shadow).toBe(0);
  });

  test('shadow field is zero when sun is below the horizon', () => {
    const t = terrace('S');
    const building = buildingDueSouth(t);
    const midnight = computeSunScore(t, 0, '2025-06-21', 'sunny', undefined, [building]);
    expect(midnight.shadow).toBe(0);
    expect(midnight.score).toBe(0);
  });

  test('openness multiplier: canyon terrace scores ×0.85 of an open one', () => {
    const open = computeSunScore(
      { ...terrace('S'), openness: 1 }, 13, '2025-06-21', 'sunny',
    );
    const canyon = computeSunScore(
      { ...terrace('S'), openness: 0 }, 13, '2025-06-21', 'sunny',
    );
    const missing = computeSunScore(terrace('S'), 13, '2025-06-21', 'sunny');
    expect(canyon.score).toBeCloseTo(open.score * 0.85, 5);
    // Absent field (fixtures / legacy data) behaves like fully open.
    expect(missing.score).toBeCloseTo(open.score, 5);
  });

  test('tall tree to the south at winter noon reduces score (tree shadow path)', () => {
    const t = terrace('S');
    // Crown 15m tall (12m above a 3m trunk) ~15m due south → squarely
    // between terrace and the low winter sun → tree canopy shadow bites.
    const tree: Tree = {
      lat: t.lat - 15 / M_PER_DEG_LAT,
      lng: t.lng,
      height: 15,
      crownRadius: 4,
      trunkHeight: 3,
    };
    const withTree = computeSunScore(t, 12, '2025-12-21', 'sunny', undefined, [], [tree]);
    const noTree = computeSunScore(t, 12, '2025-12-21', 'sunny', undefined, [], []);
    // Tree path must actually reduce the score and report coverage.
    expect(withTree.score).toBeLessThan(noTree.score * 0.8);
    expect(withTree.shadow).toBeGreaterThan(0);
  });
});

describe('getWeather', () => {
  test('sunny profile → low cloud cover', () => {
    expect(getWeather(13, 'sunny').cloudCover).toBeLessThan(30);
  });

  test('overcast profile → high cloud cover', () => {
    expect(getWeather(13, 'overcast').cloudCover).toBeGreaterThan(80);
  });

  test('clamps to 0–100', () => {
    for (let h = 0; h < 24; h++) {
      const w = getWeather(h, 'sunny');
      expect(w.cloudCover).toBeGreaterThanOrEqual(0);
      expect(w.cloudCover).toBeLessThanOrEqual(100);
    }
  });
});

describe('windShelterFactor', () => {
  const calm = { cloudCover: 10, temp: 18, windSpeed: 5, windDirection: 0 };
  const stiff = { cloudCover: 10, temp: 14, windSpeed: 25, windDirection: 0 }; // wind from N

  test('no penalty when wind is calm (<8 km/h)', () => {
    expect(windShelterFactor('S', calm)).toBe(1.0);
    expect(windShelterFactor('N', calm)).toBe(1.0);
  });

  test('no penalty when wind data missing (synthetic profile)', () => {
    expect(windShelterFactor('S', { cloudCover: 10, temp: 18 })).toBe(1.0);
  });

  test('S-facing terrace is sheltered when wind comes from N (windDir 0)', () => {
    // Wind FROM N hits the building behind the S-facing terrace, terrace
    // is in the lee. Penalty should be ~0.
    const factor = windShelterFactor('S', stiff);
    expect(factor).toBeGreaterThan(0.99);
  });

  test('N-facing terrace is exposed when wind comes from N (windDir 0)', () => {
    // Wind FROM N blows directly INTO the open seating of an N-facing
    // terrace. Exposed → penalty applies.
    const factor = windShelterFactor('N', stiff);
    expect(factor).toBeLessThan(0.99);
    expect(factor).toBeGreaterThan(0.85); // capped at ~15%
  });

  test('penalty caps at ~15% even in extreme wind', () => {
    const gale = { cloudCover: 10, temp: 14, windSpeed: 100, windDirection: 0 };
    expect(windShelterFactor('N', gale)).toBeGreaterThanOrEqual(0.85);
  });

  test('"All" facing takes the full penalty regardless of wind direction', () => {
    // No shelter at any angle → penalty applies as if maximally exposed.
    const fA = windShelterFactor('All', stiff);
    expect(fA).toBeLessThan(1.0);
    // Sanity: more penalty than a sheltered compass direction (S, lee from N wind).
    expect(fA).toBeLessThan(windShelterFactor('S', stiff));
    // And roughly the same as a fully-exposed direction (N, into N wind).
    expect(fA).toBeCloseTo(windShelterFactor('N', stiff), 5);
  });
});

describe('label/color thresholds', () => {
  test('scoreLabel buckets (Dutch)', () => {
    // Sample values sit mid-band for the recalibrated thresholds
    // (0.85/0.65/0.4/0.15 — see bands.ts rationale, audit finding 20).
    expect(scoreLabel(0.9)).toBe('Volle zon');
    expect(scoreLabel(0.75)).toBe('Grotendeels zonnig');
    expect(scoreLabel(0.5)).toBe('Deels zonnig');
    expect(scoreLabel(0.25)).toBe('Grotendeels schaduw');
    expect(scoreLabel(0.05)).toBe('In de schaduw');
  });

  test('scoreToColor returns a hex string for any score', () => {
    // scoreToColor lives in src/theme/tokens — canonical mapping that
    // stays in sync with the brand palette. scoreColor from scoring.ts
    // was a duplicate with hardcoded hex values and has been removed.
    for (const s of [0, 0.15, 0.4, 0.6, 0.8]) {
      expect(scoreToColor(s)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

// ── FIX C1: NaN weather guard ─────────────────────────────────────────────
//
// Open-Meteo can return NaN values that slip through `?? 0` (nullish
// coalescing does NOT catch NaN). These tests confirm that any NaN
// weatherOverride field is sanitized before it poisons the score chain.
// All assertions use a sunny summer noon so the sun is above the horizon
// and the weather values are the only variable under test.
describe('computeSunScore — NaN weather guard (Fix C1)', () => {
  const t = terrace('S');
  const date = '2025-06-21';
  const hour = 13; // summer noon, sun well above horizon

  function isFiniteScore(score: number): boolean {
    return Number.isFinite(score) && score >= 0 && score <= 1;
  }

  test('NaN cloudCover → finite score in [0, 1]', () => {
    const w: Weather = { cloudCover: NaN, temp: 20 };
    const result = computeSunScore(t, hour, date, 'sunny', w);
    expect(isFiniteScore(result.score)).toBe(true);
    // Weather in the result must also be sanitized (UI may render it directly).
    expect(Number.isFinite(result.weather.cloudCover)).toBe(true);
  });

  test('NaN directRadiation → finite score in [0, 1]', () => {
    const w: Weather = { cloudCover: 10, temp: 20, directRadiation: NaN };
    const result = computeSunScore(t, hour, date, 'sunny', w);
    expect(isFiniteScore(result.score)).toBe(true);
    // NaN directRadiation should be dropped; PATH B (cloudCover) used instead.
    expect(result.weather.directRadiation).toBeUndefined();
  });

  test('NaN temp → finite score in [0, 1]', () => {
    const w: Weather = { cloudCover: 10, temp: NaN };
    const result = computeSunScore(t, hour, date, 'sunny', w);
    expect(isFiniteScore(result.score)).toBe(true);
    expect(Number.isFinite(result.weather.temp)).toBe(true);
  });

  test('NaN windSpeed → finite score in [0, 1]', () => {
    const w: Weather = { cloudCover: 10, temp: 20, windSpeed: NaN, windDirection: 180 };
    const result = computeSunScore(t, hour, date, 'sunny', w);
    expect(isFiniteScore(result.score)).toBe(true);
    // NaN windSpeed should be dropped to undefined so windShelterFactor returns 1.0.
    expect(result.weather.windSpeed).toBeUndefined();
  });

  test('computeRangeScore with one NaN-cloud entry in hourlyWeather → finite result', () => {
    // Simulates the real-world Open-Meteo path: a 24-hour array where one
    // hour has a NaN cloudCover. The range score must still be finite.
    const hourlyWeather: Weather[] = Array.from({ length: 24 }, (_, h) =>
      h === hour
        ? { cloudCover: NaN, temp: 20 }
        : { cloudCover: 10, temp: 20 },
    );
    const rangeScore = computeRangeScore(t, 12, 14, date, 'sunny', hourlyWeather);
    expect(Number.isFinite(rangeScore)).toBe(true);
    expect(rangeScore).toBeGreaterThanOrEqual(0);
    expect(rangeScore).toBeLessThanOrEqual(1);
  });
});

// ── FIX B5-1: bandForScore boundary semantics ────────────────────────────
//
// The thresholds are strict > so an exact boundary value falls into the
// LOWER band. These tests pin that contract so a future edit to the
// numbers in bands.ts is visible as a test failure, not a silent change.
describe('bandForScore — boundary semantics (Fix B5-1, recalibrated finding 20)', () => {
  // Thresholds recalibrated 2026-06 (0.85/0.65/0.4/0.15 — see bands.ts
  // rationale): "Volle zon" is now earned (~18% of pins at sunny peak,
  // was 56%). Strict > semantics unchanged.
  test('0.85 is NOT "full" (strict >)', () => {
    expect(bandForScore(0.85)).toBe('mostly');
  });

  test('0.85001 is "full"', () => {
    expect(bandForScore(0.85001)).toBe('full');
  });

  test('0.65 is NOT "mostly" (strict >)', () => {
    expect(bandForScore(0.65)).toBe('partial');
  });

  test('0.4 is NOT "partial" (strict >)', () => {
    expect(bandForScore(0.4)).toBe('mshade');
  });

  test('0.15 is NOT "mshade" (strict >)', () => {
    expect(bandForScore(0.15)).toBe('shade');
  });

  test('0 → shade, 1 → full', () => {
    expect(bandForScore(0)).toBe('shade');
    expect(bandForScore(1)).toBe('full');
  });

  test('NaN → shade (safe fallback)', () => {
    // NaN > any number is false, so all if-branches fail → falls through to shade.
    expect(bandForScore(NaN)).toBe('shade');
  });

  test('scoreLabel, scoreToColor, and bandForScore all agree at sample points', () => {
    // Cross-check: a score in the "full" band must produce "Volle zon" and
    // a non-ink colour across all three consumers.
    const scores = [0.05, 0.15, 0.35, 0.55, 0.75, 0.95];
    for (const s of scores) {
      const band = bandForScore(s);
      const label = scoreLabel(s);
      const color = scoreToColor(s);
      // Confirm band/label agreement.
      if (band === 'full')    expect(label).toBe('Volle zon');
      if (band === 'mostly')  expect(label).toBe('Grotendeels zonnig');
      if (band === 'partial') expect(label).toBe('Deels zonnig');
      if (band === 'mshade')  expect(label).toBe('Grotendeels schaduw');
      if (band === 'shade')   expect(label).toBe('In de schaduw');
      // Color is always a valid hex string.
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
