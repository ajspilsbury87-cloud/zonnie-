/**
 * Bottom sheet hosting the time/weather scrubber and the ranked list.
 *
 * Snap points (revised 2026-05-05 per user feedback, fifth pass —
 * after pulling the hourly weather strip up into the peek):
 *   - 260  (absolute px) Handle + date picker + "Visiting HH:00 – HH:00"
 *          + [Now][Afternoon][Evening][All day] preset pills + per-hour
 *          weather strip. Three decision tools, all visible at peek:
 *          which day, which time window, what the weather looks like
 *          hour-by-hour. From/To fine-tune sliders sit below the cut.
 *          Absolute (not %) so peek height is identical across phones.
 *   - 60%  Above + From/To sliders + search + neighborhood + venue
 *          filters + ~3 list rows.
 *   - 92%  Full list.
 *
 * History: 22% hid sliders entirely; 36% leaked filter chips; 27% fit
 * sliders but no room for the weather summary; 30% with summary
 * worked but felt busy; 200 with preset pills was clean but the
 * hourly weather strip was hidden. 260 brings the strip into peek.
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
  const snapPoints = useMemo(() => [260, '60%', '92%'], []);

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
