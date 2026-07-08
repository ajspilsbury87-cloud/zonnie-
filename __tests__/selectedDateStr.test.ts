/**
 * selectedDateStr — calendar-day offsets from today's Amsterdam date.
 *
 * These properties (offset 0 = today, all offsets distinct, +1 day apart)
 * hold every day of the year, including the DST-change days where the old
 * `Date.now() + offset×24h` math produced a duplicate or skipped day.
 */
import { selectedDateStr, todayAmsterdamDateStr, MAX_DATE_OFFSET } from '@/src/store/timeStore';

/** Whole-day difference between two yyyy-MM-dd strings (UTC calendar math). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000,
  );
}

describe('selectedDateStr', () => {
  test('offset 0 is today', () => {
    expect(selectedDateStr(0)).toBe(todayAmsterdamDateStr());
  });

  test('all offsets 0..MAX are distinct dates (no DST duplicate)', () => {
    const dates = Array.from({ length: MAX_DATE_OFFSET + 1 }, (_, o) => selectedDateStr(o));
    expect(new Set(dates).size).toBe(dates.length);
  });

  test('each consecutive offset is exactly one calendar day later', () => {
    for (let o = 0; o < MAX_DATE_OFFSET; o++) {
      expect(dayDiff(selectedDateStr(o), selectedDateStr(o + 1))).toBe(1);
    }
  });

  test('offset N is exactly N days after today', () => {
    const today = todayAmsterdamDateStr();
    for (let o = 0; o <= MAX_DATE_OFFSET; o++) {
      expect(dayDiff(today, selectedDateStr(o))).toBe(o);
    }
  });

  test('every result is a valid yyyy-MM-dd string', () => {
    for (let o = 0; o <= MAX_DATE_OFFSET; o++) {
      expect(selectedDateStr(o)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
