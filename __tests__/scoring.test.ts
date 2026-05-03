import {
  AMSTERDAM_TZ,
  amsterdamLocalToUtc,
  computeSunScore,
  getWeather,
  scoreColor,
  scoreLabel,
} from '@/src/engines/scoring';
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

  test('overcast weather drops score significantly vs sunny', () => {
    const sunny = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'sunny');
    const overcast = computeSunScore(terrace('S'), [], 13, '2025-06-21', 'overcast');
    expect(overcast.score).toBeLessThan(sunny.score * 0.3);
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

describe('label/color thresholds', () => {
  test('scoreLabel buckets', () => {
    expect(scoreLabel(0.9)).toBe('Full Sun');
    expect(scoreLabel(0.6)).toBe('Mostly Sunny');
    expect(scoreLabel(0.4)).toBe('Partial Sun');
    expect(scoreLabel(0.2)).toBe('Mostly Shade');
    expect(scoreLabel(0.05)).toBe('In Shadow');
  });

  test('scoreColor returns a hex string for any score', () => {
    for (const s of [0, 0.15, 0.4, 0.6, 0.8]) {
      expect(scoreColor(s)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
