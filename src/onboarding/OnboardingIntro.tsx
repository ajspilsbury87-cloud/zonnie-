/**
 * First-run onboarding overlay — 2 swipeable slides that establish
 * what Zonnie is and how to use it, before the user sees the live app.
 *
 * Why: user-test feedback was that the app's purpose and primary
 * gesture aren't obvious on first open. A skippable 2-slide intro
 * front-loads that context without cluttering the regular UI.
 *
 * Mechanics:
 *   - Fullscreen overlay (above the regular Stack + LandingPage)
 *   - Sand-cream gradient background matching the brand palette
 *   - Horizontal swipe via FlatList's pagingEnabled, plus an explicit
 *     Continue/Let's-go button on each slide
 *   - Skip link in the top-right corner
 *   - On dismiss → `markIntroSeen()` persists the flag and the parent
 *     unmounts this overlay
 *
 * Slide content is locked at 2 slides; we deliberately don't go to 3+
 * because carousel intros lose users with each tap. Two slides is the
 * shortest that still establishes (a) what the app does and (b) how
 * to use it.
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
import { markIntroSeen } from '@/src/onboarding/state';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  /** Emoji shown large above the headline as the visual hook. */
  glyph: string;
  /** Bold serif headline — the *what* of the slide. */
  headline: string;
  /** Sans subhead — the *how* / supporting detail. */
  subhead: string;
  /** CTA button copy. The last slide's CTA dismisses the intro. */
  cta: string;
}

const SLIDES: ReadonlyArray<Slide> = [
  {
    glyph: '☀️',
    headline: 'Vind het zonnigste terras van Amsterdam.',
    subhead: 'Uur voor uur. Per buurt.',
    cta: 'Verder →',
  },
  {
    glyph: '📍',
    headline: 'Tik op een pin om te zien wanneer de zon schijnt.',
    subhead: 'Plan vooruit. Filter op buurt. Zoek zon.',
    cta: 'Ga aan de slag ☀',
  },
];

interface OnboardingIntroProps {
  /** Called once the user finishes or skips — parent should unmount. */
  onDismiss: () => void;
}

export function OnboardingIntro({ onDismiss }: OnboardingIntroProps) {
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

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
  }, [index, dismiss]);

  /** Sync the dots with the user's swipe gesture. */
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

  // Memoized dot indicators
  const dots = useMemo(
    () =>
      SLIDES.map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === index ? styles.dotActive : null]}
        />
      )),
    [index],
  );

  const currentCta = SLIDES[index]?.cta ?? SLIDES[SLIDES.length - 1]!.cta;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.skipRow}>
          <Pressable
            onPress={dismiss}
            hitSlop={12}
            accessibilityLabel="Sla de intro over"
          >
            <Text style={styles.skip}>Overslaan</Text>
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
          // FlatList types want a slide-width-aware getItemLayout for
          // smooth scrollToIndex; without it `scrollToIndex` can refuse
          // to scroll if layout hasn't measured yet.
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

