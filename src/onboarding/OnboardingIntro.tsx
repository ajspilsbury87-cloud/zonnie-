/**
 * First-run onboarding overlay — language picker + 2 swipeable slides.
 *
 * Flow:
 *   1. Language picker (always shown on first open) — two flag cards let
 *      the user choose EN or NL before they see any copy. Choice persists
 *      via languageStore.
 *   2. Slide 1 — what Zonnie is (☀️ headline)
 *   3. Slide 2 — how to use it (📍 headline)
 *
 * On dismiss → `markIntroSeen()` persists the flag and the parent
 * unmounts this overlay. Language preference is already stored separately
 * and survives app restarts independently of intro state.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { useLanguageStore } from '@/src/store/languageStore';
import { markIntroSeen } from '@/src/onboarding/state';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  glyph: string;
  headline: string;
  subhead: string;
  cta: string;
}

interface OnboardingIntroProps {
  /** Called once the user finishes or skips — parent should unmount. */
  onDismiss: () => void;
}

export function OnboardingIntro({ onDismiss }: OnboardingIntroProps) {
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  /** Whether the user has picked a language and is now in the slides. */
  const [langChosen, setLangChosen] = useState(false);

  const t = useStrings();
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);

  // Slides are derived from strings so they update when language changes.
  const SLIDES: ReadonlyArray<Slide> = useMemo(
    () => [
      {
        glyph: '☀️',
        headline: t.slide1Headline,
        subhead: t.slide1Sub,
        cta: t.slide1Cta,
      },
      {
        glyph: '📍',
        headline: t.slide2Headline,
        subhead: t.slide2Sub,
        cta: t.slide2Cta,
      },
    ],
    [t],
  );

  const dismiss = useCallback(() => {
    haptics.light();
    void markIntroSeen();
    onDismiss();
  }, [onDismiss]);

  const handleCtaPress = useCallback(() => {
    haptics.light();
    if (index >= SLIDES.length - 1) {
      dismiss();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  }, [index, dismiss, SLIDES.length]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      if (newIndex !== index) setIndex(newIndex);
    },
    [index],
  );

  const renderItem: ListRenderItem<Slide> = useCallback(
    ({ item }) => (
      <View style={styles.slide}>
        <Text style={styles.glyph}>{item.glyph}</Text>
        <Text style={styles.headline}>{item.headline}</Text>
        <Text style={styles.subhead}>{item.subhead}</Text>
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback((_: Slide, i: number) => String(i), []);

  const dots = useMemo(
    () =>
      SLIDES.map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === index ? styles.dotActive : null]}
        />
      )),
    [index, SLIDES],
  );

  const currentCta = SLIDES[index]?.cta ?? SLIDES[SLIDES.length - 1]!.cta;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {!langChosen ? (
          /* ── Language picker ──────────────────────────────────────────── */
          <View style={styles.langPickerContainer}>
            <Text style={styles.langPickerHeadline}>
              {'Choose language\nKies je taal'}
            </Text>
            <View style={styles.langPickerRow}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setLang('en');
                  setLangChosen(true);
                }}
                style={({ pressed }) => [
                  styles.langCard,
                  lang === 'en' && styles.langCardSelected,
                  pressed && styles.langCardPressed,
                ]}
                accessibilityLabel="English"
              >
                <Text style={styles.langFlag}>🇬🇧</Text>
                <Text style={styles.langLabel}>English</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.light();
                  setLang('nl');
                  setLangChosen(true);
                }}
                style={({ pressed }) => [
                  styles.langCard,
                  lang === 'nl' && styles.langCardSelected,
                  pressed && styles.langCardPressed,
                ]}
                accessibilityLabel="Nederlands"
              >
                <Text style={styles.langFlag}>🇳🇱</Text>
                <Text style={styles.langLabel}>Nederlands</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* ── Onboarding slides ────────────────────────────────────────── */
          <>
            <View style={styles.skipRow}>
              <Pressable
                onPress={dismiss}
                hitSlop={12}
                accessibilityLabel={t.skipIntroLabel}
              >
                <Text style={styles.skip}>{t.skipIntro}</Text>
              </Pressable>
            </View>

            <FlatList
              ref={listRef}
              data={SLIDES as Slide[]}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScrollEnd}
              style={styles.list}
              getItemLayout={(_, i) => ({
                length: SCREEN_W,
                offset: SCREEN_W * i,
                index: i,
              })}
            />

            <View style={styles.dotsRow}>{dots}</View>

            <Pressable
              onPress={handleCtaPress}
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
              ]}
              accessibilityLabel={currentCta}
            >
              <Text style={styles.ctaLabel}>{currentCta}</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.sand,
    zIndex: 100,
  },
  safe: {
    flex: 1,
  },

  // ── Language picker ──────────────────────────────────────────────────
  langPickerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  langPickerHeadline: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    color: palette.ink,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: fontSizes.xxl * 1.3,
  },
  langPickerRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignSelf: 'stretch',
  },
  langCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: palette.sandDeep,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langCardSelected: {
    borderColor: palette.burnt,
    backgroundColor: palette.cream,
  },
  langCardPressed: {
    opacity: 0.8,
  },
  langFlag: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  langLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.ink,
  },

  // ── Slides ───────────────────────────────────────────────────────────
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  skip: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },
  list: {
    flex: 1,
  },
  slide: {
    width: SCREEN_W,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  glyph: {
    fontSize: 96,
    marginBottom: spacing.xl,
  },
  headline: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    color: palette.ink,
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: fontSizes.display * 1.1,
    marginBottom: spacing.md,
  },
  subhead: {
    fontFamily: fonts.body,
    fontSize: fontSizes.lg,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: fontSizes.lg * 1.4,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.mistDeep,
  },
  dotActive: {
    backgroundColor: palette.burnt,
    width: 24,
  },
  cta: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    alignItems: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.lg,
    color: palette.cream,
    letterSpacing: 0.3,
  },
});
