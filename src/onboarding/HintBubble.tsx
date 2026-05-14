/**
 * Reusable contextual hint bubble — a small "did you know" tooltip
 * with a tail-less bubble design and tap-anywhere-to-dismiss.
 *
 * Driven by `useHint()` from the call site. This component is purely
 * presentational + fade-in/out animation. State logic lives in the
 * hook so callers can decide WHEN a hint should appear (e.g., only
 * when the parent sheet is in a particular snap point).
 *
 * Visual:
 *   - Burnt orange background (matches the brand's accent palette;
 *     readable against both sand and dark map backgrounds)
 *   - Cream text
 *   - Rounded pill shape, subtle shadow so it floats above content
 *   - Tap anywhere on the bubble → calls onDismiss
 *
 * Positioning: pass `style` (top/bottom/left/right/center) to anchor
 * it where the parent wants. The bubble itself is `absolute`-positioned
 * so it overlays content without disturbing layout.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

interface HintBubbleProps {
  /** Hint copy — keep terse (under ~50 chars; one line on iPhone min width). */
  children: string;
  /** Called when the user taps the bubble. */
  onDismiss: () => void;
  /** Absolute positioning overrides (top/bottom/left/right/alignSelf). */
  style?: ViewStyle;
}

export function HintBubble({ children, onDismiss, style }: HintBubbleProps) {
  // Fade in on mount so the bubble doesn't pop on screen. Pairs
  // visually with the slide-in animations of the sheets it usually
  // overlays.
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.bubble, style, { opacity }]} pointerEvents="box-none">
      <Pressable onPress={onDismiss} style={styles.inner} accessibilityHint="Tap to dismiss this hint">
        <Text style={styles.text}>{children}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: palette.burnt,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.cream,
    letterSpacing: 0.2,
  },
});
