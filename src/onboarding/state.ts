/**
 * Onboarding persistence — AsyncStorage flags for the first-run intro
 * and contextual hints.
 *
 * Key naming:
 *   `onboarding:intro-v1` — set once the user dismisses the intro
 *                            slides. Bump suffix when we want to
 *                            re-trigger after a UX overhaul.
 *   `hint:<name>`          — set once each contextual hint dismisses.
 *                            Each hint owns its own key so adding new
 *                            hints doesn't reset old ones.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_KEY = 'onboarding:intro-v1';

/**
 * Names of the contextual one-shot hints we ship.
 *
 * Keep this exhaustive: the type-system guards against typos at the
 * call sites that dismiss a hint.
 */
export type HintName = 'pin-tap' | 'time-scrubber' | 'filters';

function hintKey(name: HintName): string {
  return `hint:${name}`;
}

/**
 * True when the intro slides have NOT yet been dismissed.
 *
 * Returns true on persistence error so that a broken AsyncStorage
 * defaults to "show the intro" rather than locking out new users.
 */
export async function shouldShowIntro(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(INTRO_KEY);
    return v == null;
  } catch {
    return true;
  }
}

/** Mark the intro as seen — call this when the user finishes/skips. */
export async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_KEY, new Date().toISOString());
  } catch {
    // Persistence failure is non-fatal — worst case the user sees the
    // intro again next launch. Not a blocker.
  }
}

/** True when the named hint has NOT yet been dismissed. */
export async function shouldShowHint(name: HintName): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(hintKey(name));
    return v == null;
  } catch {
    return true;
  }
}

/** Mark a hint as seen — call this when the user dismisses or interacts. */
export async function markHintSeen(name: HintName): Promise<void> {
  try {
    await AsyncStorage.setItem(hintKey(name), new Date().toISOString());
  } catch {
    // See note above.
  }
  // Notify any other in-flight useHint() instances so sequenced hints
  // (e.g. "show me after pin-tap is dismissed") can re-check and
  // appear without waiting for a remount.
  notifyHintChange();
}

// ── Hint-change pubsub ──────────────────────────────────────────────────────
//
// `useHint` instances that are gated on a previous hint (`after: 'pin-tap'`)
// need to know when that previous hint dismisses, so they can transition
// from hidden → shown without a remount. We expose a tiny in-memory
// subscriber set; markHintSeen calls notifyHintChange() at the end.
//
// Local to the JS bundle — no AsyncStorage round-trip on each notify.

type HintChangeListener = () => void;
const hintChangeListeners = new Set<HintChangeListener>();

export function subscribeHintChange(listener: HintChangeListener): () => void {
  hintChangeListeners.add(listener);
  return () => hintChangeListeners.delete(listener);
}

function notifyHintChange(): void {
  for (const listener of hintChangeListeners) {
    try {
      listener();
    } catch {
      // Listener exceptions shouldn't break other subscribers.
    }
  }
}
