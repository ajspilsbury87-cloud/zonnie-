/**
 * Bottom sheet hosting the time/weather scrubber and the ranked list.
 *
 * Snap points (revised 2026-05-05 per user feedback, fifth pass —
 * after pulling the hourly weather strip up into the peek):
 *   - 290  (absolute px) Handle + date picker + "Visiting HH:00 – HH:00"
 *          + [Now][Afternoon][Evening][All day] preset pills + per-hour
 *          weather strip. Three decision tools, all visible at peek:
 *          which day, which time window, what the weather looks like
 *          hour-by-hour. From/To fine-tune sliders sit below the cut.
 *          Absolute (not %) so peek height is identical across phones.
 *          290 (was 260) leaves breathing room so the bottom of the
 *          weather strip doesn't clip under the home-bar safe area
 *          on phones with smaller usable height.
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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';

import { TerraceList } from '@/src/components/TerraceList';
import { useSelectionStore } from '@/src/store/selectionStore';
import { useShortlistStore } from '@/src/store/shortlistStore';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { palette, radii } from '@/src/theme/tokens';

interface MainSheetProps {
  onSelect?: (item: ScoredTerrace) => void;
}

export function MainSheet({ onSelect }: MainSheetProps) {
  const ref = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [290, '60%', '92%'], []);
  // The detail sheet's "Show on Map" action sets `panTo` then clears
  // selection. ZonnieMap watches `panTo` and animates the map. We
  // also want this sheet to minimise to peek so the user actually
  // sees the map — otherwise the listing covers the destination.
  // Subscribe to panTo; on transition null → non-null, snap to index 0.
  const panTo = useSelectionStore((s) => s.panTo);

  // Group-vote shortlist mode. The floating "Ask the group" bar is rendered
  // absolute-bottom inside the sheet content, which Gorhom lays out at the
  // MAX snap height — so at the 60% peek it sits below the fold and the user
  // can't see it after selecting terraces. Expanding to full (index 2) when
  // selection mode turns on brings the bar into view (and gives the full list
  // to pick from, which is what you want while shortlisting anyway).
  const isSelectingShortlist = useShortlistStore((s) => s.isSelecting);

  const handleSelect = useCallback(
    (item: ScoredTerrace) => {
      onSelect?.(item);
    },
    [onSelect],
  );

  useEffect(() => {
    if (panTo != null) {
      ref.current?.snapToIndex(0);
    }
  }, [panTo]);

  useEffect(() => {
    if (isSelectingShortlist) {
      ref.current?.snapToIndex(2);
    }
  }, [isSelectingShortlist]);

  return (
    <BottomSheet
      ref={ref}
      snapPoints={snapPoints}
      index={1}
      enableDynamicSizing={false}
      // Keyboard handling for the in-header search field (a BottomSheetTextInput).
      // Without this the keyboard covered the bottom of the list and the scroll
      // extent couldn't reach past it. "extend" gives the list the full sheet
      // height while typing; "restore" returns to the prior snap on dismiss.
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
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
