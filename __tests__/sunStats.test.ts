import { computeSunStats } from '@/src/engines/sunStats';
import type { SunLogEvent } from '@/src/store/sunLogStore';

/** dayOf stub: events carry their day directly as ts = day index (0 = 2026-07-01). */
const DAY0 = Date.UTC(2026, 6, 1);
const dayOf = (ts: number) => {
  const d = new Date(DAY0 + ts * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const day = (n: number) => dayOf(n);

function ev(tsDay: number, terraceId: number, action: SunLogEvent['action'], score?: number): SunLogEvent {
  return { ts: tsDay, terraceId, action, score };
}

describe('computeSunStats', () => {
  test('empty log → all zeroes and nulls', () => {
    const s = computeSunStats([], day(10), dayOf);
    expect(s.distinctTerraces).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.sunniestPct).toBeNull();
    expect(s.sinceDay).toBeNull();
  });

  test('counts distinct terraces, ignoring the -1 sentinel', () => {
    const s = computeSunStats(
      [ev(0, 5, 'open'), ev(0, 5, 'share'), ev(1, 9, 'open'), ev(1, -1, 'wrapped_share')],
      day(1), dayOf,
    );
    expect(s.distinctTerraces).toBe(2);
    expect(s.shares).toBe(2); // share + wrapped_share
  });

  test('streak: consecutive days ending today', () => {
    const s = computeSunStats([ev(3, 1, 'open'), ev(4, 1, 'open'), ev(5, 1, 'open')], day(5), dayOf);
    expect(s.currentStreak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.activeDays).toBe(3);
  });

  test('streak survives when today has no activity yet (ended yesterday)', () => {
    const s = computeSunStats([ev(3, 1, 'open'), ev(4, 1, 'open')], day(5), dayOf);
    expect(s.currentStreak).toBe(2);
  });

  test('streak dies after a full missed day; best streak remembers the past', () => {
    const s = computeSunStats(
      [ev(0, 1, 'open'), ev(1, 1, 'open'), ev(2, 1, 'open'), ev(6, 1, 'open')],
      day(8), dayOf,
    );
    expect(s.currentStreak).toBe(0); // last activity day 6, today day 8
    expect(s.bestStreak).toBe(3);
  });

  test('sunniest moment tracks the highest-scored real terrace', () => {
    const s = computeSunStats(
      [ev(0, 7, 'open', 0.61), ev(1, 12, 'open', 0.93), ev(2, 7, 'share', 0.4)],
      day(2), dayOf,
    );
    expect(s.sunniestPct).toBe(93);
    expect(s.sunniestTerraceId).toBe(12);
  });

  test('sun runs and sinceDay', () => {
    const s = computeSunStats(
      [ev(2, 3, 'sunrun_generate'), ev(0, 3, 'open'), ev(3, 3, 'sunrun_share')],
      day(3), dayOf,
    );
    expect(s.sunRuns).toBe(1);
    expect(s.shares).toBe(1);
    expect(s.sinceDay).toBe(day(0));
  });
});
