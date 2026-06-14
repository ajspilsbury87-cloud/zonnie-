/**
 * Group-vote share scoring — regression test for the "filtered-out terrace
 * silently dropped from the vote URL" edge case.
 *
 * The bug: ShortlistBar used to read scores from the FILTERED ranked list
 * (useScoredTerraces). If the user changed a filter between shortlisting a
 * terrace and tapping "Ask the group", the now-hidden terrace had no entry in
 * that list and was dropped from the vote URL (or, if all were hidden, the
 * share button produced an empty no-op while still showing a count).
 *
 * The fix: score selected terraces via `rangeScoreForTerrace` over the FULL
 * terrace set — it takes no filter arguments, so it scores any terrace.
 */
import { rangeScoreForTerrace } from '@/src/hooks/scoreCache';
import { TERRACES } from '@/src/data/terraces';

const DATE = '2026-06-21'; // midsummer, deterministic

describe('rangeScoreForTerrace — filter-independent scoring', () => {
  test('returns a finite score in [0,1] for an arbitrary terrace', () => {
    const s = rangeScoreForTerrace(TERRACES[0]!, 12, 15, DATE, undefined);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  test('scores a terrace the hidden-gems filter would EXCLUDE (high review count)', () => {
    const touristy = TERRACES.find((t) => (t.googleReviewCount ?? 0) > 3000);
    expect(touristy).toBeDefined();
    const s = rangeScoreForTerrace(touristy!, 13, 14, DATE, undefined);
    expect(Number.isFinite(s)).toBe(true);
  });

  test('single-hour window with no weather data uses the synthetic profile (no crash)', () => {
    const s = rangeScoreForTerrace(TERRACES[5]!, 9, 9, '2026-12-21', undefined);
    expect(Number.isFinite(s)).toBe(true);
  });

  test('every shortlisted id keeps a score even if filters would hide some', () => {
    // Build share items exactly as ShortlistBar does, for the kinds of terraces
    // a filter could hide: one touristy (hidden-gems would drop), one with no
    // outdoor screens (match-mode would drop), one ordinary. None should fall out.
    const touristy = TERRACES.find((t) => (t.googleReviewCount ?? 0) > 3000)!;
    const noScreens = TERRACES.find((t) => (t.outdoorScreens ?? 0) === 0)!;
    const ordinary = TERRACES[10]!;
    const ids = [touristy.id, noScreens.id, ordinary.id];
    const byId = new Map(TERRACES.map((t) => [t.id, t] as const));

    const items = ids.flatMap((id) => {
      const terrace = byId.get(id);
      if (!terrace) return [];
      return [{ id, score: rangeScoreForTerrace(terrace, 14, 16, DATE, undefined) }];
    });

    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(ids);
    items.forEach((it) => expect(Number.isFinite(it.score)).toBe(true));
  });
});
