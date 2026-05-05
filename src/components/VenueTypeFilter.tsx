/**
 * Horizontal chip row of venue types: Café / Bar / Restaurant / Outdoor.
 *
 * Multi-select, OR semantics — selecting "Café" + "Outdoor" shows
 * cafés AND outdoor venues (union, not intersection). Empty selection
 * = no category filter.
 *
 * Categorisation is heuristic — see `src/data/categories.ts`. About 5%
 * of terraces match no category and only appear when the filter row
 * is empty.
 */

import { ScrollView, StyleSheet, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import {
  CATEGORIES_ORDERED,
  CATEGORY_GLYPHS,
  CATEGORY_LABELS,
} from '@/src/data/categories';
import { useAreaStore } from '@/src/store/areaStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function VenueTypeFilter() {
  const selectedCategories = useAreaStore((s) => s.selectedCategories);
  const toggleCategory = useAreaStore((s) => s.toggleCategory);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {CATEGORIES_ORDERED.map((cat) => {
        const active = selectedCategories.has(cat);
        return (
          <TouchableOpacity
            key={cat}
            onPress={() => toggleCategory(cat)}
            activeOpacity={0.7}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {CATEGORY_GLYPHS[cat]} {CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
  },
  chipActive: {
    backgroundColor: palette.peach,
  },
  chipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  chipLabelActive: {
    color: palette.cream,
  },
});
