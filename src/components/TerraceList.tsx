import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';

import { useShortlistStore } from '@/src/store/shortlistStore';
import { usePurchaseStore, FEATURES_UNLOCKED } from '@/src/store/purchaseStore';
import { useProPaywallStore } from '@/src/components/ProPaywall';

import { DatePicker } from '@/src/components/DatePicker';
import { SearchBox } from '@/src/components/SearchBox';
import { WeatherStrip } from '@/src/components/WeatherStrip';
import { TimeRangeQuickPicker } from '@/src/components/TimeRangeScrubber';
import { useScoredTerraces, type ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useUserLocation } from '@/src/hooks/useUserLocation';
import { AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ, scoreLabel } from '@/src/engines/scoring';
import { isGreyWindow, nextSunnyHour } from '@/src/engines/sadPath';
import { sunsetHour } from '@/src/engines/solar';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { haptics } from '@/src/lib/haptics';
import { useHint } from '@/src/onboarding/useHint';
import { useStrings } from '@/src/i18n/useStrings';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import { useSelectionStore } from '@/src/store/selectionStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';

// LayoutAnimation needs an explicit opt-in on Android's old architecture;
// harmless no-op elsewhere.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  /** True while the group-vote shortlist picker is active. */
  isSelectingShortlist?: boolean;
  /** True if this specific row is in the shortlist. */
  isShortlisted?: boolean;
  /** Called when the user long-presses to enter shortlist mode. */
  onLongPress?: (item: ScoredTerrace) => void;
}

const Row = memo(function Row({
  rank,
  item,
  isSelected,
  onPress,
  showDistance,
  isSelectingShortlist,
  isShortlisted,
  onLongPress,
}: RowProps) {
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
        if (isSelectingShortlist) {
          // In shortlist mode, taps toggle selection rather than opening the detail sheet.
          onLongPress?.(item);
        } else {
          onPress?.(item);
        }
      }}
      onLongPress={() => {
        haptics.medium();
        onLongPress?.(item);
      }}
      activeOpacity={0.6}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      {/* In shortlist mode, replace rank number with a checkbox. */}
      {isSelectingShortlist ? (
        <View style={[styles.checkbox, isShortlisted && styles.checkboxChecked]}>
          {isShortlisted ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
      ) : (
        <Text style={styles.rank}>{rank}</Text>
      )}
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
  const t = useStrings();
  const isPro = usePurchaseStore((s) => s.isPro);
  const showPaywall = useProPaywallStore((s) => s.show);

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

  // Shortlist ("Terras?") state — multi-select for group vote.
  const shortlistIds = useShortlistStore((s) => s.selectedIds);
  const isSelectingShortlist = useShortlistStore((s) => s.isSelecting);
  const toggleShortlist = useShortlistStore((s) => s.toggle);
  const enterSelectingShortlist = useShortlistStore((s) => s.enterSelecting);
  // Memoised so renderItem's dependency array is stable — avoids re-rendering
  // every row on every unrelated state update.
  const shortlistSet = useMemo(() => new Set(shortlistIds), [shortlistIds]);

  // Onboarding hints — retain the 'filters' hint call so its sequential
  // chain logic in useHint continues ticking (it gates other hints that
  // depend on 'pin-tap' being seen first). The hint no longer renders
  // anything now that the "More filters" toggle is gone; side-effects only.
  useHint('filters', { after: 'pin-tap' });

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
        title: t.noMatchModeTerraces,
        body: t.noMatchModeHint,
      };
    }
    if (favoritesOnly) {
      return {
        title: t.noFavourites,
        body: t.noFavouritesHint,
      };
    }
    if (query.trim().length > 0) {
      return {
        title: t.noResults,
        body: t.noResultsQuery(query.trim()),
      };
    }
    return {
      title: t.noTerraces,
      body: t.noTerracesHint,
    };
  })();

  const handleResetFilters = useCallback(() => {
    haptics.selection();
    clearSearch();
    clearAreas();
  }, [clearSearch, clearAreas]);

  // ── Grey-window banner ─────────────────────────────────────────────────
  // When every result in the window is dismal (grey day / late window), a
  // silent ranking of near-zero scores reads as broken. Say so honestly and
  // offer the one useful action: jump the window to when the sun is back.
  // Weather-only check (O(hours)) — never re-scores terraces on this path.
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const toHour = useTimeStore((s) => s.toHour);
  const setRange = useTimeStore((s) => s.setRange);
  const weatherByDate = useWeatherStore((s) => s.byDate);
  const greyBanner = useMemo(() => {
    if (!isGreyWindow(ranked[0]?.score, ranked.length)) return null;
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourly = entry?.status === 'ready' ? entry.data : undefined;
    const sunset = sunsetHour(dateStr, AMSTERDAM_LAT, AMSTERDAM_LNG, AMSTERDAM_TZ);
    const backAt = nextSunnyHour(hourly, toHour, sunset);
    return backAt != null
      ? { text: t.greyWindowReturn(backAt), jumpHour: backAt, sunset }
      : { text: t.greyWindowNoMore, jumpHour: null, sunset };
  }, [ranked, dateOffset, toHour, weatherByDate, t]);

  const handleJumpToSun = useCallback(
    (h: number, sunset: number) => {
      haptics.light();
      setRange(h, Math.max(h + 1, Math.min(h + 2, Math.floor(sunset))));
    },
    [setRange],
  );

  // ── Re-rank animation ──────────────────────────────────────────────────
  // The core magic trick is watching the ranking respond to time. When the
  // order of the top rows changes (scrub, preset tap, filter), schedule a
  // single layout animation for the commit that moves them — rows then
  // glide to their new positions instead of teleporting. Render-body ref
  // compare is the standard LayoutAnimation pattern: configureNext must run
  // BEFORE the commit, so an effect would be too late. One native-driven
  // animation per order change; nothing runs per-frame on the JS thread.
  const orderSig = useMemo(
    () => ranked.slice(0, 15).map((s) => s.terrace.id).join(','),
    [ranked],
  );
  const prevOrderSigRef = useRef<string | null>(null);
  if (prevOrderSigRef.current !== orderSig) {
    if (prevOrderSigRef.current != null && ranked.length > 0) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    prevOrderSigRef.current = orderSig;
  }

  /**
   * Long-press (or in-selection tap) handler for a terrace row.
   * First long-press enters selection mode AND selects that terrace.
   * Subsequent taps inside selection mode toggle the terrace.
   */
  const handleLongPress = useCallback(
    (item: ScoredTerrace) => {
      if (!isSelectingShortlist) {
        enterSelectingShortlist();
      }
      toggleShortlist(item.terrace.id);
      haptics.selection();
    },
    [isSelectingShortlist, enterSelectingShortlist, toggleShortlist],
  );

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
        isSelectingShortlist={isSelectingShortlist}
        isShortlisted={shortlistSet.has(item.terrace.id)}
        onLongPress={handleLongPress}
      />
    ),
    [onSelect, stickySelectedId, sortByDistance, coord, isSelectingShortlist, shortlistSet, handleLongPress],
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
    <View style={styles.container}>
      <BottomSheetFlatList
        ref={listRef}
        data={ranked}
        keyExtractor={(item) => String(item.terrace.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[
          styles.listContent,
          // Push the last rows up when the floating bar is showing, so
          // they aren't hidden behind it.
          isSelectingShortlist && styles.listContentWithBar,
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Pro entry pill — hidden while FEATURES_UNLOCKED=true (all users
                have Pro; no buy flow to show). Re-enable by setting
                FEATURES_UNLOCKED=false in purchaseStore.ts. */}
            {!FEATURES_UNLOCKED ? (
              <TouchableOpacity
                onPress={() => { haptics.light(); showPaywall(); }}
                activeOpacity={0.7}
                style={styles.proEntryPill}
                accessibilityRole="button"
                accessibilityLabel={isPro ? t.proEntryActive : t.proEntryButton}
              >
                <Text style={styles.proEntryText}>
                  {isPro ? t.proEntryActive : t.proEntryButton}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Search — pinned at the top of the header so it's easy to find
                and, crucially, sits above the keyboard when focused. */}
            <SearchBox />

            {/* Date + weather + time. Venue / area filters live in FilterChips
                (the floating chip row over the map); the WHEN controls stay
                here with the day + weather, which they belong with. */}
            <DatePicker />
            <WeatherStrip />
            {/* Morning / Afternoon / Evening preset buttons, next to the date
                so the quick time presets are one tap away. (The fine-tune hour
                scrubber was removed per feedback — presets only.) */}
            <TimeRangeQuickPicker />

            {/* Grey-window banner — honest sad path with a one-tap fix. */}
            {greyBanner != null ? (
              <View style={styles.greyBanner}>
                <Text style={styles.greyBannerText}>{greyBanner.text}</Text>
                {greyBanner.jumpHour != null ? (
                  <TouchableOpacity
                    onPress={() => handleJumpToSun(greyBanner.jumpHour, greyBanner.sunset)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.greyWindowJump(greyBanner.jumpHour)}
                  >
                    <Text style={styles.greyBannerBtnText}>
                      {t.greyWindowJump(greyBanner.jumpHour)}
                    </Text>
                  </TouchableOpacity>
                ) : null}
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
        // Header scrolls with the list so users can scroll past the filters
        // to see more terraces. stickyHeaderIndices removed intentionally.
        // 378 rows × ~70px = comfortably fast as a windowed FlatList; no need
        // for heroics with FlashList until the dataset grows past ~2k.
        windowSize={5}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        // Dragging the list dismisses the search keyboard so the full set of
        // filtered results is reachable (previously the keyboard blocked the
        // bottom of the list). `handled` keeps row taps working while it's up.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />
    </View>
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
  // Grey-window banner — warm but muted; informational, not alarming.
  greyBanner: {
    backgroundColor: palette.sandDeep,
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.mistDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  greyBannerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  greyBannerBtnText: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.burnt,
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
  // Pro entry pill — sits at the very top of the header, always visible
  // at the default peek snap. Brand-coloured but deliberately compact so
  // it reads as a feature badge rather than a promotional banner.
  // right-aligned within a row so it doesn't crowd the left edge.
  proEntryPill: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    marginRight: spacing.lg,
    marginBottom: spacing.xs,
    backgroundColor: palette.burnt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  proEntryText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.cream,
    letterSpacing: 0.3,
  },

  container: {
    flex: 1,
  },
  // Extra bottom padding to prevent the screen-level ShortlistBar overlay
  // from covering the last rows when shortlist selection mode is active.
  listContentWithBar: {
    paddingBottom: 80,
  },
  // Checkbox shown in the rank column during shortlist selection mode.
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: palette.burnt,
    borderColor: palette.burnt,
  },
  checkboxTick: {
    color: palette.white,
    fontSize: fontSizes.sm,
    fontFamily: fonts.bodySemibold,
  },

});
