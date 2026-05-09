/**
 * In-app explainer for the "sunny tomorrow" notification permission.
 *
 * Apple HIG (and our preference): show this BEFORE calling the iOS
 * system prompt. The user reads what we want and why, then we trigger
 * the system prompt only when they tap "Notify me". A "No thanks"
 * dismisses without ever invoking the system API, leaving the
 * permission state as "undetermined" so they can opt in later via
 * iOS Settings → Zonnie → Notifications without the friction of
 * undoing a "Don't Allow".
 *
 * Mounted by `app/_layout.tsx` once per app launch when
 * `shouldShowPrompt()` returns true. Self-marks as prompted on either
 * choice so the user is never asked twice in-app.
 */

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/src/lib/haptics';
import {
  markPrompted,
  requestPermission,
} from '@/src/notifications/permission';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  spacing,
} from '@/src/theme/tokens';

interface NotificationPromptProps {
  /** Called when the prompt should unmount (after either button). */
  onDismiss: () => void;
}

export function NotificationPrompt({ onDismiss }: NotificationPromptProps) {
  const handleEnable = useCallback(async () => {
    haptics.medium();
    await markPrompted();
    // Triggers the iOS system permission alert. Whatever the user
    // chooses, we dismiss our explainer afterwards — the system alert
    // result is what matters.
    await requestPermission();
    onDismiss();
  }, [onDismiss]);

  const handleDismiss = useCallback(async () => {
    haptics.light();
    await markPrompted();
    onDismiss();
  }, [onDismiss]);

  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.glyph}>☀️</Text>
        <Text style={styles.title}>Catch the next sunny day</Text>
        <Text style={styles.body}>
          We'll send you a heads-up the morning of any day with a good
          stretch of sunny weather forecast — so you can plan your
          terrace stop before the rest of Amsterdam does.
        </Text>
        <Pressable
          onPress={handleEnable}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityLabel="Enable notifications"
        >
          <Text style={styles.primaryButtonText}>Notify me</Text>
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityLabel="Skip for now"
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42, 31, 21, 0.45)', // ink @ 45%
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    zIndex: 900,
    elevation: 900,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: palette.sand,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  glyph: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: fontSizes.md * 1.4,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
  },
  secondaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
