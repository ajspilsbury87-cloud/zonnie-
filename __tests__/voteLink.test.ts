/**
 * Tests for buildVoteUrl — URL shape and encoding with the new t/w/d contract.
 *
 * The new contract (Phase B): URL carries ids + visit window; scores are
 * computed on the vote page from the hourly snapshot in terraces-lite.json.
 *   t = comma-separated terrace ids
 *   w = "fromHour-toHour" e.g. "14-17"
 *   d = optional YYYY-MM-DD date (absent → page uses "today")
 */

import { buildVoteUrl } from '@/src/lib/voteLink';

const BASE = 'https://ajspilsbury87-cloud.github.io/zonnie-/vote.html';

describe('buildVoteUrl', () => {
  test('builds a URL with ids and window, no date', () => {
    const url = buildVoteUrl([812, 455, 93], 14, 17);
    expect(url).toBe(`${BASE}#t=812,455,93&w=14-17`);
  });

  test('single item URL — no trailing comma, no d= when date omitted', () => {
    const url = buildVoteUrl([42], 13, 15);
    expect(url).toBe(`${BASE}#t=42&w=13-15`);
    expect(url).not.toContain(',');
    expect(url).not.toContain('&d=');
  });

  test('empty ids returns bare base URL', () => {
    const url = buildVoteUrl([], 14, 17);
    expect(url).toBe(BASE);
  });

  test('includes d param when date is provided (YYYY-MM-DD, no time)', () => {
    const date = new Date(2026, 5, 20); // June 20 2026, local midnight
    const url = buildVoteUrl([812], 14, 17, date);
    expect(url).toContain('&d=2026-06-20');
    // d must be date-only — no T or time component
    expect(url).not.toContain('T');
    expect(url).not.toContain('%3A');
  });

  test('omits d param when date is undefined', () => {
    const url = buildVoteUrl([812], 14, 17, undefined);
    expect(url).not.toContain('&d=');
  });

  test('window with hour 0 encodes correctly', () => {
    const url = buildVoteUrl([1], 0, 23);
    expect(url).toBe(`${BASE}#t=1&w=0-23`);
  });

  test('ids are comma-separated without spaces', () => {
    const url = buildVoteUrl([10, 20, 30], 9, 12);
    const hash = url.split('#')[1]!;
    const params = Object.fromEntries(hash.split('&').map(p => {
      const eq = p.indexOf('=');
      return [p.slice(0, eq), p.slice(eq + 1)];
    }));
    expect(params['t']).toBe('10,20,30');
    expect(params['w']).toBe('9-12');
  });

  test('URL contains no s= param (old score-in-URL format removed)', () => {
    const url = buildVoteUrl([812, 455], 14, 17);
    expect(url).not.toContain('s=');
  });
});
