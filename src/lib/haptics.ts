/**
 * Centralised haptic-feedback helpers.
 *
 * Wraps expo-haptics with Platform guards (web silently no-ops) and
 * swallowed errors (haptics permissions / unsupported devices shouldn't
 * crash the foreground action). Keeps the choice of feedback style in
 * one place so callsites don't import expo-haptics directly and so
 * it's easy to retune the whole app's feel later.
 *
 * Convention used across Zonnie:
 *
 *   selection — non-destructive picker taps that change a single
 *              value: time preset pill, date chip, filter chip,
 *              region toggle. iOS plays a small "tick".
 *
 *   light    — UI taps that open a sheet or navigate (terrace row,
 *              map marker, action buttons). iOS plays a soft "thud".
 *
 *   medium   — important confirmations (snap-changes, bigger actions).
 *
 *   success  — favourites add, "go!" moments. iOS plays a positive
 *              two-note pattern.
 *
 *   warning  — non-error attention (currently unused; reserved for
 *              future "no terraces match" empty-state interactions).
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  selection() {
    if (!isSupported) return;
    Haptics.selectionAsync().catch(() => {
      // Permissions / older device — silently ignore.
    });
  },
  light() {
    if (!isSupported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (!isSupported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (!isSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  },
  warning() {
    if (!isSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {},
    );
  },
};
