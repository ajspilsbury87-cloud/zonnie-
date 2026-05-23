/**
 * Venue + mode filter — WHAT card.
 *
 * Visually matches the WHEN card in TimeRangeQuickPicker:
 *   - Same sandDeep card background, radii.lg corners
 *   - Same paddingHorizontal: spacing.lg on the outer wrapper (aligns card edges)
 *   - Same white chip background, radii.md chips, height 36, burnt active
 *   - Row 1: Bar / Restaurant / Coffee — flex:1 equal-width
 *   - Row 2: Outdoor Screen / Near me — natural-width, same height
 */

import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { formatInTimeZone } from 'date-fns-tz';

import {
  CATEGORIES_ORDERED,
  CATEGORY_GLYPHS,
  CATEGORY_LABELS,
  type VenueCategory,
} from '@/src/data/categories';
import { useChipWidth } from '@/src/components/TimeRangeScrubber';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const COFFEE_FROM_HOUR = 9;
const COFFEE_TO_HOUR = 12;
const COFFEE_AUTO_SHIFT_THRESHOLD = 12;

const CHIP_H = 36;

export function VenueTypeFilter() {
  const selectedCategories   = useAreaStore((s) => s.selectedCategories);
  const toggleCategory       = useAreaStore((s) => s.toggleCategory);
  const matchModeOnly        = useAreaStore((s) => s.matchModeOnly);
  const toggleMatchModeOnly  = useAreaStore((s) => s.toggleMatchModeOnly);
  const sortByDistance       = useAreaStore((s) => s.sortByDistance);
  const toggleSortByDistance = useAreaStore((s) => s.toggleSortByDistance);
  const chipWidth            = useChipWidth();

  const handleToggleCategory = (cat: VenueCategory) => {
    haptics.selection();
    toggleCategory(cat);

    if (cat !== 'coffee') return;
    const willBeActive  = !selectedCategories.has('coffee');
    const otherSelected = Array.from(selectedCategories).some((c) => c !== 'coffee');
    if (!willBeActive || otherSelected) return;

    const nowHour = parseInt(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'HH'), 10);
    if (nowHour >= COFFEE_AUTO_SHIFT_THRESHOLD) {
      useTimeStore.getState().setRange(COFFEE_FROM_HOUR, COFFEE_TO_HOUR);
    }
  };

  return (
    <View style={styles.outerPad}>
      <View style={styles.card}>
        {/* Card label */}
        <Text style={styles.cardLabel}>WAT</Text>

        {/* Row 1: Bar / Restaurant / Coffee — same fixed width as WHEN chips */}
        <View style={styles.chipRow}>
          {CATEGORIES_ORDERED.map((cat) => {
            const active = selectedCategories.has(cat);
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => handleToggleCategory(cat)}
                activeOpacity={0.7}
                style={[styles.chip, { width: chipWidth }, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {CATEGORY_GLYPHS[cat]} {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Row 2: same fixed pixel width as Row 1, so all chips
            across the card are identical. With only 2 chips in this
            row, ~92pt of empty space sits on the right.
            Label "⚽ Outdoor Screen" → "⚽ Outdoor" — 14 chars don't
            fit a 109pt slot; the football glyph carries the "sports
            outside" meaning. */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => { haptics.selection(); toggleMatchModeOnly(); }}
            activeOpacity={0.7}
            style={[styles.modeChip, { width: chipWidth }, matchModeOnly && styles.modeChipMatch]}
            accessibilityLabel="Toon alleen terrassen met buitenschermen"
          >
            <Text
              style={[styles.chipText, matchModeOnly && styles.chipTextActive]}
              numberOfLines={1}
            >
              ⚽ Buiten
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.selection(); toggleSortByDistance(); }}
            activeOpacity={0.7}
            style={[styles.modeChip, { width: chipWidth }, sortByDistance && styles.modeChipNearMe]}
            accessibilityLabel="Sorteer op dichtstbijzijnde zonnige plek"
          >
            <Text
              style={[styles.chipText, sortByDistance && styles.chipTextActive]}
              numberOfLines={1}
            >
              📍 Dichtbij
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper — same paddingHorizontal as WHEN card so left/right edges align
  outerPad: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,   // small gap between WHEN card above
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: palette.sandDeep,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  cardLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.mistDeep,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  // ── Row 1: equal-width venue chips ────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    // Width injected inline via useChipWidth() — same pixel value
    // across both cards so chips are identical across rows.
    height: CHIP_H,
    paddingHorizontal: spacing.xs,        // breathing room for text
    borderRadius: radii.md,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Subtle depth so chips read as raised tiles, not flat colour
    // patches. Matches the WHEN card chips.
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: palette.burnt,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    textAlign: 'center',
  },
  chipTextActive: {
    color: palette.cream,
  },

  // ── Row 2: equal-width mode toggles ────────────────────────────────
  // Switched from natural-width (paddingHorizontal: md, flexShrink: 1)
  // to flex:1 to match Row 1's rhythm — pre-fix the "Outdoor Screen"
  // chip was visibly wider than "Near me", which read as messy.
  modeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modeChip: {
    // Same pixel width as chip — injected inline via useChipWidth().
    // ~92pt empty on the right of Row 2 (deliberate trade-off for
    // chip-size parity).
    height: CHIP_H,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modeChipMatch: {
    backgroundColor: palette.burnt,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modeChipNearMe: {
    backgroundColor: palette.leaf,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
