import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { DatePicker } from '@/src/components/DatePicker';
import { NeighborhoodFilter } from '@/src/components/NeighborhoodFilter';
import { SearchBox } from '@/src/components/SearchBox';
import {
  TimeRangeFineTune,
  TimeRangeQuickPicker,
} from '@/src/components/TimeRangeScrubber';
import { VenueTypeFilter } from '@/src/components/VenueTypeFilter';
import { WeatherStrip } from '@/src/components/WeatherStrip';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { scoreLabel } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';

// Row pitch used by selectedId → scroll-to-top math. Keep in sync with
// the row's natural height (paddingVertical * 2 + name lineHeight +
// subtitle lineHeight + marginTop). Doesn't need to be exact — slight
// drift just means the row lands a few px off, which is fine.
const ROW_HEIGHT = 65;

interface RowProps {
  rank: number;
  item: ScoredTerrace;
  isSelected: boolean;
  onPress?: (item: ScoredTerrace) => void;
}

const Row = memo(function Row({ rank, item, isSelected, onPress }: RowProps) {
  const { terrace, score } = item;
  const pct = Math.round(score * 100);
  const color = scoreToColor(score);
  return (
    <TouchableOpacity
      onPress={() => {
        haptics.light();
        onPress?.(item);
      }}
      activeOpacity={0.6}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {terrace.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {terrace.area} · {terrace.facing} · {scoreLabel(score)}
        </Text>
      </View>
      <View style={[styles.scoreChip, { backgroundColor: color }]}>
        <Text style={styles.scoreText}>{pct}</Text>
      </View>
    </TouchableOpacity>
  );
});

interface TerraceListProps {
  onSelect?: (item: ScoredTerrace) => void;
}

export function TerraceList({ onSelect }: TerraceListProps) {
  const ranked = useScoredTerraces();
  const clearSearch = useSearchStore((s) => s.clear);
  const clearAreas = useAreaStore((s) => s.clear);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  const handleResetFilters = useCallback(() => {
    clearSearch();
    clearAreas();
  }, [clearSearch, clearAreas]);

  /**
   * Scroll the list so the just-shown terrace sits at the top — so when
   * the user dismisses the detail sheet, the row + its score chip is the
   * first thing they see.
   *
   * Why we scroll on DISMISS (not on selection): the detail sheet is a
   * `BottomSheetModal` which becomes Gorhom's active scrollable while it's
   * presented. Programmatic scroll on the main sheet's FlatList during
   * that window silently no-ops (the gesture-handler tree has handed
   * control to the modal). We instead wait for `selectedId` to flip
   * back to null (= modal dismissed via onDismiss → clear()), at which
   * point the main sheet's FlatList is active again and scrollToOffset
   * lands cleanly. We remember the previous selection in a ref so we
   * know what to scroll to even after the store has been cleared.
   *
   * `prevSelectedRef` also keeps the row visually "selected" (cream tint)
   * after dismiss, until another row is tapped — so the user can
   * identify which terrace they were just looking at.
   */
  const prevSelectedRef = useRef<number | null>(null);
  const [stickySelectedId, setStickySelectedId] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;

    if (selectedId != null) {
      // Selection just happened (or changed) — remember it for the post-
      // dismiss scroll, and tint the corresponding row.
      setStickySelectedId(selectedId);
      return;
    }

    // selectedId went null → detail sheet dismissed. Scroll to the
    // remembered terrace.
    if (prev == null) return;
    const idx = ranked.findIndex((s) => s.terrace.id === prev);
    if (idx < 0) return;
    const offset = idx * (ROW_HEIGHT + StyleSheet.hairlineWidth);
    // 120ms defer: lets the modal-dismiss animation hand control back
    // to the main sheet before we issue the scroll command.
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset, animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [selectedId, ranked]);

  const renderItem = useCallback(
    ({ item, index }: { item: ScoredTerrace; index: number }) => (
      <Row
        rank={index + 1}
        item={item}
        isSelected={item.terrace.id === stickySelectedId}
        onPress={onSelect}
      />
    ),
    [onSelect, stickySelectedId],
  );

  // BottomSheetFlatList integrates with Gorhom's gesture system so the list
  // scrolls smoothly inside the sheet (FlashList isn't compatible with v5).
  // TouchableOpacity from `react-native-gesture-handler` is required inside
  // the sheet's gesture-handler tree — RN's Pressable doesn't respond to taps
  // when nested under Gorhom because the pan handler swallows them.
  //
  // The TimeRangePicker + NeighborhoodFilter ride as a sticky header so they
  // stay pinned at the top while the list scrolls below.
  return (
    <BottomSheetFlatList
      ref={listRef}
      data={ranked}
      keyExtractor={(item) => String(item.terrace.id)}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.header}>
          {/*
            Header order matters — the bottom-sheet peek snap cuts at
            ~260px, so anything above that line is visible without
            expanding the sheet. Keep the *decision* tools above the
            cut (date / time presets / hourly weather) and the *fine-
            tune / refine* tools below it (sliders / search / filters).
          */}
          <DatePicker />
          <TimeRangeQuickPicker />
          <WeatherStrip />
          <TimeRangeFineTune />
          <SearchBox />
          <NeighborhoodFilter />
          <VenueTypeFilter />
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No terraces match</Text>
          <Text style={styles.emptyBody}>
            Try a different search, fewer neighborhoods, or a wider time range.
          </Text>
          <TouchableOpacity onPress={handleResetFilters} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      }
      stickyHeaderIndices={[0]}
      // 378 rows × ~70px = comfortably fast as a windowed FlatList; no need
      // for heroics with FlashList until the dataset grows past ~2k.
      windowSize={5}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    backgroundColor: palette.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowSelected: {
    backgroundColor: palette.cream,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.mist,
    marginHorizontal: spacing.lg,
  },
  rank: {
    width: 28,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: palette.mistDeep,
    textAlign: 'right',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  scoreChip: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  scoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.ink,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: fontSizes.md * 1.4,
  },
  emptyButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  emptyButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.white,
  },
});
