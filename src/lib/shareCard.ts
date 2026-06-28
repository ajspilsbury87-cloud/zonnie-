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
import type { CrawlPlan } from '@/src/engines/crawl';

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

/**
 * Build the text share message for a Chase the Sun crawl plan.
 *
 * Format (3-stop example):
 *   ☀️ My Chase the Sun route through Jordaan:
 *   1. Café Kobalt — sun till 17:00
 *   2. Bar Baarsch — 4 min walk
 *   3. Westerdok — golden hour 🌅
 *
 *   Stay in the sun all afternoon → https://apps.apple.com/...
 *
 * For 2-stop plans the third line is omitted. The function is kept
 * pure so it's easy to unit-test without mocking the Share API.
 */
export function buildCrawlShareMessage(plan: CrawlPlan): string {
  const stops = plan.stops;
  // Use the area of the first stop as the "through X" label.
  const area = stops[0]?.terrace.area ?? 'Amsterdam';

  const lines: string[] = [`☀️ My Chase the Sun route through ${area}:`];

  stops.forEach((stop, i) => {
    const stopNum = i + 1;
    if (i === 0) {
      // First stop: show until-hour.
      lines.push(`${stopNum}. ${stop.terrace.name} — sun till ${stop.sunUntilHour + 1}:00`);
    } else if (i === stops.length - 1 && stop.isGoldenFinish) {
      // Last stop with golden finish: show walk + golden label.
      lines.push(`${stopNum}. ${stop.terrace.name} — ${stop.walkMinutesFromPrev} min walk — golden hour 🌅`);
    } else {
      // Middle stops: show walk time.
      lines.push(`${stopNum}. ${stop.terrace.name} — ${stop.walkMinutesFromPrev} min walk`);
    }
  });

  lines.push('');
  lines.push(`Stay in the sun all afternoon → ${APP_STORE_URL}`);

  return lines.join('\n');
}

/**
 * Fire the native share sheet with a pre-composed Chase the Sun crawl message.
 *
 * Same pattern as shareTerraceCard: caller can `await` and observe the result,
 * but the `.catch()` in the call site handles the common case where the user
 * dismisses without choosing a destination.
 */
export async function shareCrawl(plan: CrawlPlan): Promise<void> {
  const message = buildCrawlShareMessage(plan);

  await Share.share(
    {
      message,
      url: APP_STORE_URL,
    },
    {
      excludedActivityTypes: [
        'com.apple.UIKit.activity.AddToReadingList',
        'com.apple.UIKit.activity.OpenInIBooks',
        'com.apple.UIKit.activity.Print',
        'com.apple.UIKit.activity.AssignToContact',
      ],
    },
  );
}

/**
 * Fire the native share sheet for the "Sun's out" moment — a generic
 * "the sun's out, where are we drinking?" nudge to drop into the group chat.
 * The message text is passed in (localised by the caller via i18n) so this
 * function stays language-agnostic; it just appends the App Store link.
 */
export async function shareSunsOut(message: string): Promise<void> {
  const fullMessage = `${message}\n\n${APP_STORE_URL}`;
  await Share.share(
    {
      message: fullMessage,
      url: APP_STORE_URL,
    },
    {
      excludedActivityTypes: [
        'com.apple.UIKit.activity.AddToReadingList',
        'com.apple.UIKit.activity.OpenInIBooks',
        'com.apple.UIKit.activity.Print',
        'com.apple.UIKit.activity.AssignToContact',
      ],
    },
  );
}
