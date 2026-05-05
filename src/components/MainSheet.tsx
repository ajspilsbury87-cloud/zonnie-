/**
 * Bottom sheet hosting the time/weather scrubber and the ranked list.
 *
 * Snap points (revised 2026-05-05 per user feedback, fourth pass —
 * after switching to preset-pill UX):
 *   - 200  (absolute px) Handle + date picker + "Visiting HH:00 – HH:00"
 *          + weather summary + [Now][Afternoon][Evening][All day] preset
 *          pills. Pills cover the dominant decisions in one tap. Custom
 *          From/To sliders are deliberately hidden at this layer — the
 *          peek is for *deciding*, not *fine-tuning*.
 *          Absolute (not %) so peek height is identical across phones —
 *          on iPhone SE it doesn't clip the pills, on iPhone Pro Max
 *          it doesn't waste screen.
 *   - 60%  Above + From/To sliders + per-hour weather strip + search
 *          + neighborhood + venue filters + ~3 list rows.
 *   - 92%  Full list.
 *
 * History: 22% hid sliders entirely; 36% leaked filter chips; 27% fit
 * sliders but no room for the weather summary; 30% with summary worked
 * but felt busy at peek. Switching to preset pills as the primary
 * interaction made the sliders fine-tune territory, so they moved
 * below the peek cut.
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
  const snapPoints = useMemo(() => [200, '60%', '92%'], []);

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
