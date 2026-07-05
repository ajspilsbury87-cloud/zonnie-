import {
  arrivalHour,
  buildSunRunShareMessage,
  planSunRun,
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

describe('pace math', () => {
  test('5k easy ≈ 33 min', () => {
    expect(runMinutes(5, 'easy')).toBe(33);
  });

  test('arrival rounds to the nearest hour', () => {
    expect(arrivalHour(17, 5, 'easy')).toBe(18); // 17:00 + 33min → ~18
    expect(arrivalHour(17, 3, 'quick')).toBe(17); // 14 min → still ~17
  });

  test('arrival clamps to the day', () => {
    expect(arrivalHour(23, 15, 'easy')).toBe(23);
  });
});

describe('planSunRun', () => {
  test('picks the sunniest finish inside the displacement ring', () => {
    const plan = planSunRun({
      terraces: [NEAR, RING, FAR],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      origin: ORIGIN,
      scoreAt: () => 0.9,
    });
    expect(plan?.finish.id).toBe(2); // NEAR too close, FAR too far
    expect(plan?.isSunny).toBe(true);
  });

  test('without an origin, any terrace qualifies and the sunniest wins', () => {
    const plan = planSunRun({
      terraces: [NEAR, RING, FAR],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      scoreAt: (t) => (t.id === 3 ? 0.9 : 0.5),
    });
    expect(plan?.finish.id).toBe(3);
  });

  test('grey day: still returns the best finish, honestly flagged', () => {
    const plan = planSunRun({
      terraces: [RING],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      origin: ORIGIN,
      scoreAt: () => 0.1,
    });
    expect(plan?.isSunny).toBe(false);
    expect(plan?.sunUntilHour).toBeNull();
  });

  test('sunUntilHour counts consecutive sunny hours from arrival', () => {
    const plan = planSunRun({
      terraces: [RING],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17, // arrive 18
      origin: ORIGIN,
      scoreAt: (_t, h) => (h <= 20 ? 0.8 : 0.1), // sunny through 20:00
    });
    expect(plan?.arriveHour).toBe(18);
    expect(plan?.sunUntilHour).toBe(20);
  });

  test('excludeIds powers the shuffle', () => {
    const plan = planSunRun({
      terraces: [RING, terrace(4, 52.379, 4.91)],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      origin: ORIGIN,
      scoreAt: () => 0.9,
      excludeIds: new Set([2]),
    });
    expect(plan?.finish.id).toBe(4);
  });

  test('returns null when nothing qualifies at all', () => {
    const plan = planSunRun({
      terraces: [NEAR],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      origin: ORIGIN,
      scoreAt: () => 0.9,
    });
    expect(plan).toBeNull();
  });
});

describe('buildSunRunShareMessage', () => {
  test('sunny plan mentions the finish and sun-until time', () => {
    const plan = planSunRun({
      terraces: [RING],
      distanceKm: 5,
      pace: 'easy',
      startHour: 17,
      origin: ORIGIN,
      scoreAt: () => SUNNY_FINISH_THRESHOLD + 0.3,
    })!;
    const msg = buildSunRunShareMessage(plan, 'https://example.com');
    expect(msg).toContain('Sun Run — 5k easy');
    expect(msg).toContain('T2, De Pijp — sunny till');
    expect(msg).toContain('https://example.com');
  });
});
