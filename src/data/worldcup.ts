/**
 * World Cup 2026 date-gating and fixture data.
 *
 * Everything in this file is keyed to the tournament window. Once
 * WC_END has passed, isWorldCupLive() returns false everywhere and
 * the UI gates (spotlight card, matchday banner, 📺 pin badge) all
 * become invisible — no follow-up release required.
 *
 * Callers always pass Amsterdam-local date strings (YYYY-MM-DD) from
 * todayAmsterdamDateStr() in src/store/timeStore.ts.
 *
 * OTA-update: knockout fixtures are TBD as of 2026-06-12. Add entries
 * to NL_FIXTURES below as they firm up — no binary release needed.
 * // OTA-update as knockout fixtures firm up
 */

/** Tournament window boundaries, inclusive. */
export const WC_START = '2026-06-11';
export const WC_END = '2026-07-19';

/**
 * Returns true when `dateStr` falls within the tournament window
 * (inclusive on both ends). The window check is purely lexicographic
 * on ISO date strings, which is valid because 'YYYY-MM-DD' sorts the
 * same way as a numeric comparison.
 */
export function isWorldCupLive(dateStr: string): boolean {
  return dateStr >= WC_START && dateStr <= WC_END;
}

export interface WCMatch {
  /** Amsterdam-local date string (YYYY-MM-DD) of the kickoff. */
  dateStr: string;
  /**
   * Kickoff hour in Amsterdam local time (0–23). Used for the
   * late-night detection logic in matchForBanner.
   */
  kickoffHour: number;
  /** Human-readable kickoff time shown in banners, e.g. '22:00'. */
  kickoffLabel: string;
  /** Opponent name for display, e.g. 'Japan'. */
  opponent: string;
  /** Flag emoji for the opponent country. */
  opponentFlag: string;
}

/**
 * Verified Netherlands group-stage fixtures, Amsterdam-local kickoffs.
 * Source-checked 2026-06-12; knockout TBD.
 * // OTA-update as knockout fixtures firm up
 *
 * Tunisia note: kickoff is 01:00 Amsterdam local on June 26, which is
 * the night of June 25 → June 26. matchForBanner promotes this match
 * throughout the evening of June 25 so fans can find a screen terrace
 * before heading out at midnight.
 */
export const NL_FIXTURES: readonly WCMatch[] = [
  {
    dateStr: '2026-06-14',
    kickoffHour: 22,
    kickoffLabel: '22:00',
    opponent: 'Japan',
    opponentFlag: '🇯🇵',
  },
  {
    dateStr: '2026-06-20',
    kickoffHour: 19,
    kickoffLabel: '19:00',
    opponent: 'Sweden',
    opponentFlag: '🇸🇪',
  },
  {
    dateStr: '2026-06-26',
    kickoffHour: 1,
    kickoffLabel: '01:00',
    opponent: 'Tunisia',
    opponentFlag: '🇹🇳',
  },
] as const;

/**
 * Returns the match to highlight in the landing-page banner, or null.
 *
 * Promotion rules:
 *   1. If there is a match today → promote it (the "matchday" case).
 *   2. If there is a match tomorrow whose kickoff is 00:00–05:59
 *      Amsterdam local → promote it today (so evening-of-June-25 fans
 *      get the Tunisia 01:00 nudge before heading out past midnight).
 *   3. If both rules somehow apply → prefer today's match.
 *   4. Otherwise → null (no banner shown).
 *
 * This function is intentionally pure — it takes a date string so it
 * is trivially unit-testable without mocking Date.
 */
export function matchForBanner(todayStr: string): WCMatch | null {
  // Rule 1: is today a matchday?
  const todayMatch = NL_FIXTURES.find((m) => m.dateStr === todayStr) ?? null;
  if (todayMatch !== null) return todayMatch;

  // Rule 2: is tomorrow a late-night kickoff (00:00–05:59)?
  const tomorrowStr = tomorrowDateStr(todayStr);
  const lateMatch =
    NL_FIXTURES.find(
      (m) => m.dateStr === tomorrowStr && m.kickoffHour >= 0 && m.kickoffHour < 6,
    ) ?? null;
  return lateMatch;
}

/**
 * Returns the date string one calendar day after `dateStr`.
 * Pure helper — no timezone logic needed because callers pass
 * Amsterdam-local strings and we only need calendar-day addition.
 */
function tomorrowDateStr(dateStr: string): string {
  // Parse year/month/day directly to avoid any TZ ambiguity when
  // constructing a Date from a plain string.
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
