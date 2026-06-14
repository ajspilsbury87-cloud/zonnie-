/**
 * ShortlistBar — screen-level floating bar for the group-vote shortlist.
 *
 * WHY this exists outside the bottom sheet:
 * Gorhom Bottom Sheet measures content at the MAX snap point (92 % of screen).
 * An `position:absolute, bottom` bar inside the sheet renders correctly at
 * full-snap but disappears below the fold when the sheet is at a lower snap
 * point. Moving the bar to a screen-level overlay fixes visibility at any
 * sheet height.
 *
 * WHY Pressable instead of RNGMH TouchableOpacity:
 * RNGMH's TouchableOpacity only handles taps reliably inside Gorhom's
 * GestureHandlerRootView tree. This component renders at the screen root,
 * outside that tree, so plain RN Pressable is the correct choice here.
 */

import { useCallback } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStrings } from '@/src/i18n/useStrings';
import { haptics } from '@/src/lib/haptics';
import { buildVoteUrl } from '@/src/lib/voteLink';
import { useShortlistStore } from '@/src/store/shortlistStore';
import { useShortlistScores } from '@/src/hooks/useScoredTerraces';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function ShortlistBar() {
  const t = useStrings();
  const insets = useSafeAreaInsets();

  // Shortlist state
  const selectedIds = useShortlistStore((s) => s.selectedIds);
  const isSelecting = useShortlistStore((s) => s.isSelecting);
  const clear = useShortlistStore((s) => s.clear);

  // Score every selected terrace from the FULL terrace set (filter-independent).
  // Using the ranked/filtered list here would silently drop a terrace from the
  // vote URL if the user changed a filter (search/region/match/etc.) after
  // selecting it. Scores still match the list (same scoring path + cache).
  const scores = useShortlistScores(selectedIds);

  const handleShare = useCallback(async () => {
    const items = selectedIds.flatMap((id) => {
      const score = scores.get(id);
      return score != null ? [{ id, score }] : [];
    });
    // Guard: nothing to share (shouldn't reach here since button is disabled
    // when count === 0, but defensive programming is always worth it).
    if (items.length === 0) return;

    const url = buildVoteUrl(items);
    const message = t.voteShareMessage(url);

    haptics.success();
    // Share BEFORE clear: if the user cancels the share sheet, they should
    // still have their shortlist intact. Clear happens after the sheet opens
    // (Share.share resolves regardless of whether the user actually sent —
    // we don't know, but clearing after the sheet opens is the least-
    // surprising UX: re-opening the shortlist picker would feel odd).
    await Share.share({ message, url });
    clear();
  }, [selectedIds, scores, t, clear]);

  // Not in selection mode — render nothing. This is the component's off state;
  // it costs zero paint time when the shortlist is inactive.
  if (!isSelecting) return null;

  return (
    <View
      style={[
        styles.bar,
        // Pin to the physical bottom of the device, above the home indicator
        // (or navigation bar on Android). insets.bottom is 0 on devices with
        // no home indicator / nav bar, so this degrades gracefully.
        { bottom: insets.bottom + spacing.lg },
      ]}
    >
      <Pressable
        onPress={clear}
        style={styles.cancel}
        accessibilityLabel={t.cancelShortlistA11y}
      >
        <Text style={styles.cancelText}>{t.cancelShortlist}</Text>
      </Pressable>

      <Pressable
        onPress={() => void handleShare()}
        style={[
          styles.share,
          selectedIds.length === 0 && styles.shareDisabled,
        ]}
        disabled={selectedIds.length === 0}
        accessibilityLabel={t.askTheGroupA11y}
      >
        <Text style={styles.shareText}>
          {t.askTheGroup(selectedIds.length)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    // `bottom` is set dynamically in the JSX above (insets.bottom + spacing.lg)
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.ink,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // High zIndex so the bar renders over both the map and the bottom sheet.
    zIndex: 100,
    // Android elevation — zIndex alone doesn't create a stacking context on
    // Android; elevation is needed to ensure the bar sits above the sheet.
    elevation: 16,
    // Warm shadow so the bar reads as elevated over the sheet content.
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  cancel: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cancelText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.mistDeep,
  },
  share: {
    flex: 1,
    backgroundColor: palette.burnt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  shareDisabled: {
    opacity: 0.4,
  },
  shareText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
});
