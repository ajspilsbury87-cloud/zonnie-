/**
 * Shared App Group snapshot writer for the iOS home-screen widget.
 *
 * Flow:
 *   - The main app computes its top-3 sunny terraces "right now" using
 *     the same scoring engine as the in-app list.
 *   - That top-3 is serialised to JSON and written into the App Group's
 *     shared UserDefaults under the key `widget-snapshot`.
 *   - WidgetKit, on its own refresh cadence, reads the same UserDefaults
 *     suite and renders the widget. JS is not running while the widget
 *     renders — the widget is a pure consumer.
 *
 * Why UserDefaults vs a file: simpler bridge surface, atomic writes (no
 * coordinator-needed file race), and the `@alevy97/react-native-
 * userdefaults` Expo module gives us a one-line write. The Swift
 * widget reads via `UserDefaults(suiteName: groupId).string(forKey:)`.
 *
 * The suite name == App Group identifier. Both halves (main app's
 * write + widget's read) MUST use the exact same group id —
 * `WIDGET_APP_GROUP_ID` below is the single source of truth on the
 * JS side; the Swift constant in ZonnieTimelineProvider.swift mirrors
 * it.
 */

import { Platform } from 'react-native';

import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';

/** Matches the Swift `WidgetSnapshot` decoder in ZonnieTimelineProvider.swift. */
export interface WidgetSnapshot {
  /** Top 3 terraces (more is fine; widget renders first 3). */
  topTerraces: WidgetTerraceSnapshot[];
  /**
   * Hour the data was computed for, in Amsterdam local time.
   * `null` if we couldn't determine it (e.g., default to "now").
   */
  computedForHour: number | null;
  /** ms since epoch — for debugging staleness in the Swift logs. */
  writtenAt: number;
}

export interface WidgetTerraceSnapshot {
  id: number;
  name: string;
  area: string;
  /** 0-100 integer. Pre-rounded so display always matches what we wrote. */
  scorePct: number;
}

export const WIDGET_APP_GROUP_ID = 'group.com.spilsbury.zonnie';
/** Key in the App Group's UserDefaults suite. Must match the Swift side. */
export const WIDGET_SNAPSHOT_KEY = 'widget-snapshot';

/**
 * Build a snapshot payload from the live ranked list. Pass the full
 * `useScoredTerraces` output and the current Amsterdam hour; we cap
 * to top 3 and pre-round score to integer percent.
 */
export function buildSnapshot(
  ranked: readonly ScoredTerrace[],
  amsterdamHour: number | null,
): WidgetSnapshot {
  const topTerraces: WidgetTerraceSnapshot[] = ranked.slice(0, 3).map((s) => ({
    id: s.terrace.id,
    name: s.terrace.name,
    area: s.terrace.area,
    scorePct: Math.round(s.score * 100),
  }));
  return {
    topTerraces,
    computedForHour: amsterdamHour,
    writtenAt: Date.now(),
  };
}

/**
 * Lazy-load the UserDefaults bridge. The package is iOS-only and we
 * don't want a hard import to crash on Android — `require()` inside
 * the function body is only evaluated on first call, and we guard
 * the call with Platform.OS first.
 *
 * Held in a module-scoped variable so we don't re-import per write.
 */
let userDefaultsInstance: { set: (key: string, value: unknown) => Promise<void> } | null = null;
function getUserDefaults() {
  if (userDefaultsInstance) return userDefaultsInstance;
  if (Platform.OS !== 'ios') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@alevy97/react-native-userdefaults');
  const UD = mod.default ?? mod.UserDefaults ?? mod;
  userDefaultsInstance = new UD(WIDGET_APP_GROUP_ID);
  return userDefaultsInstance;
}

/**
 * Write the snapshot to the App Group's shared UserDefaults under the
 * `widget-snapshot` key. WidgetKit reads it on next timeline refresh.
 *
 * iOS-only — silent no-op on Android. The widget itself is iOS-only
 * (WidgetKit), so there's nothing for Android to consume anyway.
 *
 * Errors are caught and logged but not re-thrown — a failed widget
 * write should never crash the foreground app. Worst case the widget
 * shows stale data until the next successful write.
 */
export async function writeWidgetSnapshot(
  snapshot: WidgetSnapshot,
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const ud = getUserDefaults();
    if (!ud) return;
    // The Swift widget JSON-decodes the stored value, so we serialise
    // here rather than letting UserDefaults dictionarify the object.
    await ud.set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[widget] snapshot write failed:', err);
  }
}
