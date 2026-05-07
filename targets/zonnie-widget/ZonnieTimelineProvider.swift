// ZonnieTimelineProvider.swift
//
// Provides timeline entries to WidgetKit. We don't compute scores here —
// score computation requires the building dataset, weather forecasts,
// and the sun-position engine, all of which live in the JS side. Instead:
//
//   - The main RN app writes the current top-3 (id, name, area, score)
//     to a shared App Group container as JSON, every time the user
//     opens the app or changes filters/time.
//   - This provider reads that JSON, packages it into a TimelineEntry,
//     and tells WidgetKit to refresh in 15 minutes (so a phone left
//     unopened all afternoon still sees its top-3 update modestly).
//
// iOS aggressively throttles widget refreshes — the 15-minute number
// is a hint, not a guarantee. Real refresh frequency depends on system
// load, battery, and how often the user looks at the home screen.

import Foundation
import WidgetKit

/// One timeline entry's worth of data. Renders as a single widget snapshot.
struct ZonnieEntry: TimelineEntry {
    let date: Date
    let topTerraces: [TerraceSnapshot]
    /// Hour the data was computed for, in Amsterdam local time. Shown
    /// in the header so users know "showing top 3 at 16:00".
    let computedForHour: Int?
}

/// Minimal terrace info needed to render one row. The shape mirrors what
/// the JS side writes to the App Group.
struct TerraceSnapshot: Codable, Identifiable {
    let id: Int
    let name: String
    let area: String
    /// 0-100 integer percentage. Rounded once on the JS side so we don't
    /// accidentally drift in display (e.g., 0.951 → "95" everywhere).
    let scorePct: Int
}

struct ZonnieTimelineProvider: TimelineProvider {
    /// Used by WidgetKit to render the lock-screen / gallery preview
    /// before any real data is available. Hardcoded sample so the
    /// widget always has something visual to show.
    func placeholder(in context: Context) -> ZonnieEntry {
        ZonnieEntry(
            date: Date(),
            topTerraces: [
                TerraceSnapshot(id: 1, name: "Café Kiebêrt", area: "Stadionbuurt", scorePct: 95),
                TerraceSnapshot(id: 2, name: "Hannekes Boom", area: "Centrum", scorePct: 92),
                TerraceSnapshot(id: 3, name: "Pllek", area: "Noord", scorePct: 88)
            ],
            computedForHour: 16
        )
    }

    /// Snapshot for the widget gallery (when the user is browsing widgets
    /// to add). Same as the live entry — we don't want a different look
    /// in the gallery vs. on the home screen.
    func getSnapshot(in context: Context, completion: @escaping (ZonnieEntry) -> Void) {
        completion(currentEntry())
    }

    /// The actual timeline. We supply one entry (now) and ask iOS to
    /// reload in 15 min. Sequential entries don't make sense here —
    /// scores depend on time-of-day and weather, both of which we'd need
    /// to forecast forward to render multiple future entries, and we'd
    /// rather defer that to the next refresh.
    func getTimeline(in context: Context, completion: @escaping (Timeline<ZonnieEntry>) -> Void) {
        let entry = currentEntry()
        let nextRefresh = Date().addingTimeInterval(15 * 60)
        let timeline = Timeline(entries: [entry], policy: .after(nextRefresh))
        completion(timeline)
    }

    /// Read the snapshot JSON the JS side wrote to the App Group's
    /// shared UserDefaults under the `widget-snapshot` key. If the
    /// key is missing or the JSON fails to parse, fall back to the
    /// hardcoded sample so the widget is never blank.
    private func currentEntry() -> ZonnieEntry {
        if let defaults = UserDefaults(suiteName: appGroupId),
           let raw = defaults.string(forKey: snapshotKey),
           let data = raw.data(using: .utf8),
           let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) {
            return ZonnieEntry(
                date: Date(),
                topTerraces: snapshot.topTerraces,
                computedForHour: snapshot.computedForHour
            )
        }
        return ZonnieEntry(
            date: Date(),
            topTerraces: [
                TerraceSnapshot(id: 1, name: "Café Kiebêrt", area: "Stadionbuurt", scorePct: 95),
                TerraceSnapshot(id: 2, name: "Hannekes Boom", area: "Centrum", scorePct: 92),
                TerraceSnapshot(id: 3, name: "Pllek", area: "Noord", scorePct: 88)
            ],
            computedForHour: nil
        )
    }

    /// Single source of truth on the Swift side. Mirrors:
    ///   - app.config.ts (ios.entitlements)
    ///   - targets/zonnie-widget/expo-target.config.js (entitlements)
    ///   - targets/zonnie-widget/ZonnieWidget.entitlements
    ///   - src/widget/snapshot.ts (WIDGET_APP_GROUP_ID)
    private let appGroupId = "group.com.spilsbury.zonnie"
    /// Mirrors src/widget/snapshot.ts (WIDGET_SNAPSHOT_KEY).
    private let snapshotKey = "widget-snapshot"
}

/// What the JS side writes. Kept in lockstep with the TS payload type
/// in `src/widget/snapshot.ts` (added in a later commit).
private struct WidgetSnapshot: Decodable {
    let topTerraces: [TerraceSnapshot]
    let computedForHour: Int?
    let writtenAt: Double // ms since epoch — for debugging staleness
}
