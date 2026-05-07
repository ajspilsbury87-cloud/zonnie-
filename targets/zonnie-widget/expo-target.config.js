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
  // Xcode TARGET name — must differ from the main app's target name
  // ('Zonnie'), otherwise prebuild generates two targets with the same
  // name and Xcode errors with "Multiple commands produce conflicting
  // outputs" + the provisioning-profile-to-target mapping inverts.
  // The user-visible widget gallery name comes from CFBundleDisplayName
  // in Info.plist (still 'Zonnie' there).
  name: 'ZonnieWidget',
  // Widget needs iOS 17.0 (the main app stays at 15.1) because:
  //   - SwiftUI's `containerBackground(_:for:)` modifier is iOS 17+
  //     and is REQUIRED for widgets to render correctly under iOS 17's
  //     new widget design system. Earlier modifiers (`.background()`)
  //     produce visually broken widgets on iOS 17+.
  //   - The `.widget` `WidgetRenderingMode` enum case used by it is
  //     also 17+.
  // iOS 17 adoption was 85%+ by mid-2024, so excluding older devices
  // from the widget specifically (main app still works on 15.1+) is
  // acceptable. Apple effectively forces this for new widgets.
  deploymentTarget: '17.0',
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
