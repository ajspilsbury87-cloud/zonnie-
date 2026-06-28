import { findGoodWeatherBlock, isTopTierBlock } from '@/src/notifications/forecast';
import { shouldShowSunsOut } from '@/src/lib/sunsOut';
import type { Weather } from '@/src/engines/types';

/**
 * Build a 24-element hourly array with a weather block of `cloud`/`temp`
 * across [from..to] inclusive, and overcast/cold filler elsewhere so the
 * block is the only "good" stretch.
 */
function makeHourly(from: number, to: number, cloud: number, temp: number): (Weather | undefined)[] {
  const arr: (Weather | undefined)[] = Array.from({ length: 24 }, () => ({
    cloudCover: 90,
    temp: 8,
  }));
  for (let h = from; h <= to; h++) arr[h] = { cloudCover: cloud, temp };
  return arr;
}

describe('isTopTierBlock', () => {
  it('is true for a long, clear, warm block (6h, 10% cloud, 22°C)', () => {
    const block = findGoodWeatherBlock(makeHourly(13, 18, 10, 22));
    expect(block).not.toBeNull();
    expect(isTopTierBlock(block!)).toBe(true);
  });

  it('is false for a short block (3h) even if clear and warm', () => {
    const block = findGoodWeatherBlock(makeHourly(13, 15, 10, 22));
    expect(block).not.toBeNull();
    expect(isTopTierBlock(block!)).toBe(false);
  });

  it('is false for a long but hazy block (35% cloud > 25 threshold)', () => {
    const block = findGoodWeatherBlock(makeHourly(13, 19, 35, 22));
    expect(block).not.toBeNull();
    expect(isTopTierBlock(block!)).toBe(false);
  });

  it('is false for a long warm-ish but cool block (16°C < 18 threshold)', () => {
    const block = findGoodWeatherBlock(makeHourly(13, 19, 10, 16));
    expect(block).not.toBeNull();
    expect(isTopTierBlock(block!)).toBe(false);
  });
});

describe('shouldShowSunsOut', () => {
  const topTier = makeHourly(13, 18, 10, 22);

  it('shows on a top-tier day not yet shown today', () => {
    expect(shouldShowSunsOut(topTier, null, '2026-06-25')).toBe(true);
    expect(shouldShowSunsOut(topTier, '2026-06-24', '2026-06-25')).toBe(true);
  });

  it('does not show twice on the same day', () => {
    expect(shouldShowSunsOut(topTier, '2026-06-25', '2026-06-25')).toBe(false);
  });

  it('does not show while weather is still loading', () => {
    expect(shouldShowSunsOut(undefined, null, '2026-06-25')).toBe(false);
    expect(shouldShowSunsOut([], null, '2026-06-25')).toBe(false);
  });

  it('does not show on a non-top-tier day', () => {
    const meh = makeHourly(13, 15, 10, 22); // only 3 good hours
    expect(shouldShowSunsOut(meh, null, '2026-06-25')).toBe(false);
  });
});
