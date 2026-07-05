/**
 * PerfectForGuides — a horizontal row of "Perfect for…" shortcut cards
 * rendered on the LandingPage, between TodaysVerdict and the featured
 * carousel.
 *
 * Each card maps to a REAL combination of existing filter / time-window
 * state. Tapping one:
 *   1. Applies the corresponding store mutations.
 *   2. Dismisses the landing overlay so the user lands on the
 *      filtered map/list immediately (same pattern as handleWcPress in
 *      LandingPage).
 *   3. Fires haptics.
 *
 * The guide definitions (key → store mutations) live in
 * perfectForGuidesConfig.ts, which is kept dependency-free so it can be
 * unit-tested in Jest without native module stubs.
 */

import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';

import { useStrings } from '@/src/i18n/useStrings';
import { haptics } from '@/src/lib/haptics';
import { useAreaStore } from '@/src/store/areaStore';
import { useLandingStore } from '@/src/store/landingStore';
import { useSunRunStore } from '@/src/store/sunRunStore';
import { useTimeStore } from '@/src/store/timeStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';
import {
  GUIDE_DEFINITIONS,
  type GuideDefinition,
  type GuideStores,
} from './perfectForGuidesConfig';

// Re-export for tests that need the type surface.
export type { GuideDefinition, GuideStores };
export { GUIDE_DEFINITIONS };

// ── Component ─────────────────────────────────────────────────────────────────

export function PerfectForGuides() {
  const t = useStrings();
  const hideLanding = useLandingStore((s) => s.hide);
  const openSunRun = useSunRunStore((s) => s.open);

  // Store references bundled once per render. These are the Zustand
  // store hooks themselves (not the state), so they're stable objects —
  // no hook calls happen inside the press handler.
  const stores: GuideStores = { timeStore: useTimeStore, areaStore: useAreaStore };

  const handlePress = (definition: GuideDefinition) => {
    haptics.medium();
    definition.buildAction(stores)();
    // Small delay mirrors handleWcPress in LandingPage: lets the store
    // mutation land before the overlay hides and the list re-renders.
    setTimeout(hideLanding, 60);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.header}>{t.perfectForHeader}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Negative margin escapes the parent container's paddingHorizontal
        // (spacing.lg = 16) so cards bleed edge-to-edge, matching the
        // featured-carousel treatment in LandingPage.
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {GUIDE_DEFINITIONS.map((def) => (
          <GuideCard
            key={def.key}
            label={t[def.labelKey as keyof typeof t] as string}
            a11yLabel={t[def.a11yKey as keyof typeof t] as string}
            bgColor={def.bgColor}
            onPress={() => handlePress(def)}
          />
        ))}
        {/* Sun Run (Phase 0) — hard-coded rather than a GUIDE_DEFINITION
            because it opens a sheet instead of mutating filter state, and
            GuideStores is deliberately limited to filter/time stores. */}
        <GuideCard
          key="sun-run"
          label={t.guideSunRun}
          a11yLabel={t.guideSunRunA11y}
          bgColor={palette.cocoa}
          onPress={() => {
            haptics.medium();
            openSunRun();
            setTimeout(hideLanding, 60);
          }}
        />
      </ScrollView>
    </View>
  );
}

// ── GuideCard sub-component ───────────────────────────────────────────────────

interface GuideCardProps {
  label: string;
  a11yLabel: string;
  bgColor: string;
  onPress: () => void;
}

function GuideCard({ label, a11yLabel, bgColor, onPress }: GuideCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: bgColor },
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Text style={styles.cardLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD_WIDTH = 108;
const CARD_HEIGHT = 72;

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
  },
  header: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  // Negative horizontal margin escapes the parent container's paddingHorizontal
  // (spacing.lg = 16) so the first card bleeds flush with the screen edge.
  // contentContainerStyle's paddingHorizontal then restores the leading indent.
  scroll: {
    marginHorizontal: -spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'flex-end',
    // Subtle lift so cards read as tappable over the sand background.
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  cardLabel: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xs,
    color: palette.cream,
    letterSpacing: -0.1,
    lineHeight: 14,
  },
});
