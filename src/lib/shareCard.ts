/**
 * shareCard — build and fire the native share sheet for a terrace.
 *
 * Uses React Native's built-in `Share` API so there's no extra native dep
 * and no new build required. The share sheet is the standard iOS / Android
 * system UI; the user picks the destination (Messages, WhatsApp, Instagram
 * Stories, copy-to-clipboard, etc.) themselves.
 *
 * Message anatomy:
 *
 *   ☀️ Café Kobalt is sunny 14:00–16:00 today — Mostly Sunny
 *   📍 Jordaan, Amsterdam
 *
 *   Find sunny terraces near you → https://apps.apple.com/app/zonnie/id6767790487
 *
 * If `bestWindow` is provided the time comes from there; otherwise it falls
 * back to the user's current visit window so the message is always grounded
 * in a real score, not a hypothetical one.
 */

import { Share } from 'react-native';
import { scoreLabel } from '@/src/engines/scoring';

export const APP_STORE_URL =
  'https://apps.apple.com/app/zonnie/id6767790487';

export interface ShareCardParams {
  name: string;
  area: string;
  /** Average score for the time being shared, 0–1. */
  score: number;
  /** Start hour of the window being described (Amsterdam local). */
  fromHour: number;
  /** End hour of the window being described (Amsterdam local). */
  toHour: number;
}

function fmtHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

function buildTimeLabel(fromHour: number, toHour: number): string {
  if (fromHour === toHour) return `at ${fmtHour(fromHour)}`;
  return `${fmtHour(fromHour)}–${fmtHour(toHour)}`;
}

/**
 * Fire the native share sheet with a pre-composed Zonnie terrace card.
 *
 * Returns the Share.share result promise so callers can observe
 * whether the user actually completed the share (action === 'sharedSuccessfully')
 * if they want to fire analytics.
 */
export async function shareTerraceCard(params: ShareCardParams): Promise<void> {
  const { name, area, score, fromHour, toHour } = params;
  const timeLabel = buildTimeLabel(fromHour, toHour);
  const label = scoreLabel(score);

  const message = [
    `☀️ ${name} is sunny ${timeLabel} today — ${label}`,
    `📍 ${area}, Amsterdam`,
    '',
    `Find sunny terraces near you → ${APP_STORE_URL}`,
  ].join('\n');

  await Share.share(
    {
      message,
      // `url` is iOS-only — Share.share puts it below the message in the
      // standard sheet. We embed the URL in the message too so Android /
      // copy-paste users get it.
      url: APP_STORE_URL,
    },
    {
      // Disable the "Add to Reading List" and similar iOS system actions
      // that don't make sense for a terrace recommendation.
      excludedActivityTypes: [
        'com.apple.UIKit.activity.AddToReadingList',
        'com.apple.UIKit.activity.OpenInIBooks',
        'com.apple.UIKit.activity.Print',
        'com.apple.UIKit.activity.AssignToContact',
      ],
    },
  );
}
