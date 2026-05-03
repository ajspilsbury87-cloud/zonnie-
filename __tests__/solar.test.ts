import { solarPosition } from '@/src/engines/solar';

const AMS_LAT = 52.3676;
const AMS_LNG = 4.9041;

// Solar noon UTC at Amsterdam ≈ 11:40 (longitude offset from UTC meridian).
// Equation of time wobble can shift this ±15 min, hence the loose tolerances.
const SOLAR_NOON_UTC_HOUR = 11.67;

function utc(year: number, month: number, day: number, hourFloat: number): Date {
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  return new Date(Date.UTC(year, month - 1, day, h, m, 0));
}

describe('solarPosition (Amsterdam)', () => {
  test('summer solstice solar noon → max altitude ~61° due south', () => {
    const date = utc(2025, 6, 21, SOLAR_NOON_UTC_HOUR);
    const { altitude, azimuth } = solarPosition(date, AMS_LAT, AMS_LNG);
    // 90° - 52.37° + 23.44° = 61.07°
    expect(altitude).toBeGreaterThan(59);
    expect(altitude).toBeLessThan(62);
    expect(Math.abs(azimuth - 180)).toBeLessThan(8);
  });

  test('winter solstice solar noon → max altitude ~14° due south', () => {
    const date = utc(2025, 12, 21, SOLAR_NOON_UTC_HOUR);
    const { altitude, azimuth } = solarPosition(date, AMS_LAT, AMS_LNG);
    // 90° - 52.37° - 23.44° = 14.19°
    expect(altitude).toBeGreaterThan(12);
    expect(altitude).toBeLessThan(16);
    expect(Math.abs(azimuth - 180)).toBeLessThan(8);
  });

  test('spring equinox solar noon → max altitude ~37.6° due south', () => {
    const date = utc(2026, 3, 20, SOLAR_NOON_UTC_HOUR);
    const { altitude, azimuth } = solarPosition(date, AMS_LAT, AMS_LNG);
    // 90° - 52.37° = 37.63°
    expect(altitude).toBeGreaterThan(35);
    expect(altitude).toBeLessThan(40);
    expect(Math.abs(azimuth - 180)).toBeLessThan(8);
  });

  test('midnight UTC mid-summer → sun below horizon', () => {
    const date = utc(2025, 6, 21, 0);
    const { altitude } = solarPosition(date, AMS_LAT, AMS_LNG);
    expect(altitude).toBeLessThan(0);
  });

  test('equinox morning → low altitude in the east', () => {
    // Sunrise on equinox is at solar_noon - 6h ≈ 05:40 UTC. At 07:00 UTC the sun
    // is well above the horizon and still in the eastern half of the sky.
    const date = utc(2026, 3, 20, 7);
    const { altitude, azimuth } = solarPosition(date, AMS_LAT, AMS_LNG);
    expect(altitude).toBeGreaterThan(5);
    expect(altitude).toBeLessThan(20);
    expect(azimuth).toBeGreaterThan(80);
    expect(azimuth).toBeLessThan(130);
  });
});
