import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { DatePicker } from '@/src/components/DatePicker';
import { MoreFiltersToggle } from '@/src/components/MoreFiltersToggle';
import { NeighborhoodFilter } from '@/src/components/NeighborhoodFilter';
import { SearchBox } from '@/src/components/SearchBox';
import {
  TimeRangeFineTune,
  TimeRangeQuickPicker,
} from '@/src/components/TimeRangeScrubber';
import { VenueTypeFilter } from '@/src/components/VenueTypeFilter';
import { WeatherStrip } from '@/src/components/WeatherStrip';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { scoreLabel } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { HintBubble } from '@/src/onboarding/HintBubble';
import { useHint } from '@/src/onboarding/useHint';
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
  showDistance?: boolean;
}

const Row = memo(function Row({ rank, item, isSelected, onPress, showDistance }: RowProps) {
  const { terrace, score, distanceM } = item;
  const pct = Math.round(score * 100);
  const color = scoreToColor(score);

  const distLabel = showDistance && distanceM != null
    ? distanceM < 1000
      ? `${Math.round(distanceM)} m`
      : `${(distanceM / 1000).toFixed(1)} km`
    : null;
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
        {/* Neighborhood lead — pin glyph + area is what users actually
            scan for ("where in town is this?"). Score label + facing
            were too noisy for the row; the score chip on the right
            already conveys the sun band. */}
        <Text style={styles.subtitle} numberOfLines={1}>
          {distLabel ? `📍 ${distLabel} · ` : '📍 '}{terrace.area} · {scoreLabel(score)}
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
  // Get user location — used for "Near me" sort mode. The hook asks for
  // foreground permission once, resolves a single low-accuracy fix, and
  // never subscribes. Returns null if denied or unavailable; the sort
  // falls back to pure sun-score order silently.
  const { coord } = useUserLocation();
  const ranked = useScoredTerraces(coord);
  const clearSearch = useSearchStore((s) => s.clear);
  const clearAreas = useAreaStore((s) => s.clear);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  // Secondary filter section (time sliders / search / neighborhood
  // chips) is hidden by default to give the terrace list more screen
  // space. Tap the "More filters" toggle row to expand. The
  // always-visible row above (date / time presets / weather / venue
  // type chips) covers the highest-traffic interactions; refine
  // controls are an opt-in.
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const toggleFiltersExpanded = useCallback(
    () => setFiltersExpanded((x) => !x),
    [],
  );

  // Onboarding hints — show sequentially so they don't pile up.
  // pin-tap fires first (on the map). Once dismissed, the filters
  // hint appears on the More-filters toggle to nudge discovery of
  // the refine controls. The previous "time-scrubber" hint has been
  // dropped now that the slider lives behind the toggle — the intro
  // carousel already covers "plan ahead" via the QuickPicker presets.
  const [showFilterHint, dismissFilterHint] = useHint('filters', { after: 'pin-tap' });

  // Context-aware empty-state messaging — the user has hit "no results"
  // for a different reason depending on which filter is active. A
  // generic "no terraces match" doesn't tell them *which* filter to
  // loosen. Order matches: most-specific first (match mode is the
  // narrowest), so we surface the most likely-to-be-the-cause filter.
  const matchModeOnly = useAreaStore((s) => s.matchModeOnly);
  const favoritesOnly = useAreaStore((s) => s.favoritesOnly);
  const sortByDistance = useAreaStore((s) => s.sortByDistance);
  const query = useSearchStore((s) => s.query);
  const emptyState = (() => {
    if (matchModeOnly) {
      return {
        title: 'No outdoor-TV terraces match',
        body: 'Tap 📺 Match again to clear, or widen your other filters.',
      };
    }
    if (favoritesOnly) {
      return {
        title: 'No favourites yet',
        body: 'Tap the ♡ on a terrace detail to save it for later.',
      };
    }
    if (query.trim().length > 0) {
      return {
        title: 'No matches',
        body: `Nothing in the dataset matches "${query.trim()}".`,
      };
    }
    return {
      title: 'No terraces match',
      body: 'Try a different search, fewer neighbourhoods, or a wider time range.',
    };
  })();

  const handleResetFilters = useCallback(() => {
    haptics.selection();
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
        showDistance={sortByDistance && coord != null}
      />
    ),
    [onSelect, stickySelectedId, sortByDistance, coord],
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
            Two-tier header layout (v1.1 polish):
              Tier 1 — ALWAYS VISIBLE. Decision tools the average user
                       needs every time: which day, which time window,
                       what's the weather, which venue type.
              Tier 2 — COLLAPSED BEHIND TOGGLE. Refine tools used less
                       often: time fine-tune sliders, free-text search,
                       neighborhood multi-select.
            User feedback was the all-expanded layout crowded the list
            out — Tier 2 hidden by default reclaims ~190px for terraces.
          */}
          <DatePicker />
          <WeatherStrip />
          <TimeRangeQuickPicker />
          <VenueTypeFilter />
          <MoreFiltersToggle
            expanded={filtersExpanded}
            onToggle={toggleFiltersExpanded}
          />
          {showFilterHint && !filtersExpanded ? (
            <HintBubble onDismiss={dismissFilterHint} style={styles.inlineHint}>
              ⛛ Tap to refine by area or name
            </HintBubble>
          ) : null}
          {filtersExpanded ? (
            <View style={styles.refinePanel}>
              <TimeRangeFineTune />
              <SearchBox />
              <NeighborhoodFilter />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyState.title}</Text>
          <Text style={styles.emptyBody}>{emptyState.body}</Text>
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
  // Inline hint placement: override HintBubble's default `absolute`
  // positioning so the bubble flows with the list header rather than
  // floating over it.
  inlineHint: {
    position: 'relative',
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  // Container for the collapsed-by-default refine controls. Plain
  // wrapper — visual divider lives inside MoreFiltersToggle above it.
  refinePanel: {
    backgroundColor: palette.white,
    paddingBottom: spacing.sm,
  },
});
