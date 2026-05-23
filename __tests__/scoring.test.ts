import {
  AMSTERDAM_TZ,
  amsterdamLocalToUtc,
  computeSunScore,
  getWeather,
  scoreLabel,
  windShelterFactor,
} from '@/src/engines/scoring';
import { scoreToColor } from '@/src/theme/tokens';
import { solarPosition } from '@/src/engines/solar';
import type { Facing, Terrace } from '@/src/engines/types';

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
    const south = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'sunny');
    const north = computeSunScore(terrace('N'), [], 13, '2025-06-21', 'sunny');
    expect(south.score).toBeGreaterThan(north.score);
  });

  test('midnight → score 0 (sun below horizon)', () => {
    const result = computeSunScore(terrace('S'), [], 0, '2025-06-21', 'sunny');
    expect(result.score).toBe(0);
    expect(result.sun.altitude).toBeLessThan(0);
  });

  test('overcast weather drops score noticeably vs sunny', () => {
    const sunny = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'sunny');
    const overcast = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'overcast');
    // Overcast should be clearly lower (50% headroom is enough), but NOT
    // crushed to ~15% — that was the old 0.85 cloud factor and it caused
    // every terrace on a cloudy day to fall in the same low score band.
    expect(overcast.score).toBeLessThan(sunny.score * 0.7);
    expect(overcast.score).toBeGreaterThan(sunny.score * 0.3);
  });

  test('on cloudy days the score range stays wide enough to differentiate facings', () => {
    // 95% cloud cover (overcast profile). Even with most direct sun blocked,
    // a south-facing terrace at noon must still score meaningfully higher
    // than a north-facing one — otherwise pin colors collapse to one band.
    const south = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'overcast');
    const north = computeSunScore(terrace('N'), [], 13, '2025-06-21', 'overcast');
    // Either S/N gap ≥ 10 percentage points, OR S exceeds N by ≥ 30% (relative).
    // Both express "the cloud factor didn't crush all variation".
    const gap = south.score - north.score;
    expect(gap).toBeGreaterThan(0.1);
  });

  test('"All" facing terrace gets a flat bonus over a fixed-facing one', () => {
    // Use a direction where a fixed facing gets ZERO bonus (>=90° from sun).
    // At summer noon (sun ~south), an N-facing terrace has facingDiff = 180 → no bonus.
    const all = computeSunScore(terrace('All'), [], 13, '2025-06-21', 'sunny');
    const facingNorth = computeSunScore(terrace('N'), [], 13, '2025-06-21', 'sunny');
    expect(all.score).toBeGreaterThan(facingNorth.score);
  });

  test('DST: same wall-clock time in summer vs winter resolves to different sun positions', () => {
    const summer = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'sunny');
    const winter = computeSunScore(terrace('S'), [], 13, '2025-12-21', 'sunny');
    // Summer noon is much higher than winter noon — score should reflect that.
    expect(summer.sun.altitude).toBeGreaterThan(50);
    expect(winter.sun.altitude).toBeGreaterThan(0);
    expect(winter.sun.altitude).toBeLessThan(20);
  });

  test('returned sun position matches solarPosition for the resolved UTC instant', () => {
    const result = computeSunScore(terrace('S'), [], 14, '2025-06-21', 'sunny');
    const expected = solarPosition(amsterdamLocalToUtc('2025-06-21', 14), AMS_LAT, AMS_LNG);
    expect(result.sun.altitude).toBeCloseTo(expected.altitude, 5);
    expect(result.sun.azimuth).toBeCloseTo(expected.azimuth, 5);
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
    expect(scoreLabel(0.9)).toBe('Volle zon');
    expect(scoreLabel(0.6)).toBe('Grotendeels zonnig');
    expect(scoreLabel(0.4)).toBe('Deels zonnig');
    expect(scoreLabel(0.2)).toBe('Grotendeels schaduw');
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
