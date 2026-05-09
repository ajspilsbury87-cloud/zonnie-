import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { MainSheet } from '@/src/components/MainSheet';
import { TerraceDetailSheet } from '@/src/components/TerraceDetailSheet';
import { ZonnieMap } from '@/src/components/ZonnieMap';
import { TERRACES } from '@/src/data/terraces';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useSelectionStore } from '@/src/store/selectionStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export default function Index() {
  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const handleSelect = useCallback(
    (item: ScoredTerrace) => select(item.terrace.id),
    [select],
  );

  // Each top-level surface gets its own boundary so a crash in one (e.g.
  // map render) doesn't take the bottom sheet down with it. The visible
  // fallback also gives us a way to read the error message — without this,
  // a thrown render error would unmount the tree and the user would see a
  // blank screen / iOS would eventually kill the process.
  // DEBUG (temporary, 2026-05-09): Andy reports the detail sheet won't
  // open from marker/list tap. The debug button bypasses both paths and
  // calls select() directly. The label echoes live `selectedId` from
  // the store so a tap visibly changes the number even if the sheet
  // doesn't open — distinguishes "store works but sheet doesn't" from
  // "store also broken". Sheet diagnosis is now: with provider moved
  // here, present() should land cleanly.
  const debugSelect = useCallback(() => {
    const first = TERRACES[0];
    if (first) select(first.id);
  }, [select]);

  // No more BottomSheetModalProvider — TerraceDetailSheet is now a
  // plain `<BottomSheet>` with conditional rendering, so the portal
  // mechanism that was failing in v5 is no longer in the picture.
  return (
    <View style={styles.container}>
      <ErrorBoundary surface="ZonnieMap">
        <ZonnieMap onSelect={handleSelect} />
      </ErrorBoundary>
      <ErrorBoundary surface="MainSheet">
        <MainSheet onSelect={handleSelect} />
      </ErrorBoundary>
      <ErrorBoundary surface="TerraceDetailSheet">
        <TerraceDetailSheet />
      </ErrorBoundary>
      {/* DEBUG (temporary): label shows live selectedId */}
      <Pressable
        onPress={debugSelect}
        style={({ pressed }) => [styles.debugButton, pressed && styles.debugButtonPressed]}
      >
        <Text style={styles.debugButtonText}>
          TEST DETAIL · sel={selectedId ?? 'null'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  debugButton: {
    position: 'absolute',
    top: 90,
    left: spacing.lg,
    backgroundColor: palette.terracotta,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 50,
  },
  debugButtonPressed: {
    opacity: 0.7,
  },
  debugButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
    letterSpacing: 1,
  },
});
