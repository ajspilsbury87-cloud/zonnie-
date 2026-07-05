import {
  buildSunRunShareMessage,
  DEFAULT_PACE_INDEX,
  fmtClock,
  PACE_BANDS,
  planSunRun,
  RUN_DISTANCES,
  runMinutes,
  SUNNY_FINISH_THRESHOLD,
} from '@/src/engines/sunRun';
import type { Terrace } from '@/src/engines/types';

function terrace(id: number, lat: number, lng: number, name = `T${id}`): Terrace {
  return { id, name, lat, lng, area: 'De Pijp', facing: 'S', capacity: 'M' } as Terrace;
}

// Origin in central Amsterdam; ~0.01 lat ≈ 1.1km.
const ORIGIN = { lat: 52.36, lng: 4.9 };
const NEAR = terrace(1, 52.3605, 4.9005); // ~70m — too close for a 5k
const RING = terrace(2, 52.38, 4.9); // ~2.2km — inside the 5k ring (0.75–3.75km)
const FAR = terrace(3, 52.44, 4.9); // ~8.8km — beyond a 5k's reach

const EASYISH = PACE_BANDS[DEFAULT_PACE_INDEX]!; // 5:30–5:45

function makePlan(over: Partial<Parameters<typeof planSunRun>[0]> = {}) {
  return planSunRun({
    terraces: [NEAR, RING, FAR],
    distanceKm: 5,
    pace: EASYISH,
    startMinutes: 17 * 60 + 45, // 17:45
    origin: ORIGIN,
    scoreAt: () => 0.9,
    ...over,
  });
}

describe('pace bands', () => {
  test('cover 4:00–4:15 through 7:00–7:15 in 15s steps', () => {
    expect(PACE_BANDS[0]!.label).toBe('4:00–4:15');
    expect(PACE_BANDS[PACE_BANDS.length - 1]!.label).toBe('7:00–7:15');
    expect(PACE_BANDS).toHaveLength(13);
  });

  test('distance chips are 5–20k', () => {
    expect([...RUN_DISTANCES]).toEqual([5, 10, 15, 20]);
  });

  test('run duration uses the band midpoint: 5k @ 5:30–5:45 ≈ 28 min', () => {
    expect(runMinutes(5, EASYISH.secPerKm)).toBe(28);
  });
});

describe('fmtClock', () => {
  test('renders minutes-from-midnight as HH:MM', () => {
    expect(fmtClock(17 * 60 + 45)).toBe('17:45');
    expect(fmtClock(7 * 60)).toBe('07:00');
  });
});

describe('planSunRun', () => {
  test('picks the sunniest finish inside the displacement ring', () => {
    const plan = makePlan();
    expect(plan?.finish.id).toBe(2); // NEAR too close, FAR too far
    expect(plan?.isSunny).toBe(true);
  });

  test('exact arrival time is start + duration; scoring hour is rounded', () => {
    const plan = makePlan(); // 17:45 + 28min = 18:13 → hour 18
    expect(plan?.arriveMinutes).toBe(17 * 60 + 45 + 28);
    expect(plan?.arriveHour).toBe(18);
  });

  test('excludeIds keeps the origin terrace out of the finishes', () => {
    const plan = makePlan({ terraces: [RING, terrace(4, 52.379, 4.91)], excludeIds: new Set([2]) });
    expect(plan?.finish.id).toBe(4);
  });

  test('grey day: still returns the best finish, honestly flagged', () => {
    const plan = makePlan({ terraces: [RING], scoreAt: () => 0.1 });
    expect(plan?.isSunny).toBe(false);
    expect(plan?.sunUntilHour).toBeNull();
  });

  test('sunUntilHour counts consecutive sunny hours from arrival', () => {
    const plan = makePlan({ terraces: [RING], scoreAt: (_t, h) => (h <= 20 ? 0.8 : 0.1) });
    expect(plan?.sunUntilHour).toBe(20);
  });

  test('returns null when nothing qualifies at all', () => {
    expect(makePlan({ terraces: [NEAR] })).toBeNull();
  });
});

describe('buildSunRunShareMessage', () => {
  test('carries pace band, origin, exact times and the sunny finish', () => {
    const plan = makePlan({
      terraces: [RING],
      originName: 'Café Kobalt',
      scoreAt: () => SUNNY_FINISH_THRESHOLD + 0.3,
    })!;
    const msg = buildSunRunShareMessage(plan, 'https://example.com');
    expect(msg).toContain('5k @ 5:30–5:45 /km');
    expect(msg).toContain('Start 17:45 at Café Kobalt');
    expect(msg).toContain('Finish ~18:13: T2, De Pijp — sunny till');
    expect(msg).toContain('https://example.com');
  });
});
