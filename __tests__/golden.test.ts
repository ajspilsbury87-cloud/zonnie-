import { goldenUntilHour, sundownerMinutes } from '@/src/engines/golden';

/** Build a 24-score day: zeros except the given [hour]=score entries. */
function day(entries: Record<number, number>): number[] {
  const scores = new Array<number>(24).fill(0);
  for (const [h, s] of Object.entries(entries)) scores[Number(h)] = s;
  return scores;
}

describe('goldenUntilHour', () => {
  test('returns end boundary of the last hour scoring ≥ 0.65 (mostly band floor)', () => {
    // Golden 12:00–19:59 → "golden until 20:00"
    const scores = day({ 10: 0.4, 12: 0.8, 15: 0.9, 19: 0.55, 20: 0.45 });
    // 19:00 scores 0.55 — below the recalibrated 0.65 bar, so golden ends after 15:00.
    expect(goldenUntilHour(scores)).toBe(16);
  });

  test('null when no hour reaches the threshold (overcast / deep shade)', () => {
    expect(goldenUntilHour(day({ 12: 0.49, 15: 0.3 }))).toBeNull();
  });

  test('threshold boundary: exactly 0.65 counts as golden', () => {
    expect(goldenUntilHour(day({ 14: 0.65 }))).toBe(15);
  });
});

describe('sundownerMinutes', () => {
  test('counts minutes to the first sub-0.3 hour boundary', () => {
    // Sunny at 17, drops at 18. At 17:20 → 40 min left.
    const scores = day({ 16: 0.8, 17: 0.7, 18: 0.1 });
    expect(sundownerMinutes(scores, 17 + 20 / 60)).toBe(40);
  });

  test('null when terrace has no sun right now', () => {
    const scores = day({ 17: 0.1, 18: 0.05 });
    expect(sundownerMinutes(scores, 17.5)).toBeNull();
  });

  test('null when the drop is beyond the 90-minute horizon', () => {
    // Sunny 14–17, drops at 18. At 14:00 the drop is 240 min away.
    const scores = day({ 14: 0.8, 15: 0.8, 16: 0.8, 17: 0.7, 18: 0.1 });
    expect(sundownerMinutes(scores, 14)).toBeNull();
  });

  test('null when sun never drops before end of day', () => {
    const scores = new Array<number>(24).fill(0.8);
    expect(sundownerMinutes(scores, 21)).toBeNull();
  });

  test('exactly 90 minutes away still shows; 91 does not', () => {
    const scores = day({ 16: 0.8, 17: 0.8, 18: 0.1 });
    expect(sundownerMinutes(scores, 16.5)).toBe(90);
    const scoresLater = day({ 16: 0.8, 17: 0.8, 18: 0.8, 19: 0.1 });
    expect(sundownerMinutes(scoresLater, 16.5)).toBeNull(); // 150 min away
  });
});
