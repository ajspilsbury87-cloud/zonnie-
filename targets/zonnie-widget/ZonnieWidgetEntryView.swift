// ZonnieWidgetEntryView.swift
//
// SwiftUI rendering for one ZonnieEntry. Renders the top-3 terraces as
// rows, each with name, area, and a score chip. Each row is wrapped in
// a Link to a deep-link URL so tapping opens the right terrace in the
// app.
//
// Visual style aims for the brand's warm/sun palette without spending
// effort on perfect parity with the RN UI — the widget is small and
// glance-able, not a duplicate of the app.

import SwiftUI
import WidgetKit

struct ZonnieWidgetEntryView: View {
    let entry: ZonnieEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 4) {
                Text("☀")
                    .font(.system(size: 14))
                Text("Sunniest right now")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if let hour = entry.computedForHour {
                    Text(String(format: "%02d:00", hour))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Up to three rows. Padding kept tight — the medium widget
            // gives ~150pt of vertical real estate after the system
            // chrome, three rows + header has to fit in that.
            ForEach(Array(entry.topTerraces.prefix(3).enumerated()), id: \.element.id) { idx, t in
                Link(destination: deepLink(for: t)) {
                    rowView(rank: idx + 1, terrace: t)
                }
            }

            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func rowView(rank: Int, terrace: TerraceSnapshot) -> some View {
        HStack(spacing: 8) {
            Text("\(rank)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 14, alignment: .trailing)

            VStack(alignment: .leading, spacing: 1) {
                Text(terrace.name)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                Text(terrace.area)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Text("\(terrace.scorePct)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(scoreColor(terrace.scorePct), in: Capsule())
        }
    }

    /// Maps the score percentage to a colour roughly matching the RN
    /// app's `scoreToColor`. Hardcoded here rather than dragging the JS
    /// palette across the language boundary; small enough to keep in
    /// sync manually.
    private func scoreColor(_ pct: Int) -> Color {
        switch pct {
        case 90...: return Color(red: 0.96, green: 0.62, blue: 0.07)  // amber
        case 70...: return Color(red: 0.98, green: 0.75, blue: 0.14)  // gold
        case 50...: return Color(red: 0.92, green: 0.62, blue: 0.20)  // mid-amber
        case 30...: return Color(red: 0.85, green: 0.46, blue: 0.04)  // dark amber
        default:    return Color(red: 0.42, green: 0.45, blue: 0.50)  // ink-soft
        }
    }

    /// Deep-link URL the main app handles via expo-router. The host
    /// `terrace` + path-segment id maps to a route we'll wire on the JS
    /// side that opens the detail sheet for that id.
    private func deepLink(for terrace: TerraceSnapshot) -> URL {
        URL(string: "zonnie://terrace/\(terrace.id)")!
    }
}
