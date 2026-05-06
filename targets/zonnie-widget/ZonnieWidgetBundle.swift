// ZonnieWidgetBundle.swift
//
// Entry point for the Zonnie iOS home-screen widget extension. WidgetKit
// looks for the @main-attributed WidgetBundle to discover all widgets the
// extension provides. We currently expose one — the medium-size "top 3
// sunny terraces right now" tile.
//
// This file is part of a separate iOS extension target, NOT the main RN
// app. It compiles into its own .appex inside Zonnie.app.

import SwiftUI
import WidgetKit

@main
struct ZonnieWidgetBundle: WidgetBundle {
    var body: some Widget {
        ZonnieWidget()
    }
}
