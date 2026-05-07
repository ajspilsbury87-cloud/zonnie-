/**
 * Apple-targets configuration for the Zonnie iOS home-screen widget.
 *
 * Read by `@bacons/apple-targets` during `npx expo prebuild` to declare
 * a WidgetKit extension target alongside the main app. The Swift sources
 * + Info.plist + entitlements in this same directory are compiled into
 * the extension's .appex.
 *
 * App Group identifier MUST match:
 *   - the value here (`com.apple.security.application-groups`)
 *   - the main app's entitlements in `app.config.ts` (ios.entitlements)
 *   - the JS-side constant in `src/widget/snapshot.ts` (WIDGET_APP_GROUP_ID)
 *   - the Swift constant in `ZonnieTimelineProvider.swift` (groupId)
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  // Match the main app's bundle id with .widget suffix; iOS requires
  // the extension's bundle id to be a child of the host app's.
  bundleIdentifier: 'com.spilsbury.zonnie.widget',
  // Display name when the user picks the widget from the gallery.
  name: 'Zonnie',
  // Same deployment target as the main app (app.config.ts: 15.1).
  deploymentTarget: '15.1',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.spilsbury.zonnie'],
  },
  // SwiftUI colours referenced via Color("$widgetBackground") etc. are
  // auto-generated as a Colors.xcassets entry. Brand palette mirrors the
  // RN side roughly — sandDeep background, amber accent.
  colors: {
    $widgetBackground: '#FFF8F0', // app `palette.sand`
    $accent: '#F59E0B', // app `palette.amber`
  },
};
