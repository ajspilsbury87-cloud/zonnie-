# Zonnie iOS Widget — scaffolding state

This directory contains the **isolated** Swift sources, Info.plist, and
entitlements file for an iOS home-screen widget that shows Zonnie's
top-3 sunny terraces "right now" with deep-link tap-to-open.

**Nothing here is wired into the build yet.** I created these files
during an overnight session so the plumbing is ready for review without
touching `app.config.ts`, `package.json`, or anything that would risk
breaking the running RN app. The only JS-side file added is
`src/widget/snapshot.ts`, which is a pure TypeScript module with no
native dependencies — it currently no-ops the write.

## What exists

```
targets/zonnie-widget/
  ZonnieWidgetBundle.swift        # @main entry point
  ZonnieWidget.swift              # Widget config (medium size only for v1)
  ZonnieTimelineProvider.swift    # Reads JSON from App Group container
  ZonnieWidgetEntryView.swift     # SwiftUI rendering, deep-links on tap
  Info.plist                      # WidgetKit extension Info.plist
  ZonnieWidget.entitlements       # App Group entitlement
  README.md                       # this file

src/widget/
  snapshot.ts                     # Payload type + `buildSnapshot` helper +
                                  # no-op `writeWidgetSnapshot` placeholder
```

## What still needs to happen

This is a multi-step integration. Each step has explicit checkpoints
so we can stop, verify, and roll back if anything goes sideways.

### 1. Pick a config plugin

Two options (only one needs to land):

**A. `@bacons/apple-targets`** (recommended)
   - Evan Bacon's config plugin for declaring iOS extension targets in
     a managed Expo app.
   - Reads `apple-targets-config.json` (or similar) and adds the
     extension to the generated Xcode project.
   - Requires `npx expo prebuild` then a fresh EAS Build.

**B. Custom config plugin in `plugins/widget.ts`**
   - More work, more control. ~150 lines of Mods that copy
     `targets/zonnie-widget/` into `ios/` during prebuild and add the
     target to the project.pbxproj via `@expo/config-plugins`.
   - Avoids a new external dependency.

I recommend **A** for v1 — it's the de-facto solution and Bacon
maintains it actively. We can swap to a custom plugin later if we hit
its limitations.

### 2. Add App Group entitlement to the main app

Edit `app.config.ts` under `ios`:

```ts
ios: {
  // ... existing config
  entitlements: {
    'com.apple.security.application-groups': ['group.com.spilsbury.zonnie'],
  },
},
```

The same identifier already lives in
`targets/zonnie-widget/ZonnieWidget.entitlements` and in
`src/widget/snapshot.ts` (`WIDGET_APP_GROUP_ID`). They MUST match
character-for-character.

### 3. Wire the JS-side write

Once `@bacons/apple-targets` is installed, install the matching native
write bridge. Two candidates:

   - `expo-shared-group-preferences` (if Bacon ships one)
   - `react-native-shared-group-preferences` (community)
   - Or write a tiny custom expo-modules-core module — ~20 lines of
     Swift, exposes `writeFileToAppGroup(groupId, filename, contents)`.

Replace the no-op in `src/widget/snapshot.ts:writeWidgetSnapshot` with
the bridge call. Schema doesn't change, just plumbing.

### 4. Hook into the app lifecycle

Add a small effect somewhere central (probably `app/index.tsx` or a
new `useWidgetSync` hook) that:

   - Subscribes to `useScoredTerraces` output
   - On change, calls `buildSnapshot(...)` then `writeWidgetSnapshot(...)`
   - Debounces — we don't need to write 30× during a slider drag

```ts
useEffect(() => {
  const snapshot = buildSnapshot(ranked, amsterdamHour);
  writeWidgetSnapshot(snapshot);
}, [ranked, amsterdamHour]);
```

### 5. Wire the deep-link

The widget's tap action sends `zonnie://terrace/<id>`. The app already
handles `zonnie://` via expo-router's URL scheme config in
`app.config.ts`, but the route handler for `terrace/<id>` doesn't
exist yet. We need:

```ts
// app/terrace/[id].tsx — opens TerraceDetailSheet for that id
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { useSelectionStore } from '@/src/store/selectionStore';

export default function TerraceDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const select = useSelectionStore((s) => s.select);
  useEffect(() => {
    if (id) {
      select(Number(id));
      router.replace('/');  // bounce to home; selectionStore opens the sheet
    }
  }, [id, select]);
  return null;
}
```

### 6. EAS Build

```
eas build --platform ios --profile preview
```

~20-30 min. Output: a fresh TestFlight build that has the widget
extension included. Install on phone, long-press home screen, +,
search "Zonnie", add the medium widget. Should show the
hardcoded-sample placeholder until the JS write lands.

### 7. Verify end-to-end

Open the app → check console for the snapshot log → wait ~15 min for
WidgetKit to refresh → verify widget shows live data. Tap a terrace
row → should open the app with the matching detail sheet.

## Known issues / things I deliberately did NOT do

- No `@bacons/apple-targets` install — that's an `npm install` that
  would mutate `package.json` and `node_modules` while you're asleep.
- No `app.config.ts` edits — one wrong char in the plugin config and
  prebuild errors out. Wanted you awake for that.
- No EAS Build trigger — long-running, costs you a build credit, and
  the result needs you on your Mac to install on device anyway.
- No tests for the Swift code. SwiftUI snapshot testing in an Expo
  managed workflow is fiddly; let's deal with that after one
  successful end-to-end build.
- The `scoreColor` in `ZonnieWidgetEntryView.swift` is a hardcoded
  duplicate of the JS palette. We can DRY that out later via a build
  script that reads `src/theme/tokens.ts` and emits a Swift file —
  not worth it for v1.
