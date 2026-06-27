/**
 * Unit tests for the PerfectForGuides action mappings.
 *
 * Tests only the pure guide→store-mutation logic (GUIDE_DEFINITIONS) —
 * no rendering, no React, no AsyncStorage chain. Each test:
 *   1. Resets both stores to a known starting state.
 *   2. Builds the action for a given guide.
 *   3. Calls the action.
 *   4. Asserts the resulting store state.
 *
 * Why import from perfectForGuidesConfig rather than PerfectForGuides.tsx:
 *   The component imports useStrings → languageStore → AsyncStorage, which
 *   fails in Jest without a native mock. The config file contains only the
 *   pure store-mutation logic and Zustand store imports — both work in Node.
 */

import { useAreaStore } from '@/src/store/areaStore';
import { useTimeStore } from '@/src/store/timeStore';
import {
  GUIDE_DEFINITIONS,
  type GuideStores,
} from '@/src/components/perfectForGuidesConfig';

const stores: GuideStores = { timeStore: useTimeStore, areaStore: useAreaStore };

function resetStores() {
  useTimeStore.setState({
    dateOffset: 0,
    fromHour: 14,
    toHour: 16,
    weatherProfile: 'sunny',
  });
  useAreaStore.setState({
    selectedRegions: new Set(),
    selectedCategories: new Set(),
    favoritesOnly: false,
    matchModeOnly: false,
    sortByDistance: false,
    hiddenGemOnly: false,
  });
}

function findGuide(key: string) {
  const def = GUIDE_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new Error(`Guide not found: ${key}`);
  return def;
}

beforeEach(resetStores);

// ── sunny-now ──────────────────────────────────────────────────────────────────

describe('sunny-now guide', () => {
  test('calls resetToNow — dateOffset stays 0', () => {
    // The guide resets to the current "now" window. We can't assert on the
    // exact fromHour because it's real-time. We assert dateOffset=0, which
    // resetToNow always sets, and that it ran without throwing.
    useTimeStore.setState({ dateOffset: 1, fromHour: 13, toHour: 17 });
    findGuide('sunny-now').buildAction(stores)();
    expect(useTimeStore.getState().dateOffset).toBe(0);
  });
});

// ── morning-sun ────────────────────────────────────────────────────────────────

describe('morning-sun guide', () => {
  test('sets time range 9–12', () => {
    findGuide('morning-sun').buildAction(stores)();
    const { fromHour, toHour } = useTimeStore.getState();
    expect(fromHour).toBe(9);
    expect(toHour).toBe(12);
  });
});

// ── golden-hour ────────────────────────────────────────────────────────────────

describe('golden-hour guide', () => {
  test('sets time range 18–21', () => {
    findGuide('golden-hour').buildAction(stores)();
    const { fromHour, toHour } = useTimeStore.getState();
    expect(fromHour).toBe(18);
    expect(toHour).toBe(21);
  });
});

// ── coffee-sun ─────────────────────────────────────────────────────────────────

describe('coffee-sun guide', () => {
  test('activates coffee category when not already on', () => {
    expect(useAreaStore.getState().selectedCategories.has('coffee')).toBe(false);
    findGuide('coffee-sun').buildAction(stores)();
    expect(useAreaStore.getState().selectedCategories.has('coffee')).toBe(true);
  });

  test('shifts time to 9–12 when current from-hour is afternoon (>= 12)', () => {
    useTimeStore.setState({ fromHour: 15, toHour: 18 });
    findGuide('coffee-sun').buildAction(stores)();
    const { fromHour, toHour } = useTimeStore.getState();
    expect(fromHour).toBe(9);
    expect(toHour).toBe(12);
  });

  test('does NOT shift time when already in morning window (from < 12)', () => {
    useTimeStore.setState({ fromHour: 9, toHour: 11 });
    findGuide('coffee-sun').buildAction(stores)();
    const { fromHour, toHour } = useTimeStore.getState();
    expect(fromHour).toBe(9);
    expect(toHour).toBe(11);
  });

  test('does not double-toggle coffee if already active', () => {
    useAreaStore.getState().toggleCategory('coffee');
    expect(useAreaStore.getState().selectedCategories.has('coffee')).toBe(true);
    findGuide('coffee-sun').buildAction(stores)();
    // Guide only toggles ON, so coffee stays active.
    expect(useAreaStore.getState().selectedCategories.has('coffee')).toBe(true);
  });
});

// ── big-screen ─────────────────────────────────────────────────────────────────

describe('big-screen guide', () => {
  test('sets matchModeOnly to true', () => {
    expect(useAreaStore.getState().matchModeOnly).toBe(false);
    findGuide('big-screen').buildAction(stores)();
    expect(useAreaStore.getState().matchModeOnly).toBe(true);
  });
});

// ── hidden-gems ────────────────────────────────────────────────────────────────

describe('hidden-gems guide', () => {
  test('activates hiddenGemOnly when not already on', () => {
    expect(useAreaStore.getState().hiddenGemOnly).toBe(false);
    findGuide('hidden-gems').buildAction(stores)();
    expect(useAreaStore.getState().hiddenGemOnly).toBe(true);
  });

  test('does not double-toggle when already active', () => {
    useAreaStore.getState().toggleHiddenGemOnly();
    expect(useAreaStore.getState().hiddenGemOnly).toBe(true);
    findGuide('hidden-gems').buildAction(stores)();
    // Guide only turns it ON — stays on.
    expect(useAreaStore.getState().hiddenGemOnly).toBe(true);
  });
});

// ── structural checks ──────────────────────────────────────────────────────────

describe('GUIDE_DEFINITIONS', () => {
  test('contains exactly the expected guide keys in order', () => {
    const keys = GUIDE_DEFINITIONS.map((d) => d.key);
    expect(keys).toEqual([
      'sunny-now',
      'morning-sun',
      'golden-hour',
      'coffee-sun',
      'big-screen',
      'hidden-gems',
    ]);
  });

  test('each guide has a non-empty bgColor', () => {
    for (const def of GUIDE_DEFINITIONS) {
      expect(def.bgColor.length).toBeGreaterThan(0);
    }
  });

  test('each guide has labelKey and a11yKey set', () => {
    for (const def of GUIDE_DEFINITIONS) {
      expect(def.labelKey).toBeTruthy();
      expect(def.a11yKey).toBeTruthy();
    }
  });
});
