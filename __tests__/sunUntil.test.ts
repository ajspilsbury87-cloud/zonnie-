/**
 * Tests for the peek card's "sun until HH:00" helper.
 *
 * The helper is pure — it only reads a pre-computed 24-hour score array —
 * so these tests pin down the display conventions without touching the
 * scoring engine.
 */

import { formatHour, sunUntilHour } from '@/src/engines/sunUntil';
import { SUN_THRESHOLD } from '@/src/engines/handoff';

/** Build a 24-hour score array that is sunny (0.8) exactly for [from, to]. */
function sunnyBetween(from: number, to: number): number[] {
  return Array.from({ length: 24 }, (_, h) => (h >= from && h <= to ? 0.8 : 0.1));
}

describe('sunUntilHour', () => {
  it('returns the hour AFTER the last sunny hour (display convention)', () => {
    // Sunny 14:00–18:59 → "sun until 19:00".
    expect(sunUntilHour(sunnyBetween(14, 18), 14)).toBe(19);
  });

  it('measures from the visit start, not from the run start', () => {
    // Same sunny run, but the user arrives at 16:00 — still until 19:00.
    expect(sunUntilHour(sunnyBetween(14, 18), 16)).toBe(19);
  });

  it('returns null when the terrace is in shade at the start hour', () => {
    expect(sunUntilHour(sunnyBetween(14, 18), 12)).toBeNull();
    expect(sunUntilHour(sunnyBetween(14, 18), 20)).toBeNull();
  });

  it('stops at the first shaded hour instead of skipping gaps', () => {
    // Sunny 14–15, shaded at 16, sunny again 17–18. From 14:00 the honest
    // answer is "sun until 16:00" — not 19:00 across the gap.
    const scores = sunnyBetween(14, 18);
    scores[16] = 0.2;
    expect(sunUntilHour(scores, 14)).toBe(16);
    // From 17:00 the second run applies.
    expect(sunUntilHour(scores, 17)).toBe(19);
  });

  it('treats exactly-threshold scores as sunny (matches handoff engine)', () => {
    const scores = Array.from({ length: 24 }, () => 0);
    scores[15] = SUN_THRESHOLD;
    expect(sunUntilHour(scores, 15)).toBe(16);
  });

  it('handles a single sunny hour', () => {
    expect(sunUntilHour(sunnyBetween(15, 15), 15)).toBe(16);
  });

  it('returns null for out-of-range or fractional start hours', () => {
    const scores = sunnyBetween(0, 23);
    expect(sunUntilHour(scores, -1)).toBeNull();
    expect(sunUntilHour(scores, 24)).toBeNull();
    expect(sunUntilHour(scores, 14.5)).toBeNull();
  });

  it('handles short arrays defensively (missing hours read as shade)', () => {
    // A 16-element array: hours 16–23 are absent → treated as not sunny.
    const scores = Array.from({ length: 16 }, () => 0.9);
    expect(sunUntilHour(scores, 14)).toBe(16);
  });
});

describe('formatHour', () => {
  it('zero-pads to HH:00', () => {
    expect(formatHour(9)).toBe('09:00');
    expect(formatHour(19)).toBe('19:00');
  });
});
