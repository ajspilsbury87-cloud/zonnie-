/**
 * FilterChips — floating horizontal chip row over the map (Google-Maps style).
 *
 * Positioned absolutely near the top of the screen, inset-aware so it clears
 * the status-bar / notch. The chip row starts to the right of the home button
 * (left: HOME_BUTTON_LEFT + HOME_BUTTON_SIZE + gap) so the two never collide.
 *
 * Chips:
 *   Bar / Food / Coffee   — toggle selectedCategories in useAreaStore
 *   Big screen            — toggle matchModeOnly
 *   Gem                   — toggle hiddenGemOnly
 *   Areas (with chevron)  — opens a Modal containing NeighborhoodFilter
 *
 * (Time presets + the fine-tune scrubber live in the bottom-sheet header,
 *  next to the date + weather — not here.)
 *
 * Active style: burnt background + cream text.
 * Inactive style: white background + ink text + 0.5 px border.
 *
 * The "Areas" modal follows the same transparent-backdrop + tap-to-dismiss
 * pattern as the language chooser in LandingPage.
 *
 * Z-layering: rendered in app/index.tsx AFTER ZonnieMap and MainSheet but
 * BEFORE TerraceDetailSheet / ProPaywall / Home overlay so it sits above the
 * map but below the detail sheet.
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatInTimeZone } from 'date-fns-tz';

import { CATEGORIES_ORDERED, type VenueCategory } from '@/src/data/categories';
import { useStrings } from '@/src/i18n/useStrings';
import { AMSTERDAM_TZ } from '@/src/engines/scoring';
import { haptics } from '@/src/lib/haptics';
import { NeighborhoodFilter } from '@/src/components/NeighborhoodFilter';
import { useAreaStore } from '@/src/store/areaStore';
import { useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

// ── Layout constants ──────────────────────────────────────────────────────
// Keep these in sync with the home button in app/index.tsx so the two
// never visually collide.
// homeButton in index.tsx: left=spacing.md(12), width=44
const HOME_BUTTON_LEFT = spacing.md; // 12 — matches styles.homeButton.left in index.tsx
const HOME_BUTTON_SIZE = 44;
const HOME_BUTTON_GAP = spacing.sm; // 8 — breathing room between button & chips

// Amethyst purple used for the Gem chip active state (matches VenueTypeFilter).
const GEM_ACTIVE_BG = '#7B5EA7';

// Chip height — explicit so we can vertically centre against the home button.
const CHIP_HEIGHT = 32;

// ── Chip sub-component ────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Override the active background colour (defaults to burnt). */
  activeBg?: string;
  /** When true, render a ▾ chevron to signal "opens a picker". */
  hasChevron?: boolean;
  accessibilityLabel?: string;
}

function Chip({
  label,
  active,
  onPress,
  activeBg,
  hasChevron,
  accessibilityLabel,
}: ChipProps) {
  const bg = active ? (activeBg ?? palette.burnt) : palette.white;
  const textColor = active ? palette.cream : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg }, !active && styles.chipInactiveBorder]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
        {label}{hasChevron ? ' ▾' : ''}
      </Text>
    </Pressable>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────

function AreasModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <NeighborhoodFilter />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function FilterChips() {
  const t = useStrings();
  const insets = useSafeAreaInsets();

  // Filter state
  const selectedCategories = useAreaStore((s) => s.selectedCategories);
  const toggleCategory = useAreaStore((s) => s.toggleCategory);
  const matchModeOnly = useAreaStore((s) => s.matchModeOnly);
  const toggleMatchModeOnly = useAreaStore((s) => s.toggleMatchModeOnly);
  const hiddenGemOnly = useAreaStore((s) => s.hiddenGemOnly);
  const toggleHiddenGemOnly = useAreaStore((s) => s.toggleHiddenGemOnly);
  const selectedRegions = useAreaStore((s) => s.selectedRegions);

  // Modal visibility
  const [areasModalVisible, setAreasModalVisible] = useState(false);

  // Category chip labels from i18n
  const categoryText: Record<VenueCategory, string> = {
    bar: t.filterBar,
    restaurant: t.filterRestaurant,
    coffee: t.filterCoffee,
  };

  const handleToggleCategory = (cat: VenueCategory) => {
    haptics.selection();
    // Coffee auto-shift: if user activates Coffee alone (no other category
    // selected) and it's past noon, snap the time window to morning hours —
    // same behaviour as the old VenueTypeFilter chip in the bottom sheet.
    if (cat === 'coffee') {
      const willBeActive = !selectedCategories.has('coffee');
      const otherSelected = Array.from(selectedCategories).some((c) => c !== 'coffee');
      if (willBeActive && !otherSelected) {
        const nowHour = parseInt(formatInTimeZone(new Date(), AMSTERDAM_TZ, 'HH'), 10);
        if (nowHour >= 12) {
          useTimeStore.getState().setRange(9, 12);
        }
      }
    }
    toggleCategory(cat);
  };

  // Chip row starts after the home button.
  const chipRowLeft = HOME_BUTTON_LEFT + HOME_BUTTON_SIZE + HOME_BUTTON_GAP;
  // Vertically centre the chip row against the home button.
  // homeButton top = insets.top + spacing.sm; homeButton height = 44.
  const chipRowTop =
    insets.top + spacing.sm + Math.round((HOME_BUTTON_SIZE - CHIP_HEIGHT) / 2);

  // Areas chip label: show count of active regions
  const regionCount = selectedRegions.size;
  const areasLabel = regionCount > 0 ? `${t.filterAreas} (${regionCount})` : t.filterAreas;

  return (
    <>
      {/* Chip row — absolute overlay, right of home button */}
      <View
        style={[styles.row, { top: chipRowTop, left: chipRowLeft }]}
        // box-none lets map touches pass through the transparent gap
        pointerEvents="box-none"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category chips: Bar / Restaurant / Coffee */}
          {CATEGORIES_ORDERED.map((cat) => (
            <Chip
              key={cat}
              label={categoryText[cat]}
              active={selectedCategories.has(cat)}
              onPress={() => handleToggleCategory(cat)}
            />
          ))}

          {/* Big screen toggle */}
          <Chip
            label={t.filterOutdoor}
            active={matchModeOnly}
            onPress={() => { haptics.selection(); toggleMatchModeOnly(); }}
            accessibilityLabel={t.filterOutdoorA11y}
          />

          {/* Hidden gem toggle */}
          <Chip
            label={t.filterHiddenGem}
            active={hiddenGemOnly}
            onPress={() => { haptics.selection(); toggleHiddenGemOnly(); }}
            activeBg={GEM_ACTIVE_BG}
            accessibilityLabel={t.filterHiddenGemA11y}
          />

          {/* Areas chip — opens AreasModal */}
          <Chip
            label={areasLabel}
            active={regionCount > 0}
            onPress={() => { haptics.light(); setAreasModalVisible(true); }}
            hasChevron
            accessibilityLabel={t.filterAreasA11y}
          />
        </ScrollView>
      </View>

      {/* Areas popover modal */}
      <AreasModal
        visible={areasModalVisible}
        onClose={() => setAreasModalVisible(false)}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Absolute row positioned over the map. `pointerEvents: 'box-none'` on
  // the View lets map touches pass through the transparent gap between chips.
  row: {
    position: 'absolute',
    right: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg, // trailing breathing room before screen edge
    gap: spacing.xs,
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation lifts chips above map tiles and the MainSheet handle.
    elevation: 4,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  chipInactiveBorder: {
    borderWidth: 0.5,
    borderColor: palette.mist,
  },
  chipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
  },

  // ── Modal ──────────────────────────────────────────────────────────────
  // Full-screen dim backdrop — same pattern as LandingPage language chooser.
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'flex-end',
  },
  // Sheet card at the bottom of the screen, white with rounded top corners.
  modalSheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
});
