/**
 * Tests for buildVoteUrl — URL shape, encoding, and score rounding.
 */

import { buildVoteUrl } from '@/src/lib/voteLink';

const BASE = 'https://ajspilsbury87-cloud.github.io/zonnie-/vote.html';

describe('buildVoteUrl', () => {
  test('builds a URL with ids and scores', () => {
    const url = buildVoteUrl([
      { id: 812, score: 0.78 },
      { id: 455, score: 0.64 },
      { id: 93,  score: 0.51 },
    ]);
    expect(url).toBe(`${BASE}#t=812,455,93&s=78,64,51`);
  });

  test('rounds score to nearest integer (no truncation bias)', () => {
    // 0.505 → Math.round(50.5) = 51, not 50
    const url = buildVoteUrl([{ id: 1, score: 0.505 }]);
    expect(url).toBe(`${BASE}#t=1&s=51`);
  });

  test('score of 0 renders as 0', () => {
    const url = buildVoteUrl([{ id: 5, score: 0 }]);
    expect(url).toBe(`${BASE}#t=5&s=0`);
  });

  test('score of 1.0 renders as 100', () => {
    const url = buildVoteUrl([{ id: 5, score: 1.0 }]);
    expect(url).toBe(`${BASE}#t=5&s=100`);
  });

  test('single item URL has no trailing commas or extra params', () => {
    const url = buildVoteUrl([{ id: 42, score: 0.73 }]);
    expect(url).toBe(`${BASE}#t=42&s=73`);
    // No trailing comma
    expect(url).not.toContain(',');
    // No d= param when date is omitted
    expect(url).not.toContain('&d=');
  });

  test('empty items returns bare base URL', () => {
    const url = buildVoteUrl([]);
    expect(url).toBe(BASE);
  });

  test('includes d param when date is provided', () => {
    // Use a fixed local date so the test is not timezone-sensitive.
    // We construct the Date as if running in local time.
    const date = new Date(2026, 5, 13, 15, 0); // June 13 2026, 15:00 local
    const url = buildVoteUrl([{ id: 1, score: 0.5 }], date);
    // The d value should be URL-encoded ISO local
    expect(url).toContain('&d=');
    expect(url).toContain('2026-06-13T15%3A00');
  });

  test('omits d param when date is undefined', () => {
    const url = buildVoteUrl([{ id: 1, score: 0.5 }], undefined);
    expect(url).not.toContain('&d=');
  });

  test('ids and scores are correctly paired', () => {
    const url = buildVoteUrl([
      { id: 10, score: 0.9 },
      { id: 20, score: 0.5 },
    ]);
    // t and s must have the same number of comma-separated values
    const hash = url.split('#')[1]!;
    const params = Object.fromEntries(hash.split('&').map(p => p.split('=')));
    const ids = params['t']!.split(',');
    const scores = params['s']!.split(',');
    expect(ids.length).toBe(scores.length);
    expect(ids[0]).toBe('10');
    expect(scores[0]).toBe('90');
    expect(ids[1]).toBe('20');
    expect(scores[1]).toBe('50');
  });
});
