/**
 * Brand splash overlay shown above the app surface for the first ~1.6s
 * after launch. Bridges the gap between the native expo-splash-screen
 * (locked to a static image) and the live map+list, giving Zonnie a
 * polished first moment that matches the brand sunset palette.
 *
 * Sequence (Reanimated 3, all on the UI thread):
 *   - 0ms     overlay starts fully opaque (sand background, sun + text invisible)
 *   - 80ms    sun core scales 0 → 1 with overshoot, 8 rays fan out
 *   - 350ms   "Zonnie" wordmark fades in, slides up 8px → 0
 *   - 600ms   "Find sun, fast." tagline fades in, slides up 6px → 0
 *   - 1300ms  hold complete; overlay opacity 1 → 0 over 350ms
 *   - 1650ms  `onAnimationDone` fires; parent unmounts the overlay
 *
 * Design choices:
 *   - Pure View graphics, no SVG / Lottie dep — keeps bundle size flat
 *     and the animation runs at 60fps on Reanimated's worklets.
 *   - The sun is a circle (peach) with 8 thin "ray" rectangles rotated
 *     around the centre, each animated independently for a fan-out feel.
 *   - Background is `palette.sand` to match the native splash screen
 *     so there's no flash at the handover.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { fonts, fontSizes, palette } from '@/src/theme/tokens';

const RAY_COUNT = 8;
const SUN_DIAMETER = 96;
const RAY_LENGTH = 22;
const RAY_THICKNESS = 6;

interface SplashOverlayProps {
  /** Called once the fade-out completes; parent should unmount the overlay. */
  onAnimationDone: () => void;
}

export function SplashOverlay({ onAnimationDone }: SplashOverlayProps) {
  // Master container opacity — starts visible, fades to 0 at the end.
  const containerOpacity = useSharedValue(1);
  // Sun core scale — bounces in.
  const sunScale = useSharedValue(0);
  // Rays expand outward (0 = retracted, 1 = full extent).
  const rayProgress = useSharedValue(0);
  // Title + tagline fade/slide.
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(8);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(6);

  useEffect(() => {
    // Start sequence on mount. All animations run on the UI thread.
    sunScale.value = withDelay(
      80,
      withSequence(
        withTiming(1.08, { duration: 280, easing: Easing.out(Easing.back(1.6)) }),
        withTiming(1.0, { duration: 140, easing: Easing.inOut(Easing.quad) }),
      ),
    );
    rayProgress.value = withDelay(
      120,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
    titleOpacity.value = withDelay(
      350,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    titleTranslateY.value = withDelay(
      350,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    taglineOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    taglineTranslateY.value = withDelay(
      600,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    // Fade out at 1300ms; tell parent we're done at 1650ms.
    containerOpacity.value = withDelay(
      1300,
      withTiming(
        0,
        { duration: 350, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(onAnimationDone)();
        },
      ),
    );
    // No cleanup — runOnJS handles the done signal; if the component
    // unmounts early, Reanimated cleans up shared values automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const sunCoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sunScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));

  // Pre-compute the static rotation for each ray so we don't recreate
  // them on every animation frame. The TRANSLATION (how far the ray
  // sits from centre) animates via rayProgress.
  const rays = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, i) => {
        const angle = (i / RAY_COUNT) * 360;
        return { i, angle };
      }),
    [],
  );

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <View style={styles.sunGroup}>
        {rays.map(({ i, angle }) => (
          <Ray key={i} angle={angle} progress={rayProgress} />
        ))}
        <Animated.View style={[styles.sunCore, sunCoreStyle]} />
      </View>
      <Animated.Text style={[styles.title, titleStyle]}>Zonnie</Animated.Text>
      <Animated.Text style={[styles.tagline, taglineStyle]}>
        Find sun, fast.
      </Animated.Text>
    </Animated.View>
  );
}

interface RayProps {
  angle: number;
  progress: ReturnType<typeof useSharedValue<number>>;
}

function Ray({ angle, progress }: RayProps) {
  // Each ray is a thin rectangle pinned to the centre and rotated to its
  // target angle, then translated outward as `progress` ramps 0 → 1.
  const animatedStyle = useAnimatedStyle(() => {
    // Fan out: at 0, rays are tucked behind the sun core; at 1 they
    // sit just outside it.
    const distance = interpolate(
      progress.value,
      [0, 1],
      [SUN_DIAMETER / 2 - RAY_LENGTH * 0.6, SUN_DIAMETER / 2 + 6],
    );
    return {
      transform: [
        { rotate: `${angle}deg` },
        { translateY: -distance },
      ],
      opacity: progress.value,
    };
  });
  return <Animated.View style={[styles.ray, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.sand,
    alignItems: 'center',
    justifyContent: 'center',
    // Render above everything else in the parent stacking context.
    zIndex: 1000,
    elevation: 1000,
  },
  sunGroup: {
    width: SUN_DIAMETER + RAY_LENGTH * 2,
    height: SUN_DIAMETER + RAY_LENGTH * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunCore: {
    width: SUN_DIAMETER,
    height: SUN_DIAMETER,
    borderRadius: SUN_DIAMETER / 2,
    backgroundColor: palette.peach,
    // Subtle warm-glow ring around the sun.
    shadowColor: palette.burnt,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  ray: {
    position: 'absolute',
    width: RAY_THICKNESS,
    height: RAY_LENGTH,
    borderRadius: RAY_THICKNESS / 2,
    backgroundColor: palette.peach,
    // The ray sits above the centre and is then rotated; the
    // transform-origin defaults to its own centre so the rotation +
    // translateY combo neatly orbits the sunGroup centre.
  },
  title: {
    marginTop: 36,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    color: palette.ink,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    letterSpacing: 0.2,
  },
});
