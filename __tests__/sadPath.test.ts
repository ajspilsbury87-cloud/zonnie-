import { isGreyWindow, nextSunnyHour } from '@/src/engines/sadPath';
import type { Weather } from '@/src/engines/types';

function day(cloudByHour: Record<number, number>): (Weather | undefined)[] {
  return Array.from({ length: 24 }, (_, h) =>
    cloudByHour[h] != null
      ? ({ temp: 18, cloudCover: cloudByHour[h] } as Weather)
      : ({ temp: 18, cloudCover: 100 } as Weather),
  );
}

describe('nextSunnyHour', () => {
  test('finds the first sunny hour after the window', () => {
    expect(nextSunnyHour(day({ 15: 20, 17: 10 }), 13, 21)).toBe(15);
  });

  test('is exclusive of afterHour itself', () => {
    expect(nextSunnyHour(day({ 13: 0, 16: 30 }), 13, 21)).toBe(16);
  });

  test('never suggests an hour past sunset', () => {
    expect(nextSunnyHour(day({ 22: 0 }), 13, 21)).toBeNull();
  });

  test('null on an all-grey rest of day', () => {
    expect(nextSunnyHour(day({}), 10, 21)).toBeNull();
  });

  test('null when weather is missing', () => {
    expect(nextSunnyHour(undefined, 10, 21)).toBeNull();
  });
});

describe('isGreyWindow', () => {
  test('true for a populated list whose best score is dismal', () => {
    expect(isGreyWindow(0.12, 300)).toBe(true);
  });

  test('false when the top result still has believable sun', () => {
    expect(isGreyWindow(0.55, 300)).toBe(false);
  });

  test('false for an empty list (that is the empty state, not the banner)', () => {
    expect(isGreyWindow(undefined, 0)).toBe(false);
  });
});
