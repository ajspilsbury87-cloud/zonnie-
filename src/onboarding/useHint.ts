/**
 * `useHint` hook — encapsulates the read/write/auto-dismiss lifecycle
 * for a one-shot contextual onboarding hint.
 *
 * Pattern:
 *   const [shown, dismiss] = useHint('pin-tap');
 *   return shown ? <HintBubble onDismiss={dismiss}>...</HintBubble> : null;
 *
 * `shown` flips false if the user has dismissed before (per-hint flag
 * in AsyncStorage), or if they dismiss this session. `dismiss()`
 * marks the hint seen and updates state so the bubble unmounts.
 *
 * Auto-dismiss timer: hints fade themselves out after AUTO_DISMISS_MS
 * if the user ignores them. Beats permanent stuck-on-screen overlays.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  markHintSeen,
  shouldShowHint,
  subscribeHintChange,
  type HintName,
} from '@/src/onboarding/state';

/** Auto-dismiss the hint after 10s of inactivity. */
const AUTO_DISMISS_MS = 10_000;

interface UseHintOptions {
  /**
   * Optional gate: this hint only shows once `after` has been dismissed.
   * Used to stagger multiple hints so they don't pile up on screen at
   * the same time. e.g. `useHint('time-scrubber', { after: 'pin-tap' })`
   * keeps the time-scrubber hint hidden until the user has dismissed
   * the pin-tap hint (or it auto-timed out).
   */
  after?: HintName;
}

export function useHint(
  name: HintName,
  options?: UseHintOptions,
): [shown: boolean, dismiss: () => void] {
  // null = "haven't checked AsyncStorage yet" → render nothing to
  // avoid a flicker between "shown briefly" and "no, you've seen this".
  const [shown, setShown] = useState<boolean | null>(null);
  const after = options?.after;

  useEffect(() => {
    let cancelled = false;
    const recheck = async () => {
      const should = await shouldShowHint(name);
      if (!should) {
        if (!cancelled) setShown(false);
        return;
      }
      // Sequencing gate: hold this hint until `after` is dismissed.
      if (after != null) {
        const previousStillVisible = await shouldShowHint(after);
        if (previousStillVisible) {
          if (!cancelled) setShown(false);
          return;
        }
      }
      if (!cancelled) setShown(true);
    };
    void recheck();
    // Re-evaluate when any hint changes — necessary for sequenced
    // hints to transition from hidden → shown the moment their
    // predecessor dismisses.
    const unsubscribe = subscribeHintChange(() => {
      void recheck();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [name, after]);

  const dismiss = useCallback(() => {
    setShown(false);
    void markHintSeen(name);
  }, [name]);

  // Auto-dismiss after a timeout — only arms once we know the hint
  // is actually going to be shown, so we don't burn timers on hints
  // that won't render.
  useEffect(() => {
    if (shown !== true) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [shown, dismiss]);

  return [shown === true, dismiss];
}
