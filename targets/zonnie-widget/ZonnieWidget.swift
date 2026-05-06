// ZonnieWidget.swift
//
// The widget itself. Configures the timeline provider, supported families
// (medium for v1), and binds the SwiftUI entry view.
//
// Tap behavior: the entry view uses Link or widgetURL with `zonnie://`
// deep-link URLs that the main app handles via expo-router. Tapping a
// terrace row opens its detail sheet. See Provider.getTimeline below
// for how each entry's URL is composed.

import SwiftUI
import WidgetKit

struct ZonnieWidget: Widget {
    let kind: String = "ZonnieWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: ZonnieTimelineProvider()
        ) { entry in
            ZonnieWidgetEntryView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Zonnie")
        .description("The sunniest Amsterdam terraces right now.")
        // Medium size only for v1. Small can't fit 3 rows of name + score
        // chip readably; large is overkill until we have a richer
        // visualization (sun timeline, weather strip, etc.).
        .supportedFamilies([.systemMedium])
    }
}
