/**
 * Notification permission state + request flow.
 *
 * Apple HIG (and our own UX preference): never call
 * `requestPermissionsAsync()` cold — show a custom in-app explainer
 * first, only ask the system once the user has opted in. Reason: a
 * "Don't Allow" answer to the iOS prompt is sticky; the user has to
 * go to iOS Settings to flip it back. Our explainer reduces the
 * decline rate dramatically.
 *
 * Persistence:
 *   `notif:promptedAt` — ISO timestamp of last in-app explainer shown.
 *                        We never re-prompt if user has dismissed once.
 *
 * Anyone (e.g., a future Settings screen) can call `requestPermission`
 * directly to bypass our explainer-throttle and trigger the system
 * prompt — it's just `Notifications.requestPermissionsAsync()` with
 * a useful return shape.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROMPTED_KEY = 'notif:promptedAt';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status === 'granted') return 'granted';
    if (perms.status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    // Native module missing (older build that didn't include
    // expo-notifications) or permission API failure — treat as
    // "unsupported" so callers gracefully no-op.
    return 'unsupported';
  }
}

/**
 * Trigger the iOS system prompt. Wraps `requestPermissionsAsync` with
 * platform/web guards and a clean status string.
 */
export async function requestPermission(): Promise<PermissionStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const result = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    if (result.status === 'granted') return 'granted';
    if (result.status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** True if we've already shown our in-app explainer to this user. */
export async function hasPromptedBefore(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PROMPTED_KEY);
    return v != null && v.length > 0;
  } catch {
    return false;
  }
}

export async function markPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, new Date().toISOString());
  } catch {
    // Persistence failure isn't fatal — worst case, we re-prompt.
  }
}

/**
 * Decide whether the in-app prompt should appear on this app open.
 * Yes if: notifications are supported, permission undetermined,
 * and we haven't asked before.
 */
export async function shouldShowPrompt(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const status = await getPermissionStatus();
  if (status !== 'undetermined') return false;
  if (await hasPromptedBefore()) return false;
  return true;
}
