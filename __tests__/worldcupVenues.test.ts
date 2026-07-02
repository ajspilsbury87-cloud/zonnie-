/**
 * Tests for wcViewingForTerrace (src/data/worldcupVenues.ts) and
 * the integrity of WC_VENUES against the terraces dataset.
 *
 * All tests are pure — no React Native, no async, no mocking needed.
 * wcViewingForTerrace accepts date strings so tournament-window gating
 * is fully testable without touching the system clock.
 */

import { TERRACES } from '@/src/data/terraces';
import { NL_FIXTURES } from '@/src/data/worldcup';
import {
  wcViewingForTerrace,
  WC_VENUES,
} from '@/src/data/worldcupVenues';

// ─── Constants used across tests ─────────────────────────────────────────────

/** A date safely inside the tournament window. */
const IN_WINDOW = '2026-06-20';
/** A date safely outside the tournament window. */
const OUT_WINDOW = '2026-07-25';

// ─── wcViewingForTerrace — null cases ────────────────────────────────────────

describe('wcViewingForTerrace — returns null when inapplicable', () => {
  test('returns null outside the tournament window', () => {
    // Pllek (109) has outdoor screens and a WC_VENUES entry — but the
    // tournament isn't live, so null is the correct answer.
    expect(wcViewingForTerrace(109, 2, OUT_WINDOW)).toBeNull();
  });

  test('returns null for a terrace with no outdoor screens (even inside window)', () => {
    // Use a dummy id not in WC_VENUES and pass screens = 0.
    expect(wcViewingForTerrace(999999, 0, IN_WINDOW)).toBeNull();
  });

  test('returns null for screens <= 0 even if terrace is in WC_VENUES', () => {
    // 109 is a confirmed WC venue, but if we call with 0 screens it's null.
    expect(wcViewingForTerrace(109, 0, IN_WINDOW)).toBeNull();
  });
});

// ─── wcViewingForTerrace — confirmed venue ────────────────────────────────────

describe('wcViewingForTerrace — confirmed sourced venue (109 Pllek)', () => {
  const result = wcViewingForTerrace(109, 2, IN_WINDOW);

  test('returns non-null', () => {
    expect(result).not.toBeNull();
  });

  test('tier is confirmed', () => {
    expect(result?.tier).toBe('confirmed');
  });

  test('coverage label is oranje (Pllek shows NL matches)', () => {
    expect(result?.coverageLabel).toBe('oranje');
  });

  test('fixtures are the full NL_FIXTURES array', () => {
    expect(result?.fixtures).toHaveLength(NL_FIXTURES.length);
    expect(result?.fixtures[0]?.opponent).toBe(NL_FIXTURES[0]?.opponent);
  });

  test('has a note (free text detail from source)', () => {
    expect(typeof result?.note).toBe('string');
    expect(result!.note!.length).toBeGreaterThan(0);
  });

  test('has a source URL', () => {
    expect(typeof result?.source).toBe('string');
    expect(result!.source!.startsWith('https://')).toBe(true);
  });

  test('has extra (quarter- & semi-finals advertised)', () => {
    // Pllek explicitly mentions quarter- & semi-finals.
    expect(result?.extra).toBeTruthy();
  });
});

// ─── wcViewingForTerrace — number[] coverage ─────────────────────────────────

describe('wcViewingForTerrace — number[] coverage (143, coverage: [1])', () => {
  const result = wcViewingForTerrace(143, 1, IN_WINDOW);

  test('returns non-null', () => {
    expect(result).not.toBeNull();
  });

  test('coverage label is "some"', () => {
    expect(result?.coverageLabel).toBe('some');
  });

  test('returns only the specified fixture (index 1 = Sweden)', () => {
    expect(result?.fixtures).toHaveLength(1);
    expect(result?.fixtures[0]?.opponent).toBe('Sweden');
  });
});

// ─── wcViewingForTerrace — fallback tier ─────────────────────────────────────

describe('wcViewingForTerrace — fallback (screen terrace not in WC_VENUES)', () => {
  test('terrace 593 exists in the dataset', () => {
    const deck = TERRACES.find((t) => t.id === 593);
    expect(deck).toBeDefined();
  });

  test('returns non-null for a screen terrace not in WC_VENUES', () => {
    // Use explicit screens=1 to keep this test independent of JSON edits.
    expect(wcViewingForTerrace(593, 1, IN_WINDOW)).not.toBeNull();
  });

  test('tier is fallback', () => {
    const result = wcViewingForTerrace(593, 1, IN_WINDOW);
    expect(result?.tier).toBe('fallback');
  });

  test('coverage label is oranje (generic Oranje assumption)', () => {
    const result = wcViewingForTerrace(593, 1, IN_WINDOW);
    expect(result?.coverageLabel).toBe('oranje');
  });

  test('has all NL fixtures (we assume they show all group games)', () => {
    const result = wcViewingForTerrace(593, 1, IN_WINDOW);
    expect(result?.fixtures).toHaveLength(NL_FIXTURES.length);
  });

  test('has no source (nothing sourced)', () => {
    const result = wcViewingForTerrace(593, 1, IN_WINDOW);
    expect(result?.source).toBeUndefined();
  });

  test('has no note (nothing sourced)', () => {
    const result = wcViewingForTerrace(593, 1, IN_WINDOW);
    expect(result?.note).toBeUndefined();
  });
});

// ─── WC_VENUES integrity ─────────────────────────────────────────────────────

describe('WC_VENUES integrity — every sourced id is a real screen terrace', () => {
  const terraceMap = new Map(TERRACES.map((t) => [t.id, t]));

  test('every WC_VENUES key resolves to a real terrace', () => {
    for (const idStr of Object.keys(WC_VENUES)) {
      const id = Number(idStr);
      expect(terraceMap.has(id)).toBe(true);
    }
  });

  test('every WC_VENUES terrace has outdoorScreens > 0', () => {
    for (const idStr of Object.keys(WC_VENUES)) {
      const id = Number(idStr);
      const terrace = terraceMap.get(id);
      // The honesty model demands this — we only list screen terraces.
      expect((terrace?.outdoorScreens ?? 0)).toBeGreaterThan(0);
    }
  });

  test('every number[] coverage index is valid (0 to NL_FIXTURES.length - 1)', () => {
    for (const venue of Object.values(WC_VENUES)) {
      if (Array.isArray(venue.coverage)) {
        for (const idx of venue.coverage) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(NL_FIXTURES.length);
        }
      }
    }
  });

  test('every source is an https URL', () => {
    for (const venue of Object.values(WC_VENUES)) {
      expect(venue.source.startsWith('https://')).toBe(true);
    }
  });
});

// ─── Data fix assertions ──────────────────────────────────────────────────────

describe('Data fixes', () => {
  test('#1260 is absent from terraces (WestWeelde dedupe)', () => {
    const found = TERRACES.find((t) => t.id === 1260);
    expect(found).toBeUndefined();
  });

  test('#1259 is named WestWeelde', () => {
    const t = TERRACES.find((t) => t.id === 1259);
    expect(t?.name).toBe('WestWeelde');
  });

  test('terrace count is 1029', () => {
    // 993 → 988 (removed 5 stale) → 987 (deduped LuminAir) → 1028: added 41
    // newly-sourced real terraces (ids 1479–1519, geocoded via OSM) → 1029:
    // added Juno (De Pijp, id 1520), a genuine gap a user flagged.
    expect(TERRACES.length).toBe(1029);
  });

  test('#70 Bar Botanique is in area Oost', () => {
    const t = TERRACES.find((t) => t.id === 70);
    expect(t?.area).toBe('Oost');
  });

  test('#121 Lagerwal has the correct address', () => {
    const t = TERRACES.find((t) => t.id === 121);
    expect(t?.address).toBe('tt. Melissaweg 57, 1033 SP Amsterdam, Netherlands');
  });

  test('#211 Karavaan has the correct address', () => {
    const t = TERRACES.find((t) => t.id === 211);
    expect(t?.address).toBe('Kwakersplein 2, 1053 TZ Amsterdam, Netherlands');
  });
});
