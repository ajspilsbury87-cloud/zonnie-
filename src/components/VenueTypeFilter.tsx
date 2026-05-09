/**
 * Horizontal chip row of venue filters.
 *
 * Bar / Restaurant / Coffee chips: multi-select with OR semantics
 * (selecting Bar+Restaurant shows the union). Empty = no category
 * filter.
 *
 * Coffee-only auto-shifts the visiting time window to morning
 * (09:00–12:00) when the user is currently looking at an afternoon
 * window — coffee shops live morning-to-late-afternoon, and the
 * default "now → +2h" range unfairly demotes them when the user
 * opens the app at 16:00. Only fires when the toggle results in
 * coffee being the SOLE active category, so a Bar+Coffee multi-
 * select doesn't drag the time around. We never shift back when
 * the user un-toggles coffee — preserves any manual time edits.
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
import { formatInTimeZone } from 'date-fns-tz';

import {
  CATEGORIES_ORDERED,
  CATEGORY_GLYPHS,
  CATEGORY_LABELS,
  type VenueCategory,
} from '@/src/data/categories';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

/** Coffee-shop visit window — wide enough to cover morning + late-morning. */
const COFFEE_FROM_HOUR = 9;
const COFFEE_TO_HOUR = 12;

/** Below this hour (Amsterdam local time) we don't auto-shift — the
 *  user's existing morning window is already coffee-friendly. */
const COFFEE_AUTO_SHIFT_THRESHOLD = 12;

export function VenueTypeFilter() {
  const selectedCategories = useAreaStore((s) => s.selectedCategories);
  const toggleCategory = useAreaStore((s) => s.toggleCategory);
  const matchModeOnly = useAreaStore((s) => s.matchModeOnly);
  const toggleMatchModeOnly = useAreaStore((s) => s.toggleMatchModeOnly);

  const handleToggleCategory = (cat: VenueCategory) => {
    haptics.selection();
    toggleCategory(cat);

    // Coffee-only auto-shift: predict the post-toggle state to decide
    // whether this tap *just made coffee the only active category*.
    // Toggling coffee on (when nothing else is selected) → shift.
    // Toggling on a 2nd category → no shift. Toggling coffee off → no
    // shift. This runs from the chip onPress (not a store subscriber)
    // so we don't trample the user's manual time picks on every store
    // change.
    if (cat !== 'coffee') return;
    const willBeActive = !selectedCategories.has('coffee');
    const otherSelected = Array.from(selectedCategories).some((c) => c !== 'coffee');
    if (!willBeActive || otherSelected) return;

    const nowHour = parseInt(
      formatInTimeZone(new Date(), AMSTERDAM_TZ, 'HH'),
      10,
    );
    if (nowHour >= COFFEE_AUTO_SHIFT_THRESHOLD) {
      useTimeStore.getState().setRange(COFFEE_FROM_HOUR, COFFEE_TO_HOUR);
    }
  };

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
            onPress={() => handleToggleCategory(cat)}
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
