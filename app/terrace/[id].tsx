/**
 * Deep-link entry point for `zonnie://terrace/<id>` URLs.
 *
 * The home-screen widget renders three rows, each a Link to a URL of
 * the form `zonnie://terrace/501`. iOS hands those URLs to the app via
 * the URL scheme declared in app.config.ts (`scheme: 'zonnie'`),
 * expo-router resolves them against the file-system route at
 * `app/terrace/[id].tsx`, and lands here.
 *
 * This route does no rendering of its own — the app's primary surface
 * (map + bottom sheet + detail sheet) lives at `/`. We:
 *   1. Read the id from the URL path.
 *   2. Push it into `selectionStore.select(id)` — the existing
 *      TerraceDetailSheet already reacts to that store change and
 *      presents itself.
 *   3. `router.replace('/')` so the user lands on the map with the
 *      detail open, not on a deep-link screen with nothing on it.
 *
 * Why `replace` and not `push`: the URL shouldn't pollute the back
 * stack — coming back from the detail should take the user to where
 * they were before tapping the widget (typically the OS home screen),
 * not back to a stub deep-link screen.
 */

import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';

import { TERRACES } from '@/src/data/terraces';
import { useSelectionStore } from '@/src/store/selectionStore';

export default function TerraceDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const select = useSelectionStore((s) => s.select);

  useEffect(() => {
    const numericId = Number(id);
    // Only honour ids that exist in the dataset — a stale widget could
    // hold an id we've since removed from terraces.json. Falling
    // through silently to root is friendlier than a blank detail sheet.
    const known = Number.isFinite(numericId)
      ? TERRACES.some((t) => t.id === numericId)
      : false;
    if (known) {
      select(numericId);
    }
    router.replace('/');
  }, [id, select]);

  return null;
}
