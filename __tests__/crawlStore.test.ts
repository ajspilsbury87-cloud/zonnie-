/**
 * Unit tests for src/store/crawlStore.ts
 *
 * Strategy: we stub generateSunCrawl so the tests don't depend on real sun
 * geometry or the full terrace dataset. The store test focuses on:
 *   1. start() — sets plan+isOpen when engine returns a plan
 *   2. start() — does NOT open when engine returns null
 *   3. shuffle() — regenerates with excludeIds drawn from current plan's non-origin stops
 *   4. close() — clears isOpen and plan
 *
 * We reset the zustand store between tests by re-importing and using
 * `useCrawlStore.setState` (built into zustand) to clear state.
 */

import { useCrawlStore } from '@/src/store/crawlStore';
import { generateSunCrawl } from '@/src/engines/crawl';
import type { CrawlPlan } from '@/src/engines/crawl';

// ── Mock the crawl engine so tests run without sun geometry ──────────────────

jest.mock('@/src/engines/crawl', () => ({
  generateSunCrawl: jest.fn(),
}));

const mockGenerateSunCrawl = generateSunCrawl as jest.MockedFunction<typeof generateSunCrawl>;

// ── Fixture plan ─────────────────────────────────────────────────────────────

function makePlan(overrides?: Partial<CrawlPlan>): CrawlPlan {
  return {
    startHour: 15,
    endHour: 19,
    totalSunMinutes: 240,
    stops: [
      {
        terrace: { id: 1, name: 'Stop 1', lat: 52.37, lng: 4.90, area: 'Centrum', facing: 'S', capacity: 'M', vibe: '', address: '', verified: false },
        arriveHour: 15,
        sunUntilHour: 17,
        walkMetersFromPrev: 0,
        walkMinutesFromPrev: 0,
        isGoldenFinish: false,
      },
      {
        terrace: { id: 2, name: 'Stop 2', lat: 52.371, lng: 4.905, area: 'Centrum', facing: 'W', capacity: 'M', vibe: '', address: '', verified: false },
        arriveHour: 18,
        sunUntilHour: 19,
        walkMetersFromPrev: 300,
        walkMinutesFromPrev: 4,
        isGoldenFinish: true,
      },
    ],
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset store to its initial state between tests. */
function resetStore() {
  useCrawlStore.setState({
    plan: null,
    originId: null,
    isOpen: false,
    lastExcluded: [],
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCrawlStore', () => {
  beforeEach(() => {
    resetStore();
    mockGenerateSunCrawl.mockReset();
  });

  // ── start() ───────────────────────────────────────────────────────────────

  test('start() sets plan and opens the sheet when engine returns a plan', () => {
    const plan = makePlan();
    mockGenerateSunCrawl.mockReturnValue(plan);

    useCrawlStore.getState().start(1, '2026-06-21', 'sunny');

    const state = useCrawlStore.getState();
    expect(state.plan).toBe(plan);
    expect(state.originId).toBe(1);
    expect(state.isOpen).toBe(true);
    expect(state.lastExcluded).toEqual([]);
  });

  test('start() does not open the sheet when engine returns null', () => {
    mockGenerateSunCrawl.mockReturnValue(null);

    useCrawlStore.getState().start(99, '2026-06-21', 'sunny');

    const state = useCrawlStore.getState();
    expect(state.plan).toBeNull();
    expect(state.isOpen).toBe(false);
    // originId is still set so a subsequent shuffle() would try from the same origin.
    expect(state.originId).toBe(99);
  });

  // ── shuffle() ─────────────────────────────────────────────────────────────

  test('shuffle() regenerates with non-origin stops excluded', () => {
    const plan = makePlan();
    mockGenerateSunCrawl.mockReturnValue(plan);
    useCrawlStore.getState().start(1, '2026-06-21', 'sunny');

    // First shuffle: a different plan is returned.
    const shuffledPlan = makePlan({ endHour: 20 });
    mockGenerateSunCrawl.mockReturnValue(shuffledPlan);

    useCrawlStore.getState().shuffle('2026-06-21', 'sunny');

    // The second generateSunCrawl call should include excludeIds=[2] (stop 2 from original plan).
    const calls = mockGenerateSunCrawl.mock.calls;
    // First call is from start(); second is from shuffle().
    expect(calls.length).toBe(2);
    const shuffleOpts = calls[1]![4] as { excludeIds?: number[] };
    expect(shuffleOpts?.excludeIds).toContain(2);

    // Plan is updated to the new one.
    expect(useCrawlStore.getState().plan).toBe(shuffledPlan);
  });

  test('shuffle() keeps current plan when engine returns null', () => {
    const plan = makePlan();
    mockGenerateSunCrawl.mockReturnValue(plan);
    useCrawlStore.getState().start(1, '2026-06-21', 'sunny');

    // Shuffle returns null — no alternative route.
    mockGenerateSunCrawl.mockReturnValue(null);
    useCrawlStore.getState().shuffle('2026-06-21', 'sunny');

    // Plan is unchanged.
    expect(useCrawlStore.getState().plan).toBe(plan);
    expect(useCrawlStore.getState().isOpen).toBe(true);
  });

  // ── close() ───────────────────────────────────────────────────────────────

  test('close() sets isOpen=false and clears plan', () => {
    const plan = makePlan();
    mockGenerateSunCrawl.mockReturnValue(plan);
    useCrawlStore.getState().start(1, '2026-06-21', 'sunny');
    expect(useCrawlStore.getState().isOpen).toBe(true);

    useCrawlStore.getState().close();

    expect(useCrawlStore.getState().isOpen).toBe(false);
    expect(useCrawlStore.getState().plan).toBeNull();
  });
});
