/**
 * Horizontal chip row of venue filters.
 *
 * Bar / Restaurant chips: multi-select with OR semantics (selecting
 * both shows the union). Empty = no category filter.
 *
 * ⚽ Outdoor Screen chip: standalone toggle, ANDs with the others.
 * Shows only terraces with `outdoorScreens > 0` — designed for the
 * World Cup 2026 launch ("watch the match in the sun"). Football
 * icon hooks the World Cup framing, while the label describes the
 * literal feature ("outdoor screen") so it's still useful outside
 * tournament season. Visually emphasised with a different active
 * colour (palette.burnt) so it doesn't look like just another
 * venue type.
 */

import { ScrollView, StyleSheet, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import {
  CATEGORIES_ORDERED,
  CATEGORY_GLYPHS,
  CATEGORY_LABELS,
} from '@/src/data/categories';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function VenueTypeFilter() {
  const selectedCategories = useAreaStore((s) => s.selectedCategories);
  const toggleCategory = useAreaStore((s) => s.toggleCategory);
  const matchModeOnly = useAreaStore((s) => s.matchModeOnly);
  const toggleMatchModeOnly = useAreaStore((s) => s.toggleMatchModeOnly);

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
            onPress={() => {
              haptics.selection();
              toggleCategory(cat);
            }}
            activeOpacity={0.7}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {CATEGORY_GLYPHS[cat]} {CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => {
          haptics.selection();
          toggleMatchModeOnly();
        }}
        activeOpacity={0.7}
        style={[styles.chip, matchModeOnly && styles.chipMatchActive]}
        accessibilityLabel="Show only terraces with outdoor screens"
      >
        <Text style={[styles.chipLabel, matchModeOnly && styles.chipLabelActive]}>
          ⚽ Outdoor Screen
        </Text>
      </TouchableOpacity>
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
  // Distinct active colour for the match-mode chip so it reads as a
  // mode/feature toggle rather than just another venue category.
  chipMatchActive: {
    backgroundColor: palette.burnt,
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
