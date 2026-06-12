/**
 * Unit tests for src/data/worldcup.ts
 *
 * Pure-function tests — no React Native, no native modules, no Date mocking
 * needed because every function under test accepts a date string argument.
 *
 * Test matrix for matchForBanner:
 *   - Normal day inside tournament (no match)
 *   - Today IS a matchday (evening kickoff)
 *   - Today IS a matchday (afternoon kickoff)
 *   - Evening before a late-night kickoff (Tunisia 01:00)
 *   - The actual day of a late-night kickoff
 *   - Day after a match
 *   - Day outside the tournament window entirely
 */

import {
  isWorldCupLive,
  matchForBanner,
  NL_FIXTURES,
  WC_END,
  WC_START,
} from '@/src/data/worldcup';

// ─── isWorldCupLive ───────────────────────────────────────────────────────────

describe('isWorldCupLive', () => {
  test('opening day is live', () => {
    expect(isWorldCupLive(WC_START)).toBe(true);
  });

  test('closing day is live', () => {
    expect(isWorldCupLive(WC_END)).toBe(true);
  });

  test('day inside the window is live', () => {
    expect(isWorldCupLive('2026-07-01')).toBe(true);
  });

  test('day before opening is not live', () => {
    expect(isWorldCupLive('2026-06-10')).toBe(false);
  });

  test('day after closing is not live', () => {
    expect(isWorldCupLive('2026-07-20')).toBe(false);
  });

  test('completely unrelated date is not live', () => {
    expect(isWorldCupLive('2025-08-15')).toBe(false);
  });
});

// ─── matchForBanner ───────────────────────────────────────────────────────────

describe('matchForBanner', () => {
  test('normal tournament day with no match → null', () => {
    // June 16 is inside the tournament window but not a matchday.
    expect(matchForBanner('2026-06-16')).toBeNull();
  });

  test('matchday (Japan, 22:00) → returns that match', () => {
    const m = matchForBanner('2026-06-14');
    expect(m).not.toBeNull();
    expect(m?.opponent).toBe('Japan');
    expect(m?.kickoffLabel).toBe('22:00');
  });

  test('matchday (Sweden, 19:00) → returns that match', () => {
    const m = matchForBanner('2026-06-20');
    expect(m).not.toBeNull();
    expect(m?.opponent).toBe('Sweden');
    expect(m?.kickoffLabel).toBe('19:00');
  });

  test('evening before Tunisia late-night (June 25) → returns Tunisia match', () => {
    // Tunisia kickoff is 01:00 on June 26. On the evening of June 25,
    // the banner should already show the upcoming match so fans can
    // plan to find a screen terrace before midnight.
    const m = matchForBanner('2026-06-25');
    expect(m).not.toBeNull();
    expect(m?.opponent).toBe('Tunisia');
    expect(m?.kickoffLabel).toBe('01:00');
    expect(m?.dateStr).toBe('2026-06-26');
  });

  test('actual Tunisia kickoff day (June 26) → returns Tunisia match', () => {
    // On the day itself, rule 1 fires (today IS a matchday).
    const m = matchForBanner('2026-06-26');
    expect(m).not.toBeNull();
    expect(m?.opponent).toBe('Tunisia');
  });

  test('day after Japan match → null', () => {
    expect(matchForBanner('2026-06-15')).toBeNull();
  });

  test('day after Sweden match → null', () => {
    expect(matchForBanner('2026-06-21')).toBeNull();
  });

  test('outside tournament window → null', () => {
    expect(matchForBanner('2026-07-20')).toBeNull();
  });

  test('before tournament starts → null', () => {
    expect(matchForBanner('2026-06-10')).toBeNull();
  });
});

// ─── NL_FIXTURES shape guard ──────────────────────────────────────────────────

describe('NL_FIXTURES', () => {
  test('contains exactly 3 group-stage fixtures', () => {
    expect(NL_FIXTURES).toHaveLength(3);
  });

  test('all fixtures have valid date strings', () => {
    for (const f of NL_FIXTURES) {
      expect(f.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('all kickoffHour values are in 0–23', () => {
    for (const f of NL_FIXTURES) {
      expect(f.kickoffHour).toBeGreaterThanOrEqual(0);
      expect(f.kickoffHour).toBeLessThanOrEqual(23);
    }
  });

  test('all fixtures fall within the tournament window', () => {
    for (const f of NL_FIXTURES) {
      expect(isWorldCupLive(f.dateStr)).toBe(true);
    }
  });

  test('kickoffLabel matches kickoffHour in HH:00 format', () => {
    for (const f of NL_FIXTURES) {
      const expectedLabel = String(f.kickoffHour).padStart(2, '0') + ':00';
      expect(f.kickoffLabel).toBe(expectedLabel);
    }
  });

  test('fixtures are in chronological order', () => {
    for (let i = 1; i < NL_FIXTURES.length; i++) {
      expect(NL_FIXTURES[i]!.dateStr >= NL_FIXTURES[i - 1]!.dateStr).toBe(true);
    }
  });
});
