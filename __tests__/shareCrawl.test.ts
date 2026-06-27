/**
 * Unit tests for buildCrawlShareMessage (src/lib/shareCard.ts).
 *
 * Tests the text format that gets shared — we verify structure and content
 * without mocking the Share API (that's an integration concern). The function
 * is pure so it's straightforward to test.
 */

import { buildCrawlShareMessage, APP_STORE_URL } from '@/src/lib/shareCard';
import type { CrawlPlan } from '@/src/engines/crawl';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePlan(stopCount: 2 | 3 = 3): CrawlPlan {
  const stops: CrawlPlan['stops'] = [
    {
      terrace: { id: 1, name: 'Café Kobalt', lat: 52.37, lng: 4.90, area: 'Jordaan', facing: 'S', capacity: 'M', vibe: '', address: '', verified: false },
      arriveHour: 15,
      sunUntilHour: 16,
      walkMetersFromPrev: 0,
      walkMinutesFromPrev: 0,
      isGoldenFinish: false,
    },
    {
      terrace: { id: 2, name: 'Bar Baarsch', lat: 52.371, lng: 4.905, area: 'Jordaan', facing: 'SW', capacity: 'M', vibe: '', address: '', verified: false },
      arriveHour: 17,
      sunUntilHour: 18,
      walkMetersFromPrev: 280,
      walkMinutesFromPrev: 4,
      isGoldenFinish: stopCount === 2,
    },
  ];

  if (stopCount === 3) {
    stops.push({
      terrace: { id: 3, name: 'Westerdok', lat: 52.372, lng: 4.91, area: 'Jordaan', facing: 'W', capacity: 'L', vibe: '', address: '', verified: false },
      arriveHour: 19,
      sunUntilHour: 20,
      walkMetersFromPrev: 350,
      walkMinutesFromPrev: 5,
      isGoldenFinish: true,
    });
  }

  return {
    stops,
    startHour: 15,
    endHour: stopCount === 3 ? 20 : 18,
    totalSunMinutes: 180,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCrawlShareMessage', () => {
  test('includes the app store URL', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    expect(msg).toContain(APP_STORE_URL);
  });

  test('includes the area of the first stop', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    expect(msg).toContain('Jordaan');
  });

  test('includes all stop names', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    expect(msg).toContain('Café Kobalt');
    expect(msg).toContain('Bar Baarsch');
    expect(msg).toContain('Westerdok');
  });

  test('first stop shows sun-until hour (sunUntilHour + 1)', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    // stop 1: sunUntilHour=16 → display "17:00"
    expect(msg).toContain('sun till 17:00');
  });

  test('middle stop shows walk time', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    // stop 2: walkMinutesFromPrev=4
    expect(msg).toContain('4 min walk');
  });

  test('golden-finish last stop shows golden hour emoji', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    expect(msg).toContain('golden hour 🌅');
  });

  test('2-stop plan omits the third stop line but still includes the URL', () => {
    const msg = buildCrawlShareMessage(makePlan(2));
    expect(msg).not.toContain('Westerdok');
    expect(msg).toContain(APP_STORE_URL);
    // Still includes stop 1 and stop 2
    expect(msg).toContain('Café Kobalt');
    expect(msg).toContain('Bar Baarsch');
  });

  test('starts with a sun emoji', () => {
    const msg = buildCrawlShareMessage(makePlan(3));
    expect(msg.startsWith('☀️')).toBe(true);
  });
});
