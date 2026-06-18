/**
 * World Cup 2026 viewing data, per terrace id.
 *
 * Sourced June 2026 from each venue's own website / socials and the Dutch
 * "WK kijken" viewing guides (oost-online.nl, bartsboekje.com,
 * amsterdamlokaal.nl, yourlittleblackbook.me, iamsterdam.com, and several
 * first-party pages). Every entry here has a real source — see `source`.
 *
 * HONESTY MODEL — two tiers, enforced by what's in this map:
 *   - A terrace listed here is a venue we have a *source* for → the detail
 *     sheet shows its confirmed matches + venue note + a source link.
 *   - A screen terrace NOT listed here (outdoorScreens > 0 but no entry)
 *     falls back in the UI to "Big-screen venue — likely showing the Oranje
 *     matches" with the NL fixture schedule, framed as a likelihood, never a
 *     venue-confirmed claim. We never fabricate a per-venue promise.
 *
 * AUTO-RETIRES: the UI only reads this inside `isWorldCupLive()`. After
 * 2026-07-19 it renders nothing; safe to delete the file post-tournament.
 *
 * coverage:
 *   'all'    — venue advertises showing *every* World Cup match
 *   'oranje' — venue advertises all Netherlands matches (NL_FIXTURES)
 *   number[] — only these NL_FIXTURES indices are explicitly advertised
 *              (used where a venue confirmed specific games, not the full set)
 */

import { isWorldCupLive, NL_FIXTURES, type WCMatch } from './worldcup';

export interface WCVenue {
  status: 'confirmed' | 'likely';
  coverage: 'all' | 'oranje' | number[];
  /** Short venue-specific detail from the source (offer / screens / vibe). */
  note?: string;
  /** Coverage beyond the group stage, where advertised. */
  extra?: string;
  /** Source URL the viewing info came from (shown as a subtle link). */
  source: string;
}

// NL_FIXTURES order (indices used by `coverage: number[]`):
//   0 = Netherlands–Japan (Sat 14 Jun, 22:00)
//   1 = Netherlands–Sweden (Sat 20 Jun, 19:00)
//   2 = Netherlands–Tunisia (night of 25→26 Jun, 01:00)
export const WC_VENUES: Record<number, WCVenue> = {
  // ── Oost ──────────────────────────────────────────────────────────────
  70:  { status: 'confirmed', coverage: 'oranje', note: 'WK arrangement: pitcher + burger €30', source: 'https://oost-online.nl/oranje-kijken-in-oost-deze-cafes-zenden-de-groepswedstrijden-van-nederland-uit/' },
  89:  { status: 'confirmed', coverage: 'oranje', source: 'https://oost-online.nl/oranje-kijken-in-oost-deze-cafes-zenden-de-groepswedstrijden-van-nederland-uit/' },
  92:  { status: 'confirmed', coverage: 'oranje', note: 'Two big screens · group bookings up to 20', source: 'https://oost-online.nl/oranje-kijken-in-oost-deze-cafes-zenden-de-groepswedstrijden-van-nederland-uit/' },
  508: { status: 'confirmed', coverage: [0, 1], note: 'Rooftop beach terrace · €10 advance ticket', source: 'https://amsterdamlokaal.nl/wk-kijken-amsterdam/' },
  535: { status: 'confirmed', coverage: 'oranje', note: 'Terrace big screen at The Hoxton · orange wine special', source: 'https://www.yourlittleblackbook.me/en/ek-voetbal-kijken-amsterdam/' },
  662: { status: 'confirmed', coverage: 'oranje', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },
  797: { status: 'confirmed', coverage: 'oranje', note: 'DJs after the 20 & 26 Jun matches', source: 'https://oost-online.nl/oranje-kijken-in-oost-deze-cafes-zenden-de-groepswedstrijden-van-nederland-uit/' },
  1383: { status: 'confirmed', coverage: 'all', note: 'Open-air terrace screen · all matches', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },
  1437: { status: 'likely', coverage: 'oranje', source: 'https://oost-online.nl/oranje-kijken-in-oost-deze-cafes-zenden-de-groepswedstrijden-van-nederland-uit/' },
  1386: { status: 'confirmed', coverage: 'all', note: 'Broadcasts every World Cup match', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },

  // ── Noord ─────────────────────────────────────────────────────────────
  109: { status: 'confirmed', coverage: 'oranje', extra: 'incl. quarter- & semi-finals', note: 'Free entry · NDSM beach · DJ · kitchen to 22:00', source: 'https://pllek.nl/wk-voetbal-2026-amsterdam-pllek/' },
  119: { status: 'confirmed', coverage: 'oranje', note: 'Giant indoor + outdoor screens · €5/match incl. first drink', source: 'https://ijveramsterdam.nl/wk-voetbal/' },

  // ── Westerpark / Houthavens ───────────────────────────────────────────
  141: { status: 'confirmed', coverage: 'oranje', note: 'Free entry · big screens by the water · DJs between games', source: 'https://www.iamsterdam.com/en/whats-on/festivals-and-events/watching-the-2026-world-cup-in-amsterdam-here-you-can-follow-the-netherlands' },
  143: { status: 'confirmed', coverage: [1], note: 'NL–Sweden event · €10 incl. oysters first hour + welcome G&T', source: 'https://amsterdamlokaal.nl/wk-kijken-amsterdam/' },
  1226: { status: 'confirmed', coverage: 'oranje', note: '"Oranje aan \'t IJ" · opponent-themed menu ~€25 incl. beer', source: 'https://www.debuik.nl/amsterdam/top-10/wk-2026-hier-kijk-je-voetbal-n-eet-je-goed-in-amsterdam' },
  1233: { status: 'confirmed', coverage: 'oranje', note: 'All Dutch matches on two big screens · no reservations on match days', source: 'https://cafenassau.com/' },
  1259: { status: 'confirmed', coverage: 'oranje', extra: 'incl. semi-finals & the Final (19 Jul)', note: 'WestWeelde · mega screens indoor & outdoor (20 Jun sold out)', source: 'https://westweelde.nl/' },

  // ── Centrum ───────────────────────────────────────────────────────────
  1162: { status: 'confirmed', coverage: 'oranje', note: 'Free entry · screens on the terrace, under a tent & indoors', source: 'https://www.iamsterdam.com/en/whats-on/festivals-and-events/watching-the-2026-world-cup-in-amsterdam-here-you-can-follow-the-netherlands' },
  1387: { status: 'confirmed', coverage: 'oranje', note: 'Dutch matches on the big screen · Amstelveld', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },
  1388: { status: 'confirmed', coverage: 'oranje', note: 'Packed for Oranje · Amstelveld', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },
  1389: { status: 'confirmed', coverage: 'oranje', note: 'NL group games on the terrace & garden', source: 'https://cafenieuwamsterdam.nl/wk-kijken-bij-cafe-nieuw-amsterdam/' },

  // ── Zuid / Stadionbuurt / Zuidas / Oud-Zuid ───────────────────────────
  151: { status: 'confirmed', coverage: 'oranje', note: 'Festival-like Vondelpark terrace · big screens', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
  152: { status: 'confirmed', coverage: 'oranje', source: 'https://www.man-man.nl/nederlands-elftal-wk-2026-kijken-amsterdam/' },
  501: { status: 'confirmed', coverage: 'oranje', note: 'Five big screens · beer & bitterballen · arrive early', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
  502: { status: 'confirmed', coverage: 'oranje', note: 'All three Oranje group games on the big screen', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
  542: { status: 'confirmed', coverage: 'oranje', source: 'https://www.bartsboekje.com/en/wk-ek-voetbal-kijken-amsterdam/' },
  940: { status: 'confirmed', coverage: [0, 1], note: '"Strandoranje" beach event · €15 · big screens by the water', source: 'https://www.iamsterdam.com/en/whats-on/festivals-and-events/watching-the-2026-world-cup-in-amsterdam-here-you-can-follow-the-netherlands' },
  1122: { status: 'confirmed', coverage: 'all', note: 'Every match, indoors or on the terrace', source: 'https://cafeschinkelhaven.nl/' },
  1415: { status: 'confirmed', coverage: 'all', extra: 'whole foodcourt becomes "Stadium 33"', note: 'Big screen + food stands · reserve a table for Oranje games', source: 'https://www.yourlittleblackbook.me/en/wk-kijken-amsterdam-groot-scherm-2026/' },

  // ── Oud-West ──────────────────────────────────────────────────────────
  776: { status: 'confirmed', coverage: 'oranje', source: 'https://www.man-man.nl/nederlands-elftal-wk-2026-kijken-amsterdam/' },

  // ── De Baarsjes / West ────────────────────────────────────────────────
  211: { status: 'confirmed', coverage: 'oranje', note: 'Big outdoor screen · no reservations during the WC', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
  652: { status: 'likely', coverage: 'oranje', source: 'https://barricade.amsterdam/' },

  // ── Likely (in a credible guide, but no first-party confirmation) ─────
  121:  { status: 'likely', coverage: 'oranje', note: 'Listed in a WK-kijken guide · ~€7.50 incl. drink', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
  1261: { status: 'likely', coverage: 'oranje', note: 'Becomes the "Oranjetuin" during the tournament', source: 'https://www.bartsboekje.com/wk-ek-voetbal-kijken-amsterdam/' },
};

// ─── Display model ────────────────────────────────────────────────────────────

/**
 * Coverage label for the detail sheet:
 *   'all'    — venue shows every World Cup match
 *   'oranje' — venue shows all Netherlands matches
 *   'some'   — venue confirmed only specific NL matches (number[] coverage)
 */
export type WCCoverageLabel = 'all' | 'oranje' | 'some';

/** Tier for the detail sheet header. 'fallback' means no sourced entry. */
export type WCTier = 'confirmed' | 'likely' | 'fallback';

export interface WCViewingInfo {
  /** How certain we are the venue is showing. */
  tier: WCTier;
  /** The NL fixtures this venue is advertised to show. */
  fixtures: readonly WCMatch[];
  /** What the coverage label reads as in the detail sheet. */
  coverageLabel: WCCoverageLabel;
  /** Short venue-specific detail from the source, if known. */
  note?: string;
  /** Coverage beyond the group stage, e.g. "incl. semi-finals & the Final". */
  extra?: string;
  /**
   * Source URL for the viewing info, if known.
   * Shown as a tappable "Bron / Source" link in the detail sheet.
   */
  source?: string;
}

/**
 * Returns World Cup viewing info for a terrace, or null when not applicable.
 *
 * Returns null when:
 *   - The tournament is not live on `todayStr` (auto-retires post WC_END).
 *   - The terrace has no outdoor screens (`outdoorScreens <= 0`).
 *
 * Otherwise returns a display model with:
 *   - `confirmed`/`likely` tier  → full sourced info from WC_VENUES
 *   - `fallback` tier            → a generic "big screen, likely Oranje"
 *     model for screen terraces not yet in our sourced dataset.
 *
 * Pure function — no React, no side effects, no Date.now(). Callers pass
 * `todayStr` from `todayAmsterdamDateStr()` in timeStore.
 */
export function wcViewingForTerrace(
  terraceId: number,
  outdoorScreens: number,
  todayStr: string,
): WCViewingInfo | null {
  // Auto-retire: outside the tournament window, render nothing.
  if (!isWorldCupLive(todayStr)) return null;
  // Only terraces with physical outdoor screens are relevant here.
  if (outdoorScreens <= 0) return null;

  const venue = WC_VENUES[terraceId];

  if (venue !== undefined) {
    // We have a sourced entry for this terrace — build the display model.
    let fixtures: readonly WCMatch[];
    let coverageLabel: WCCoverageLabel;

    if (venue.coverage === 'all') {
      // Venue shows every match; we highlight the NL fixtures as the draws.
      fixtures = NL_FIXTURES;
      coverageLabel = 'all';
    } else if (venue.coverage === 'oranje') {
      fixtures = NL_FIXTURES;
      coverageLabel = 'oranje';
    } else {
      // number[] — only those specific NL fixture indices were confirmed.
      fixtures = venue.coverage.map((i) => NL_FIXTURES[i]).filter(
        (m): m is WCMatch => m !== undefined,
      );
      coverageLabel = 'some';
    }

    return {
      tier: venue.status,
      fixtures,
      coverageLabel,
      note: venue.note,
      extra: venue.extra,
      source: venue.source,
    };
  }

  // Fallback: screen terrace with no sourced entry. Frame as a likelihood —
  // we never claim the venue has confirmed anything here.
  return {
    tier: 'fallback',
    fixtures: NL_FIXTURES,
    coverageLabel: 'oranje',
  };
}
