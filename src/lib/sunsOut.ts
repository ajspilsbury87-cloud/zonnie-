/**
 * "Sun's out" moment — pure decision logic (no React, no AsyncStorage, so it
 * is unit-testable in isolation, mirroring the perfectForGuidesConfig.ts /
 * todaysVerdict.ts pattern).
 *
 * The in-app celebratory moment shows AT MOST once per Amsterdam calendar day,
 * and only when today is a genuinely top-tier terrace day. We reuse the SAME
 * forecast-block signal the daily notification uses (findGoodWeatherBlock +
 * isTopTierBlock) so the in-app moment and the push agree on what "a cracking
 * day" means — and so it stays rare and credible.
 */

import { findGoodWeatherBlock, isTopTierBlock } from '@/src/notifications/forecast';
import type { Weather } from '@/src/engines/types';

/**
 * Should the "Sun's out" moment be shown right now?
 *
 * @param todayHourly   today's 24-element hourly forecast (from weatherStore),
 *                      or undefined while it's still loading.
 * @param lastShownDate the Amsterdam date string the moment was last shown on,
 *                      or null if never.
 * @param todayDateStr  today's Amsterdam date string ('YYYY-MM-DD').
 * @returns true only when today is a top-tier day AND it hasn't been shown today.
 */
export function shouldShowSunsOut(
  todayHourly: readonly (Weather | undefined)[] | undefined,
  lastShownDate: string | null,
  todayDateStr: string,
): boolean {
  // Already celebrated today → never twice.
  if (lastShownDate === todayDateStr) return false;
  // Weather not loaded yet → don't show (avoids a false positive off the
  // synthetic fallback profile).
  if (!todayHourly || todayHourly.length === 0) return false;
  const block = findGoodWeatherBlock(todayHourly);
  return block != null && isTopTierBlock(block);
}
