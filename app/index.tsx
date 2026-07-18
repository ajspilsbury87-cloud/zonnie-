import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { ChaseTheSunSheet } from '@/src/components/ChaseTheSunSheet';
import { SunRunSheet } from '@/src/components/SunRunSheet';
import { SunStatsSheet } from '@/src/components/SunStatsSheet';
import { FilterChips } from '@/src/components/FilterChips';
import { LandingPage } from '@/src/components/LandingPage';
import { SunLegend } from '@/src/components/SunLegend';
import { MainSheet } from '@/src/components/MainSheet';
import { ProPaywall } from '@/src/components/ProPaywall';
import { ShortlistBar } from '@/src/components/ShortlistBar';
import { TerraceDetailSheet } from '@/src/components/TerraceDetailSheet';
import { TerracePeekCard } from '@/src/components/TerracePeekCard';
import { ZonnieMap } from '@/src/components/ZonnieMap';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { haptics } from '@/src/lib/haptics';
import { useLandingStore } from '@/src/store/landingStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { palette, radii, spacing } from '@/src/theme/tokens';

export default function Index() {
  const select = useSelectionStore((s) => s.select);
  const peek = useSelectionStore((s) => s.peek);
  // List rows commit to a terrace → open the full detail sheet directly.
  const handleListSelect = useCallback(
    (item: ScoredTerrace) => select(item.terrace.id),
    [select],
  );
  // Map pins are exploratory → show the compact peek card first
  // (AllTrails pattern); tapping the card expands to the full sheet.
  const handlePinSelect = useCallback(
    (item: ScoredTerrace) => peek(item.terrace.id),
    [peek],
  );

  // Landing store — drives both the LandingPage overlay and the home button.
  const landingVisible = useLandingStore((s) => s.visible);
  const showLanding = useLandingStore((s) => s.show);

  // Defer mounting the heavy surfaces (the map + the bottom-sheet list) until
  // Home is first dismissed. On a cold launch the full-screen Home overlay
  // covers them, so mounting MapView + pins AND scoring the whole list
  // underneath is invisible work that saturates the JS thread for several
  // seconds — long enough that the "See all terraces" tap doesn't register. We
  // mount them the moment Home is hidden and keep them mounted thereafter (no
  // re-init when the user returns Home).
  const [homeExited, setHomeExited] = useState(false);
  useEffect(() => {
    if (!landingVisible) setHomeExited(true);
  }, [landingVisible]);
  const showHeavySurfaces = homeExited || !landingVisible;

  // The floating map UI (chips, legend, home button) hides only when the
  // FULL detail sheet is open — its backdrop covers them. A 'peek'
  // selection keeps the map live behind the compact card, so those
  // controls stay visible and usable.
  const selectedId = useSelectionStore((s) => s.selectedId);
  const stage = useSelectionStore((s) => s.stage);
  const detailSheetOpen = selectedId != null && stage === 'full';

  // Safe-area insets for the home button so it clears the status bar / notch.
  const insets = useSafeAreaInsets();

  const clearSelection = useSelectionStore((s) => s.clear);
  const handleHomePress = useCallback(() => {
    haptics.light();
    // Drop any lingering peek/selection so nothing floats over Home.
    clearSelection();
    showLanding();
  }, [clearSelection, showLanding]);

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
  //   4. SunLegend          — left-edge colour key, same gate as FilterChips
  //   5. LandingPage        — Home overlay — when visible (no zIndex; order is the stack)
  //   6. TerracePeekCard    — compact pin-tap preview, floats over map + MainSheet
  //   7. TerraceDetailSheet — opens ABOVE Home so detail works over Home
  //   8. ChaseTheSunSheet   — opens ABOVE TerraceDetailSheet (rendered after)
  //   9. ProPaywall         — modal, always above
  //  10. ShortlistBar       — floating bar, always above
  //  11. home button        — top-left overlay, shown when Home is hidden
  return (
    <View style={styles.container}>
      {showHeavySurfaces ? (
        <ErrorBoundary surface="ZonnieMap">
          <ZonnieMap onSelect={handlePinSelect} />
        </ErrorBoundary>
      ) : null}
      {showHeavySurfaces ? (
        <ErrorBoundary surface="MainSheet">
          <MainSheet onSelect={handleListSelect} />
        </ErrorBoundary>
      ) : null}
      {/* FilterChips — floating chip row above the map.
          Hidden when the Home overlay is visible (the map itself is hidden)
          and when the FULL detail sheet is open (its backdrop covers chips).
          Still shown during a peek — the map remains the active surface. */}
      {!landingVisible && !detailSheetOpen ? (
        <ErrorBoundary surface="FilterChips">
          <FilterChips />
        </ErrorBoundary>
      ) : null}
      {/* SunLegend — collapsible colour key on the left edge of the map.
          Same visibility gate as FilterChips: only shown on the live map
          (no home overlay, no full detail sheet open). Placed before
          TerraceDetailSheet so the detail sheet renders above it. */}
      {!landingVisible && !detailSheetOpen ? (
        <ErrorBoundary surface="SunLegend">
          <SunLegend />
        </ErrorBoundary>
      ) : null}
      {/* Kept MOUNTED and hidden with display:none while the map is active:
          unmounting meant every ⌂ tap re-mounted Home and re-ran the deferred
          ranking pass, so returning home visibly lagged. display:'none' skips
          layout and paint entirely; scores, scroll position and the
          intro-played animation state all survive, so the return is instant. */}
      <View
        style={landingVisible ? styles.landingHost : styles.landingHostHidden}
        pointerEvents={landingVisible ? 'auto' : 'none'}
      >
        <ErrorBoundary surface="LandingPage">
          <LandingPage />
        </ErrorBoundary>
      </View>
      {/* TerracePeekCard — compact preview after a pin tap. Renders null
          unless a selection is at stage 'peek', so it costs nothing the
          rest of the time. Above MainSheet (paints over its handle area),
          below the detail/crawl sheets and modals. */}
      {/* Gated on the Home overlay: a peek left behind when Home reopens
          floated on top of it, covering the CTA footer. */}
      {!landingVisible ? (
        <ErrorBoundary surface="TerracePeekCard">
          <TerracePeekCard />
        </ErrorBoundary>
      ) : null}
      <ErrorBoundary surface="TerraceDetailSheet">
        <TerraceDetailSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="ChaseTheSunSheet">
        <ChaseTheSunSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="SunRunSheet">
        <SunRunSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="SunStatsSheet">
        <SunStatsSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="ProPaywall">
        <ProPaywall />
      </ErrorBoundary>
      <ErrorBoundary surface="ShortlistBar">
        <ShortlistBar />
      </ErrorBoundary>
      {/* Home button — shown only when the map is the active surface:
          Home overlay is hidden AND the full detail sheet is closed
          (a peek card doesn't count — the map is still active). Hiding it
          when a detail is open prevents the button floating over the sheet
          backdrop. Document order (last sibling) is sufficient for z-layering. */}
      {!landingVisible && !detailSheetOpen ? (
        <Pressable
          onPress={handleHomePress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.homeButton,
            { top: insets.top + spacing.sm },
            pressed && styles.homeButtonPressed,
          ]}
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
    // 52pt — the primary route back to Home earns more presence than the
    // 44pt secondary map controls (first-user feedback: too small).
    width: 52,
    height: 52,
    // Circular, brand-burnt fill so it reads as a modern floating action
    // button and clearly stands out against the map (was a plain white square).
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
    alignItems: 'center',
    justifyContent: 'center',
    // Cream ring separates the burnt disc from busy map tiles beneath.
    borderWidth: 2,
    borderColor: 'rgba(255, 229, 194, 0.95)',
    // Elevation lifts the button above map tiles and the MainSheet handle.
    // No zIndex — document order (last rendered sibling) handles layering.
    elevation: 6,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 9,
  },
  // Tactile press: a quick shrink reads better over map tiles than a fade.
  homeButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.92,
  },
  homeButtonGlyph: {
    fontSize: 26,
    color: palette.white,
    // The ⌂ glyph sits slightly low in most system fonts; nudge it up.
    lineHeight: 30,
    textAlign: 'center',
  },
  // Landing host — full-screen wrapper that hides (not unmounts) Home.
  landingHost: {
    ...StyleSheet.absoluteFillObject,
  },
  landingHostHidden: {
    ...StyleSheet.absoluteFillObject,
    display: 'none',
  },
});
