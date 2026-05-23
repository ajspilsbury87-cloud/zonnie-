/**
 * Free-text search field for the bottom-sheet header.
 *
 * Local input mirrors the store; we sync to the store on every keystroke
 * because the search engine is cheap (string includes() over 378 rows). If
 * we ever expand the dataset we'd debounce — for now, instant feedback
 * feels best.
 *
 * Uses Gorhom's `BottomSheetTextInput` rather than RN's TextInput because
 * the keyboard interaction inside the sheet's gesture system is fragile —
 * the wrapper handles focus/dismiss correctly and integrates with the
 * sheet's avoidance logic.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { useStrings } from '@/src/i18n/useStrings';
import { useSearchStore } from '@/src/store/searchStore';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

export function SearchBox() {
  const t = useStrings();
  const storedQuery = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);

  const [local, setLocal] = useState(storedQuery);

  // Re-sync when the store changes externally (e.g., a "clear all filters"
  // button — none today but cheap to support).
  useEffect(() => {
    setLocal(storedQuery);
  }, [storedQuery]);

  const handleChange = (text: string) => {
    setLocal(text);
    setQuery(text);
  };

  const handleClear = () => {
    setLocal('');
    clear();
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
