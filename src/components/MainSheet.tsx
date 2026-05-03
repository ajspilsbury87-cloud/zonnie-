/**
 * Bottom sheet hosting the time/weather scrubber and the ranked list.
 *
 * Snap points: 22% (peek — handle + scrubber visible), 55% (scrubber + first
 * ~6 rows), 92% (full list).
 *
 * Layout note: the Scrubber is rendered as the FlatList's header (with
 * `stickyHeaderIndices={[0]}`) rather than as a sibling above the list. This
 * matters for two reasons:
 *   - Gorhom's gesture system needs the FlatList to be the sheet's primary
 *     scrollable; siblings get the sheet drag handler instead, which broke
 *     row taps and scrolling.
 *   - A sticky header keeps the scrubber visually pinned at the top of the
 *     sheet even when the list is scrolled, so users can scrub time without
 *     scrolling back up.
 */

import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';

import { TerraceList } from '@/src/components/TerraceList';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { palette, radii } from '@/src/theme/tokens';

interface MainSheetProps {
  onSelect?: (item: ScoredTerrace) => void;
}

export function MainSheet({ onSelect }: MainSheetProps) {
  const ref = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['22%', '55%', '92%'], []);

  const handleSelect = useCallback(
    (item: ScoredTerrace) => {
      onSelect?.(item);
    },
    [onSelect],
  );

  return (
    <BottomSheet
      ref={ref}
      snapPoints={snapPoints}
      index={1}
      enableDynamicSizing={false}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <TerraceList onSelect={handleSelect} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: palette.mistDeep,
    width: 36,
  },
});
