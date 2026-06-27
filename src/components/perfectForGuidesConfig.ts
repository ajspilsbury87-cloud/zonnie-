/**
 * Pure configuration for the PerfectForGuides feature.
 *
 * This module is intentionally dependency-free (no React, no i18n, no
 * AsyncStorage chain) so that the action-mapping logic can be unit-tested
 * in a Jest/Node environment without native module mocks.
 *
 * The component (PerfectForGuides.tsx) imports from here;
 * the test (__tests__/perfectForGuides.test.ts) imports from here directly.
 */

import { useAreaStore } from '@/src/store/areaStore';
import { useTimeStore } from '@/src/store/timeStore';
import { palette } from '@/src/theme/tokens';

// ── Store reference bundle ────────────────────────────────────────────────────

/**
 * The two Zustand stores that guide actions mutate.
 * Passed as a bundle rather than accessed via module-level closures so
 * tests can inject the real store singletons without rendering anything.
 */
export interface GuideStores {
  timeStore: typeof useTimeStore;
  areaStore: typeof useAreaStore;
}

// ── Guide definition ──────────────────────────────────────────────────────────

/**
 * A GuideAction mutates store state to set up the guide's filter/time context.
 * Pure side-effect: no return value, no async.
 */
export type GuideAction = () => void;

/**
 * Identifies which keys in the Strings dictionary a guide needs.
 * Kept minimal — only the two label fields the component renders.
 */
export interface GuideStringKeys {
  labelKey: string;
  a11yKey: string;
}

/**
 * A single guide card definition.
 *
 * `key`         — stable React key and test identifier.
 * `labelKey`    — key into the Strings object for the visible label.
 * `a11yKey`     — key into the Strings object for the accessibility label.
 * `bgColor`     — card background. Different per card so the row reads
 *                 as distinct entry points, not a repeating list.
 * `buildAction` — factory that receives store references and returns the
 *                 GuideAction. Factory pattern (not a closure over stores)
 *                 makes unit testing trivial: pass real stores, call action.
 */
export interface GuideDefinition {
  key: string;
  labelKey: string;
  a11yKey: string;
  bgColor: string;
  buildAction: (stores: GuideStores) => GuideAction;
}

// Amethyst purple for the gem guide — matches the Gem chip in FilterChips.
const GEM_ACTIVE_BG = '#7B5EA7';

/**
 * Canonical guide definitions.
 *
 * Order determines left-to-right card order. "Sunny right now" leads
 * because it's the most immediate action; "Hidden gems" closes because
 * it's the most exploratory.
 *
 * Guides that were considered but dropped:
 *   - "Canal-side"  — no waterway sub-filter in the dataset
 *   - "Shady spot"  — app is sun-first; no shade-positive score exists
 *   - "Near me"     — sortByDistance requires GPS; better as an explicit
 *                     FilterChips toggle once location is confirmed
 */
export const GUIDE_DEFINITIONS: readonly GuideDefinition[] = [
  {
    key: 'sunny-now',
    labelKey: 'perfectForNow',
    a11yKey: 'perfectForNowA11y',
    bgColor: palette.burnt,
    buildAction: ({ timeStore }) => () => {
      timeStore.getState().resetToNow();
    },
  },
  {
    key: 'morning-sun',
    labelKey: 'perfectForMorning',
    a11yKey: 'perfectForMorningA11y',
    bgColor: palette.peach,
    buildAction: ({ timeStore }) => () => {
      timeStore.getState().setRange(9, 12);
    },
  },
  {
    key: 'golden-hour',
    labelKey: 'perfectForGoldenHour',
    a11yKey: 'perfectForGoldenHourA11y',
    bgColor: palette.orange,
    buildAction: ({ timeStore }) => () => {
      timeStore.getState().setRange(18, 21);
    },
  },
  {
    key: 'coffee-sun',
    labelKey: 'perfectForCoffee',
    a11yKey: 'perfectForCoffeeA11y',
    bgColor: palette.mustard,
    buildAction: ({ timeStore, areaStore }) => () => {
      // Shift to morning hours only when the user is currently viewing
      // afternoon/evening — same auto-shift logic as FilterChips.
      const { fromHour } = timeStore.getState();
      if (fromHour >= 12) {
        timeStore.getState().setRange(9, 12);
      }
      // Only activate, never deactivate — guide taps are one-directional.
      if (!areaStore.getState().selectedCategories.has('coffee')) {
        areaStore.getState().toggleCategory('coffee');
      }
    },
  },
  {
    key: 'big-screen',
    labelKey: 'perfectForBigScreen',
    a11yKey: 'perfectForBigScreenA11y',
    bgColor: palette.terracotta,
    buildAction: ({ areaStore }) => () => {
      areaStore.getState().setMatchModeOnly(true);
    },
  },
  {
    key: 'hidden-gems',
    labelKey: 'perfectForGems',
    a11yKey: 'perfectForGemsA11y',
    bgColor: GEM_ACTIVE_BG,
    buildAction: ({ areaStore }) => () => {
      // Only activate, never deactivate from a guide tap.
      if (!areaStore.getState().hiddenGemOnly) {
        areaStore.getState().toggleHiddenGemOnly();
      }
    },
  },
] as const;
