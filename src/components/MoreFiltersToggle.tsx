/**
 * Collapsible-filters toggle row. Sits inside the TerraceList header
 * between the always-visible decision tools (date / time preset /
 * weather / venue type chips) and the hidden-by-default refine tools
 * (time sliders / search / neighborhood chips).
 *
 * Two responsibilities:
 *
 *   1. Toggle the expanded state — tap anywhere on the row to show or
 *      hide the refine controls.
 *   2. Surface a compact summary of which refine filters are
 *      currently active, so the user can see what's applied without
 *      expanding. Each summary chip is independently tappable: tap a
 *      chip to clear that one filter without affecting the others.
 *
 * Active filters surfaced here:
 *   - Search query (non-empty)
 *   - Selected regions (each as its own chip)
 *
 * Time fine-tune is NOT shown — the time-window is also visible in
 * the always-on TimeRangeQuickPicker / WeatherStrip above, so adding
 * it here would duplicate the signal.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useSearchStore } from '@/src/store/searchStore';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  spacing,
} from '@/src/theme/tokens';

interface MoreFiltersToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MoreFiltersToggle({ expanded, onToggle }: MoreFiltersToggleProps) {
  const query = useSearchStore((s) => s.query);
  const clearQuery = useSearchStore((s) => s.clear);
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
  const toggleRegion = useAreaStore((s) => s.toggle);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const regionsList = Array.from(selectedRegions);
  const hasRegions = regionsList.length > 0;
  const anyActive = hasQuery || hasRegions;

  return (
    <View style={styles.root}>
      <View style={styles.divider} />
      <View style={styles.row}>
        {/* Active-filter summary — scrolls horizontally if many regions
            are selected. Tapping a chip clears just that filter. */}
        {anyActive ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.summaryRow}
          >
            {hasQuery ? (
              <TouchableOpacity
                onPress={() => {
                  haptics.selection();
                  clearQuery();
                }}
                activeOpacity={0.6}
                style={styles.summaryChip}
                accessibilityLabel={`Clear search "${trimmedQuery}"`}
              >
                <Text style={styles.summaryChipText}>
                  🔍 “{trimmedQuery}” ✕
                </Text>
              </TouchableOpacity>
            ) : null}
            {regionsList.map((region) => (
              <TouchableOpacity
                key={region}
                onPress={() => {
                  haptics.selection();
                  toggleRegion(region);
                }}
                activeOpacity={0.6}
                style={styles.summaryChip}
                accessibilityLabel={`Remove ${region} filter`}
              >
                <Text style={styles.summaryChipText}>📍 {region} ✕</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.summaryPlaceholder} />
        )}

        {/* The toggle itself — always at the right. */}
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            onToggle();
          }}
          activeOpacity={0.6}
          style={styles.toggleButton}
          accessibilityLabel={
            expanded ? 'Hide more filters' : 'Show more filters'
          }
          accessibilityState={{ expanded }}
          hitSlop={8}
        >
          <Text style={styles.toggleLabel}>
            More filters {expanded ? '▴' : '▾'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: palette.white,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.mist,
    marginHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  summaryPlaceholder: {
    // Spacer so the toggle stays right-aligned when there are no
    // active filters to show. flex:1 pushes the toggle to the edge.
    flex: 1,
  },
  summaryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.cream,
  },
  summaryChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: palette.ink,
  },
  toggleButton: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.ink,
    letterSpacing: 0.2,
  },
});
