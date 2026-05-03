/**
 * Horizontal chip row of Amsterdam's 6 macro-regions. Tap to toggle.
 *
 * Empty selection = "All" (no filter). The "All" chip clears the selection.
 * Multi-select feels right here — users plan to wander "around Jordaan and
 * De Pijp" rather than committing to one area.
 *
 * The 6 regions roll up the dataset's 27 fine-grained `area` names; the
 * mapping lives in `src/data/regions.ts`.
 */

import { ScrollView, StyleSheet, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { REGIONS_ORDERED } from '@/src/data/regions';
import { useAreaStore } from '@/src/store/areaStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function NeighborhoodFilter() {
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
  const toggle = useAreaStore((s) => s.toggle);
  const clear = useAreaStore((s) => s.clear);

  const allActive = selectedRegions.size === 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <TouchableOpacity
        onPress={clear}
        activeOpacity={0.7}
        style={[styles.chip, allActive && styles.chipActive]}
      >
        <Text style={[styles.chipLabel, allActive && styles.chipLabelActive]}>All</Text>
      </TouchableOpacity>
      {REGIONS_ORDERED.map((region) => {
        const active = selectedRegions.has(region);
        return (
          <TouchableOpacity
            key={region}
            onPress={() => toggle(region)}
            activeOpacity={0.7}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {region}
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
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.sandDeep,
  },
  chipActive: {
    backgroundColor: palette.ink,
  },
  chipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  chipLabelActive: {
    color: palette.white,
  },
});
