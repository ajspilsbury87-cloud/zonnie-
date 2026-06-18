import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { FilterChips } from '@/src/components/FilterChips';
import { LandingPage } from '@/src/components/LandingPage';
import { MainSheet } from '@/src/components/MainSheet';
import { ProPaywall } from '@/src/components/ProPaywall';
import { ShortlistBar } from '@/src/components/ShortlistBar';
import { TerraceDetailSheet } from '@/src/components/TerraceDetailSheet';
import { ZonnieMap } from '@/src/components/ZonnieMap';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { haptics } from '@/src/lib/haptics';
import { useLandingStore } from '@/src/store/landingStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { palette, radii, spacing } from '@/src/theme/tokens';

export default function Index() {
  const select = useSelectionStore((s) => s.select);
  const handleSelect = useCallback(
    (item: ScoredTerrace) => select(item.terrace.id),
    [select],
  );

  // Landing store — drives both the LandingPage overlay and the home button.
  const landingVisible = useLandingStore((s) => s.visible);
  const showLanding = useLandingStore((s) => s.show);

  // Read selectedId so the home button hides when a detail sheet is open.
  // We don't want the button floating over the detail sheet backdrop.
  const selectedId = useSelectionStore((s) => s.selectedId);

  // Safe-area insets for the home button so it clears the status bar / notch.
  const insets = useSafeAreaInsets();

  const handleHomePress = useCallback(() => {
    haptics.light();
    showLanding();
  }, [showLanding]);

  // Each top-level surface gets its own boundary so a crash in one (e.g.
  // map render) doesn't take the bottom sheet down with it. The visible
  // fallback also gives us a way to read the error message — without this,
  // a thrown render error would unmount the tree and the user would see a
  // blank screen / iOS would eventually kill the process.
  //
  // LAYER ORDER (back → front, last sibling paints on top):
  //   1. ZonnieMap          — base map layer
  //   2. MainSheet          — bottom sheet over the map
  //   3. FilterChips        — floating chip row above the map, below detail sheet
  //   4. LandingPage        — Home overlay — when visible (no zIndex; order is the stack)
  //   5. TerraceDetailSheet — opens ABOVE Home so detail works over Home
  //   6. ProPaywall         — modal, always above
  //   7. ShortlistBar       — floating bar, always above
  //   8. home button        — top-left overlay, shown when Home is hidden
  return (
    <View style={styles.container}>
      <ErrorBoundary surface="ZonnieMap">
        <ZonnieMap onSelect={handleSelect} />
      </ErrorBoundary>
      <ErrorBoundary surface="MainSheet">
        <MainSheet onSelect={handleSelect} />
      </ErrorBoundary>
      {/* FilterChips — floating chip row above the map.
          Hidden when the Home overlay is visible (the map itself is hidden)
          and when a detail sheet is open (detail backdrop covers chips). */}
      {!landingVisible && selectedId == null ? (
        <ErrorBoundary surface="FilterChips">
          <FilterChips />
        </ErrorBoundary>
      ) : null}
      {landingVisible ? (
        <ErrorBoundary surface="LandingPage">
          <LandingPage />
        </ErrorBoundary>
      ) : null}
      <ErrorBoundary surface="TerraceDetailSheet">
        <TerraceDetailSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="ProPaywall">
        <ProPaywall />
      </ErrorBoundary>
      <ErrorBoundary surface="ShortlistBar">
        <ShortlistBar />
      </ErrorBoundary>
      {/* Home button — shown only when the map is the active surface:
          Home overlay is hidden AND no detail sheet is open. Hiding it
          when a detail is open prevents the button floating over the sheet
          backdrop. Document order (last sibling) is sufficient for z-layering. */}
      {!landingVisible && selectedId == null ? (
        <Pressable
          onPress={handleHomePress}
          style={[styles.homeButton, { top: insets.top + spacing.sm }]}
          accessibilityLabel="Return to home screen"
          accessibilityRole="button"
        >
          <Text style={styles.homeButtonGlyph}>⌂</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  homeButton: {
    position: 'absolute',
    left: spacing.md,
    // `top` is set dynamically in JSX (insets.top + spacing.sm)
    width: 44,
    height: 44,
    // Circular, brand-burnt fill so it reads as a modern floating action
    // button and clearly stands out against the map (was a plain white square).
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation lifts the button above map tiles and the MainSheet handle.
    // No zIndex — document order (last rendered sibling) handles layering.
    elevation: 6,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  homeButtonGlyph: {
    fontSize: 22,
    color: palette.white,
    // The ⌂ glyph sits slightly low in most system fonts; nudge it up.
    lineHeight: 26,
    textAlign: 'center',
  },
});
