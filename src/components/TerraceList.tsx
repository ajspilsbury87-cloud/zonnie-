import { memo, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { DatePicker } from '@/src/components/DatePicker';
import { NeighborhoodFilter } from '@/src/components/NeighborhoodFilter';
import { SearchBox } from '@/src/components/SearchBox';
import { TimeRangeScrubber } from '@/src/components/TimeRangeScrubber';
import { VenueTypeFilter } from '@/src/components/VenueTypeFilter';
import { WeatherStrip } from '@/src/components/WeatherStrip';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { scoreLabel } from '@/src/engines/scoring';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';

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
      onPress={() => onPress?.(item)}
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
   * When a terrace is selected (via map marker tap, "Show on Map", or
   * any other path), scroll the list so it sits at the top — this way
   * when the user dismisses the detail sheet, the selected terrace is
   * the first thing they see in the list along with its score chip.
   * Skips when no selection (clear) so the list doesn't reset to top
   * unexpectedly.
   */
  useEffect(() => {
    if (selectedId == null) return;
    const idx = ranked.findIndex((s) => s.terrace.id === selectedId);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({
      index: idx,
      viewPosition: 0,
      animated: true,
    });
  }, [selectedId, ranked]);

  const renderItem = useCallback(
    ({ item, index }: { item: ScoredTerrace; index: number }) => (
      <Row
        rank={index + 1}
        item={item}
        isSelected={item.terrace.id === selectedId}
        onPress={onSelect}
      />
    ),
    [onSelect, selectedId],
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
      // scrollToIndex on a long list with not-yet-rendered rows requires
      // an estimate; getItemLayout removes the need to scroll-then-wait.
      // Approximate row height: 70px + hairline separator. Add a header
      // offset so scrollToIndex(0) doesn't underlap the sticky header.
      onScrollToIndexFailed={(info) => {
        const offset = info.averageItemLength * info.index;
        listRef.current?.scrollToOffset({ offset, animated: true });
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <DatePicker />
          <TimeRangeScrubber />
          <WeatherStrip />
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
