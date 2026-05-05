/**
 * Bottom sheet hosting the time/weather scrubber and the ranked list.
 *
 * Snap points (revised 2026-05-05 per user feedback):
 *   - 36%  Date picker + full From/To scrubber sliders. The user can
 *          adjust the time window without expanding the sheet.
 *   - 60%  Above + weather strip + search + filters + ~3 list rows.
 *   - 92%  Full list.
 *
 * The previous 22% peek hid the actual sliders (only the title bar
 * showed) — adjusting time required expanding to 55% first, which made
 * the map invisible. 36% keeps the sliders reachable while still giving
 * most of the map view.
 *
 * Layout note: the Scrubber + filters are rendered as the FlatList's
 * sticky header (`stickyHeaderIndices={[0]}`) rather than siblings.
 * Gorhom's gesture system needs the FlatList to be the sheet's primary
 * scrollable; siblings get the sheet drag handler and break row taps.
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
  const snapPoints = useMemo(() => ['36%', '60%', '92%'], []);

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
