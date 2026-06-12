/**
 * voteLink — build the share URL for the "Terras?" group-vote page.
 *
 * The URL encodes only what we need to render the static web page:
 *   t  = comma-separated terrace IDs
 *   s  = comma-separated scores (0–100 integer, rounded at share time)
 *   d  = optional ISO-local datetime for the visit window (omitted in Phase A)
 *
 * Example:
 *   https://ajspilsbury87-cloud.github.io/zonnie-/vote.html#t=812,455,93&s=78,64,51
 *
 * Why a hash fragment instead of query params?
 *   The page is a GitHub Pages static file — the server never sees the URL.
 *   Hash params are client-side only, so the page JS reads them with
 *   `location.hash`. This also means no referrer / tracking leakage.
 *
 * Score semantics:
 *   The score is a point-in-time snapshot: it represents the sun score at the
 *   moment the user tapped "Ask the group", not a live or predicted value.
 *   The web page labels it explicitly so friends aren't misled.
 *
 * Ordering:
 *   IDs and scores are paired by position — ids[0] corresponds to scores[0].
 *   The order matches the user's selection order (from the shortlist store),
 *   not the ranked-list order.
 */

const BASE_URL = 'https://ajspilsbury87-cloud.github.io/zonnie-/vote.html';

export interface VoteItem {
  id: number;
  /** Sun score at the moment of share, 0–1. */
  score: number;
}

/**
 * Build the share URL.
 *
 * @param items  The shortlisted terraces with their scores. 1–3 items.
 * @param date   Optional visit datetime (Phase A: omit entirely).
 *               When provided, encoded as ISO local time in the `d` param.
 *
 * @returns Full URL string ready for Share.share().
 *
 * @example
 *   buildVoteUrl([{ id: 812, score: 0.78 }, { id: 455, score: 0.64 }])
 *   // → "https://ajspilsbury87-cloud.github.io/zonnie-/vote.html#t=812,455&s=78,64"
 */
export function buildVoteUrl(items: VoteItem[], date?: Date): string {
  if (items.length === 0) {
    // Guard: caller should never send an empty list, but be safe.
    return BASE_URL;
  }

  const ids = items.map((item) => item.id).join(',');
  // Round score to 0–100 integer. Math.round avoids the 0.5 edge case that
  // truncation would hit at exactly 50% sun score.
  const scores = items.map((item) => Math.round(item.score * 100)).join(',');

  let hash = `t=${ids}&s=${scores}`;

  if (date != null) {
    // ISO local time without timezone offset — the page renders it as "local
    // Amsterdam time" without needing to resolve the tz offset client-side.
    // Slice to 'YYYY-MM-DDTHH:MM' (drop seconds + ms) for brevity.
    const iso = formatLocalIso(date);
    hash += `&d=${encodeURIComponent(iso)}`;
  }

  return `${BASE_URL}#${hash}`;
}

/**
 * Format a Date as 'YYYY-MM-DDTHH:MM' in LOCAL time (no timezone suffix).
 * Used for the `d` param on vote URLs — the page treats it as Amsterdam local.
 */
function formatLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
