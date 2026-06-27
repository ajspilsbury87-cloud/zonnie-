import {
  computeTodaysVerdict,
  VERDICT_STRONG_THRESHOLD,
  VERDICT_TIER_HIGH,
  VERDICT_TIER_MID,
} from '@/src/engines/todaysVerdict';

// Build a 24-element array where every hour from `fromH` to `toH` has `score`,
// and all other hours have 0. Makes test fixtures easy to read.
function makeHourlyScores(fromH: number, toH: number, score: number): number[] {
  return Array.from({ length: 24 }, (_, h) => (h >= fromH && h <= toH ? score : 0));
}

describe('computeTodaysVerdict', () => {
  test('returns low tier with no data', () => {
    const result = computeTodaysVerdict([]);
    expect(result.tier).toBe('low');
    expect(result.strongCount).toBe(0);
    expect(result.bestWindow).toBeNull();
  });

  test('returns low tier when no terrace hits the strong threshold', () => {
    // Score is just below the strong threshold for all terraces
    const belowStrong = makeHourlyScores(10, 16, VERDICT_STRONG_THRESHOLD - 0.01);
    const data = Array.from({ length: 5 }, () => belowStrong);
    const result = computeTodaysVerdict(data);
    expect(result.tier).toBe('low');
    expect(result.strongCount).toBe(0);
  });

  test(`mid tier when >= ${VERDICT_TIER_MID} and < ${VERDICT_TIER_HIGH} terraces are strong`, () => {
    const strong = makeHourlyScores(11, 15, VERDICT_STRONG_THRESHOLD + 0.1);
    const weak = makeHourlyScores(11, 15, 0.2);
    // 3 strong + 7 weak = mid territory (≥2, <10)
    const data = [
      ...Array.from({ length: 3 }, () => strong),
      ...Array.from({ length: 7 }, () => weak),
    ];
    const result = computeTodaysVerdict(data);
    expect(result.tier).toBe('mid');
    expect(result.strongCount).toBe(3);
  });

  test(`high tier when >= ${VERDICT_TIER_HIGH} terraces are strong`, () => {
    const strong = makeHourlyScores(10, 18, VERDICT_STRONG_THRESHOLD + 0.1);
    const data = Array.from({ length: VERDICT_TIER_HIGH }, () => strong);
    const result = computeTodaysVerdict(data);
    expect(result.tier).toBe('high');
    expect(result.strongCount).toBe(VERDICT_TIER_HIGH);
  });

  test('bestWindow falls in 08–21 search range', () => {
    // Strong scores only at hours 13–14 (afternoon peak)
    const afternoon = makeHourlyScores(13, 14, 0.80);
    const data = Array.from({ length: 5 }, () => afternoon);
    const result = computeTodaysVerdict(data);
    expect(result.bestWindow).not.toBeNull();
    if (result.bestWindow) {
      expect(result.bestWindow.fromHour).toBeGreaterThanOrEqual(8);
      expect(result.bestWindow.toHour).toBeLessThanOrEqual(21);
      // The window should start at or near hour 13
      expect(result.bestWindow.fromHour).toBe(13);
    }
  });

  test('bestWindow is null when all scores are too low to qualify', () => {
    // Very low scores — below findBestWindow's minScore of 0.35
    const low = makeHourlyScores(8, 21, 0.10);
    const data = Array.from({ length: 3 }, () => low);
    const result = computeTodaysVerdict(data);
    expect(result.bestWindow).toBeNull();
  });

  test('strongCount uses peak-per-terrace (terrace sunny only 1 hour still counts)', () => {
    // A terrace that is strong only at hour 16 — should count
    const brief = makeHourlyScores(16, 16, VERDICT_STRONG_THRESHOLD + 0.05);
    const result = computeTodaysVerdict([brief]);
    expect(result.strongCount).toBe(1);
  });
});
