/**
 * Free-text search field for the bottom-sheet header.
 *
 * Local input mirrors the store for instant on-screen feedback, but the store
 * write that DRIVES scoring is debounced (~200 ms): filtering + re-scoring the
 * ~2,000-terrace dataset on every keystroke made fast typing stutter. The
 * visible text updates immediately; the results settle a beat after you stop
 * typing.
 *
 * Uses Gorhom's `BottomSheetTextInput` rather than RN's TextInput because
 * the keyboard interaction inside the sheet's gesture system is fragile —
 * the wrapper handles focus/dismiss correctly and integrates with the
 * sheet's avoidance logic.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { useStrings } from '@/src/i18n/useStrings';
import { useSearchStore } from '@/src/store/searchStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

/** How long to wait after the last keystroke before re-scoring. */
const SEARCH_DEBOUNCE_MS = 200;

export function SearchBox() {
  const t = useStrings();
  const storedQuery = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);

  const [local, setLocal] = useState(storedQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the store changes externally (e.g., a "clear all filters"
  // button — none today but cheap to support). Safe alongside the debounce:
  // the debounced write always sends the LATEST text, so storedQuery only ever
  // catches up to what `local` already shows — never reverts it mid-type.
  useEffect(() => {
    setLocal(storedQuery);
  }, [storedQuery]);

  // Cancel any pending debounced write when the field unmounts.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (text: string) => {
    setLocal(text); // immediate on-screen feedback
    // Debounce the store write that triggers filtering + re-scoring.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocal('');
    clear(); // clear immediately — no reason to wait on an empty query
  };

  return (
    <View style={styles.root}>
      <Text style={styles.icon}>⌕</Text>
      <BottomSheetTextInput
        value={local}
        onChangeText={handleChange}
        placeholder={t.searchPlaceholder}
        placeholderTextColor={palette.mistDeep}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {local.length > 0 ? (
        <Pressable onPress={handleClear} hitSlop={8} style={styles.clearButton}>
          <Text style={styles.clearText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.sandDeep,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: fontSizes.lg,
    color: palette.inkSoft,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.ink,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.mistDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  clearText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.white,
    lineHeight: fontSizes.md,
  },
});
