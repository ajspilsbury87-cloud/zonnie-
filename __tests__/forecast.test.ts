import {
  findGoodWeatherBlock,
  formatNotificationBody,
} from '@/src/notifications/forecast';
import type { Weather } from '@/src/engines/types';

/** Build a 24-hour array filled with synthetic weather. */
function makeForecast(filler: Partial<Weather> = {}): Weather[] {
  return Array.from({ length: 24 }, () => ({
    cloudCover: 80,
    temp: 8,
    ...filler,
  }));
}

describe('findGoodWeatherBlock', () => {
  test('returns null when forecast is empty', () => {
    expect(findGoodWeatherBlock([])).toBeNull();
  });

  test('returns null when no hour qualifies', () => {
    const f = makeForecast({ cloudCover: 90, temp: 8 });
    expect(findGoodWeatherBlock(f)).toBeNull();
  });

  test('returns null when block is shorter than 3 hours', () => {
    const f = makeForecast();
    f[14] = { cloudCover: 10, temp: 20 };
    f[15] = { cloudCover: 15, temp: 21 };
    // 2-hour block — under MIN_BLOCK_HOURS (3)
    expect(findGoodWeatherBlock(f)).toBeNull();
  });

  test('finds the longest contiguous good block', () => {
    const f = makeForecast();
    // Short block 9-10 (2h, ineligible)
    f[9] = { cloudCover: 20, temp: 18 };
    f[10] = { cloudCover: 25, temp: 19 };
    // Long block 14-19 (6h)
    f[14] = { cloudCover: 10, temp: 20 };
    f[15] = { cloudCover: 12, temp: 21 };
    f[16] = { cloudCover: 15, temp: 22 };
    f[17] = { cloudCover: 18, temp: 21 };
    f[18] = { cloudCover: 20, temp: 19 };
    f[19] = { cloudCover: 22, temp: 17 };
    const block = findGoodWeatherBlock(f);
    expect(block).not.toBeNull();
    expect(block!.fromHour).toBe(14);
    expect(block!.toHour).toBe(19);
  });

  test('respects the 9..21 hour window', () => {
    const f = makeForecast();
    // Pre-9 block — should be ignored
    f[5] = { cloudCover: 10, temp: 20 };
    f[6] = { cloudCover: 10, temp: 20 };
    f[7] = { cloudCover: 10, temp: 20 };
    f[8] = { cloudCover: 10, temp: 20 };
    expect(findGoodWeatherBlock(f)).toBeNull();
  });

  test('rejects cold temperatures even with clear sky', () => {
    const f = makeForecast();
    for (let h = 14; h <= 18; h++) {
      f[h] = { cloudCover: 5, temp: 8 }; // sunny but cold
    }
    expect(findGoodWeatherBlock(f)).toBeNull();
  });

  test('rejects cloudy hours even when warm', () => {
    const f = makeForecast();
    for (let h = 14; h <= 18; h++) {
      f[h] = { cloudCover: 80, temp: 22 }; // warm but overcast
    }
    expect(findGoodWeatherBlock(f)).toBeNull();
  });

  test('block boundary handles right at the 40% / 14°C edge', () => {
    const f = makeForecast();
    // Exactly 40% cloud is NOT good (strict <)
    for (let h = 14; h <= 17; h++) {
      f[h] = { cloudCover: 40, temp: 20 };
    }
    expect(findGoodWeatherBlock(f)).toBeNull();
    // Exactly 14°C IS good (>=)
    for (let h = 14; h <= 17; h++) {
      f[h] = { cloudCover: 30, temp: 14 };
    }
    expect(findGoodWeatherBlock(f)).not.toBeNull();
  });

  test('reports correct averages for the chosen block', () => {
    const f = makeForecast();
    f[14] = { cloudCover: 10, temp: 20 };
    f[15] = { cloudCover: 20, temp: 22 };
    f[16] = { cloudCover: 30, temp: 24 };
    const block = findGoodWeatherBlock(f);
    expect(block!.avgCloudCover).toBe(20);
    expect(block!.avgTemp).toBe(22);
  });
});

describe('formatNotificationBody', () => {
  test('zero-pads hours', () => {
    expect(
      formatNotificationBody({
        fromHour: 9,
        toHour: 17,
        avgCloudCover: 20,
        avgTemp: 21,
      }),
    ).toBe(
      'Lekker terrasweer van 09:00 tot 17:00 — vind een zonnig terras →',
    );
  });
});
