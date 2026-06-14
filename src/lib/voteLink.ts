/**
 * voteLink — build the share URL for the "Terras?" group-vote page.
 *
 * The URL encodes only what we need to render the static web page:
 *   t  = comma-separated terrace IDs
 *   w  = visit window as "fromHour-toHour" (24h local), e.g. "14-17"
 *   d  = optional ISO date (YYYY-MM-DD); absent ⇒ "today" on the page
 *
 * Scores are NOT in the URL. The vote page computes the score itself
 * from the per-hour snapshot baked into terraces-lite.json. This means:
 *   (a) the score is always fresh (re-derived on open, not frozen at
 *       share-time), and
 *   (b) the URL stays valid even if the scoring engine is improved.
 *
 * Example:
 *   https://ajspilsbury87-cloud.github.io/zonnie-/vote.html#t=812,455,93&w=14-17&d=2026-06-20
 *
 * Why a hash fragment instead of query params?
 *   The page is a GitHub Pages static file — the server never sees the URL.
 *   Hash params are client-side only, so the page JS reads them with
 *   `location.hash`. This also means no referrer / tracking leakage.
 *
 * Legacy fallback:
 *   Old URLs used `s=` for scores (e.g. `#t=812,455&s=78,64`). The vote
 *   page still handles those gracefully by reading `s=` directly when
 *   `w=` is absent, so previously-shared links continue to render.
 */

const BASE_URL = 'https://ajspilsbury87-cloud.github.io/zonnie-/vote.html';

/**
 * Build the group-vote share URL.
 *
 * @param ids       The shortlisted terrace IDs. 1–3 items.
 * @param fromHour  Visit window start (Amsterdam local hour, integer 0–23).
 * @param toHour    Visit window end (Amsterdam local hour, integer 0–23).
 * @param date      Optional visit date. When provided, encoded as YYYY-MM-DD
 *                  in the `d` param. When absent the vote page uses "today".
 *
 * @returns Full URL string ready for Share.share().
 *
 * @example
 *   buildVoteUrl([812, 455], 14, 17, new Date('2026-06-20'))
 *   // → ".../vote.html#t=812,455&w=14-17&d=2026-06-20"
 *
 *   buildVoteUrl([812, 455], 14, 17)
 *   // → ".../vote.html#t=812,455&w=14-17"
 */
export function buildVoteUrl(
  ids: number[],
  fromHour: number,
  toHour: number,
  date?: Date,
): string {
  if (ids.length === 0) {
    // Guard: caller should never send an empty list, but be safe.
    return BASE_URL;
  }

  const t = ids.join(',');
  const w = `${fromHour}-${toHour}`;

  let hash = `t=${t}&w=${w}`;

  if (date != null) {
    // ISO date only (no time component) — the page uses `w` for the hour
    // window, so the date just identifies the calendar day.
    hash += `&d=${formatLocalDate(date)}`;
  }

  return `${BASE_URL}#${hash}`;
}

/**
 * Format a Date as 'YYYY-MM-DD' in LOCAL time.
 * Used for the `d` param on vote URLs — identifies the calendar day.
 */
function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
