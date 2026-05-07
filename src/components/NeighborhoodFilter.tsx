/**
 * Horizontal chip row of Amsterdam's 6 macro-regions + a Favorites toggle.
 *
 * - "All" chip clears region filters.
 * - "♥ Favorites" toggles `favoritesOnly` on the area store; when active,
 *   only the user's saved terraces appear in the list and on the map.
 * - 6 region chips toggle multi-select region filtering.
 *
 * Empty region selection + favoritesOnly off = show everything.
 */

import { ScrollView, StyleSheet, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { REGIONS_ORDERED } from '@/src/data/regions';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function NeighborhoodFilter() {
  const selectedRegions = useAreaStore((s) => s.selectedRegions);
  const favoritesOnly = useAreaStore((s) => s.favoritesOnly);
  const toggleFavoritesOnly = useAreaStore((s) => s.toggleFavoritesOnly);
  const toggle = useAreaStore((s) => s.toggle);
  const clear = useAreaStore((s) => s.clear);
  const favoriteCount = useFavoritesStore((s) => s.favoriteIds.size);

  const allActive = selectedRegions.size === 0 && !favoritesOnly;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <TouchableOpacity
        onPress={() => {
          haptics.selection();
          clear();
        }}
        activeOpacity={0.7}
        style={[styles.chip, allActive && styles.chipActive]}
      >
        <Text style={[styles.chipLabel, allActive && styles.chipLabelActive]}>All</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          haptics.selection();
          toggleFavoritesOnly();
        }}
        activeOpacity={0.7}
        style={[
          styles.chip,
          favoritesOnly && styles.chipActiveAccent,
          favoriteCount === 0 && styles.chipDimmed,
        ]}
        disabled={favoriteCount === 0}
      >
        <Text
          style={[
            styles.chipLabel,
            favoritesOnly && styles.chipLabelActive,
            favoriteCount === 0 && styles.chipLabelDimmed,
          ]}
        >
          {favoriteCount > 0 ? `♥ ${favoriteCount}` : '♡ Saved'}
        </Text>
      </TouchableOpacity>
      {REGIONS_ORDERED.map((region) => {
        const active = selectedRegions.has(region);
        return (
          <TouchableOpacity
            key={region}
            onPress={() => {
              haptics.selection();
              toggle(region);
            }}
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
  chipActiveAccent: {
    backgroundColor: palette.burnt,
  },
  chipDimmed: {
    opacity: 0.5,
  },
  chipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  chipLabelActive: {
    color: palette.white,
  },
  chipLabelDimmed: {
    fontStyle: 'italic',
  },
});
