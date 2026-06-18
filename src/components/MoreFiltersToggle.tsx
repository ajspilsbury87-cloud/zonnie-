/**
 * Collapsible-filters toggle row. Sits inside the TerraceList header.
 *
 * Two responsibilities:
 *   1. Toggle the expanded state — tap the "More filters / Meer filters"
 *      button to show or hide the refine controls.
 *   2. Surface a compact summary of which refine filters are active,
 *      so the user can see what's applied without expanding. Each chip
 *      is independently tappable to clear that filter.
 *
 * Language switching has moved to the Home screen (LandingPage) — tap
 * the ⚙ cog in the top-right corner of the Home overlay.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
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
  const t = useStrings();

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
        {/* Active-filter summary chips */}
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
                accessibilityLabel={t.clearSearchA11y(trimmedQuery)}
              >
                <Text style={styles.summaryChipText}>
                  {t.clearSearch(trimmedQuery)}
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
                accessibilityLabel={t.removeRegionA11y(region)}
              >
                <Text style={styles.summaryChipText}>
                  {t.removeRegion(region)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.summaryPlaceholder} />
        )}

        {/* Meer filters / More filters toggle — right side */}
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            onToggle();
          }}
          activeOpacity={0.6}
          style={styles.toggleButton}
          accessibilityLabel={expanded ? t.hideFilters : t.showFilters}
          accessibilityState={{ expanded }}
          hitSlop={8}
        >
          <Text style={styles.toggleLabel}>
            {t.moreFilters} {expanded ? '▴' : '▾'}
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
