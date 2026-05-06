/**
 * Shared App Group snapshot writer for the iOS home-screen widget.
 *
 * Flow:
 *   - The main app computes its top-3 sunny terraces "right now" using
 *     the same scoring engine as the in-app list.
 *   - That top-3 is serialised to JSON and written into the App Group
 *     container at `widget-snapshot.json`.
 *   - WidgetKit, on its own refresh cadence, reads the JSON and renders
 *     the widget. JS is not running while the widget renders — the
 *     widget is a pure consumer.
 *
 * STATUS: scaffolding. The actual write needs a native module that
 * exposes `containerURL(forSecurityApplicationGroupIdentifier:)` to JS.
 * Two reasonable options, both of which require a fresh native build:
 *
 *   1. `@bacons/apple-targets` — Evan Bacon's config plugin for iOS
 *      extension targets. Pairs with a small expo-modules-core wrapper
 *      that exposes the App Group write API to JS.
 *
 *   2. `react-native-shared-group-preferences` — community package, has
 *      a JS-friendly API but only stores key/value pairs (no file
 *      writes). Could work since our payload is just a single JSON
 *      string under one key.
 *
 * Both require:
 *   - The App Group entitlement on the main app target
 *     (configured in `app.config.ts` under `ios.entitlements`).
 *   - The same App Group entitlement on the widget extension target
 *     (already configured in `targets/zonnie-widget/ZonnieWidget.entitlements`).
 *   - A native rebuild via EAS Build.
 *
 * Until those land, `writeWidgetSnapshot` is a no-op that just logs.
 * The widget displays its hardcoded sample data on-device. This file
 * exists so the JS-side payload type is committed and reviewable now.
 */

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
export const WIDGET_SNAPSHOT_FILENAME = 'widget-snapshot.json';

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
 * Write the snapshot to the App Group container. Currently a no-op
 * because we don't have the native write bridge yet — see top of file.
 */
export async function writeWidgetSnapshot(
  snapshot: WidgetSnapshot,
): Promise<void> {
  // TODO: replace with the chosen native bridge once a build with
  // App Group entitlements lands. Likely call shape:
  //
  //   await AppGroupBridge.writeFile(
  //     WIDGET_APP_GROUP_ID,
  //     WIDGET_SNAPSHOT_FILENAME,
  //     JSON.stringify(snapshot),
  //   );
  //
  // For now, log so devs can verify the payload.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[widget] would write snapshot:', JSON.stringify(snapshot));
  }
}
