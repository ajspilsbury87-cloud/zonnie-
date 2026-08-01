# Dataset refresh pass — 2026-07-21

Follow-up to the 2026-07-08 `businessStatus` audit, closing the gaps it
couldn't reach: the 26 entries with **no placeId** (invisible to the earlier
audit) plus a recheck of the flagged temp-closed and address-drift entries.

Scripts (all dry-run-by-default, report-then-apply pattern):
- `scripts/audit-refresh-jul21.mjs` — the Places lookups (36 API calls, ~$0.72)
- `scripts/apply-refresh-jul21.mjs` — applied the safe removals + enrichments
- `scripts/dedup-refresh-jul21.mjs` — applied the duplicate removals

**Dataset: 1,996 → 1,986** (app `src/data/terraces.json` + web
`docs/terraces-lite.json`, both regenerated; full test suite + typecheck green).

---

## ✅ Applied automatically (safe, reversible via git)

**Removed 4 — Google reports CLOSED_PERMANENTLY, exact name+address match:**
- #1482 Pink's Bakery (De Baarsjes)
- #1484 Bar Bistro Belleami (De Baarsjes)
- #1506 Bar Gallizia (Indische Buurt)
- #1512 Caffé Combo (Zuid)

**Enriched 3 — attached verified placeId + rating + reviews (were unlinked):**
- #205 De Bierhut · #1477 Amstel Hotel terrace · #1503 Grammes ·
  #1510 → see dedup below

**Deduped 6 — enrichment revealed these no-placeId rows shared a Google
placeId with an existing entry (= same physical venue). Kept the older
canonical id (has curated shadow data), dropped the newer duplicate:**
| Dropped | Kept |
|---|---|
| #140 Piet de Gruyter | #632 Café Restaurant Piet de Gruyter |
| #1383 Alba | #780 Alba Restaurant & Wijnbar |
| #1394 Canvas (Volkshotel) | #91 Canvas |
| #1397 Badhuis Javaplein | #797 Badhuis Amsterdam |
| #1398 Massalia | #661 Massalia Restobar |
| #1510 Café Restaurant Sandberg | #777 Cafe Restaurant Sandberg |

Side-fix: #1383 was a World Cup viewing venue (`WC_VENUES`), so its
`outdoorScreens: 1` and the `WC_VENUES` key were remapped to the surviving
#780. (The integrity test caught the dangling reference.)

---

## 🟠 Needs your decision (NOT changed — judgment calls)

### Still temporarily closed ~2 weeks after first flag — remove or keep?
Flagged CLOSED_TEMPORARILY on 07-08, still shut on 07-21. Could be a long
renovation or a permanent close Google hasn't relabelled yet.
- #131 Bar Brandstof (De Baarsjes) · #146 Stadscafé (Westerpark) ·
  #1094 Mitts (Oost) · #1427 Paviljoen Aquarius (Nieuw-West)

### Rebrands — same address, new name. Rename+relink, or drop?
- #1485 Karaat → **Brasserie George** (Houthavenkade 103)
- #1493 De Kop van Oost → **Tête** (Zeeburgerpad 1)
- #1511 Kantina Greca → **The Greek Embassy – Coffee Deli & Gyros** (Ceintuurbaan 228)

### Large address drift — the on-file placeId now resolves far from the
### stored address. Either the venue relocated or the placeId was mis-assigned.
- #186 Vessel: Oosterdoksstraat 14 → Revaleiland 500 (Centrum → Houthavens)
- #166 George Marina: De Boelelaan 2 → Spaklerweg 10A (Zuidas → Overamstel)
- #136 Pendergast: Overtoom 344 → Groen van Prinstererstraat 14 (Oud-West → De Baarsjes)

### No-placeId + weak/wrong/no match — probably stale, likely remove after a look
The five "(no address)" ones read like speculative early entries.
- #103 GAPP (Tilanusstraat 30) — no Places match at all
- #135 Back to Black (Witte de Withstraat) — only matched a *different* branch (Van Hallstraat); this location may be gone
- #145 Café Amsterdam (Haarlemmerweg 325) — matched an unrelated small venue
- #187 Blijburg (IJburg) — matched a skatepark; the beach club's status is genuinely uncertain
- #188 Nautisch Kwartier (IJburg) — matched a hotel in **Huizen** (wrong town)
- #233 Brasserie Nonnetje (9 Straatjes, no address) — matched a venue in **Harderwijk**
- #302 Bistro Nonnetje (Oud-West, no address) — name mismatch (NEO bistro)
- #377 Eetcafé Anker (Rivierenbuurt, no address) — matched a community centre
- #434 Lounge Anker (Zuidas, no address) — matched a distillery shop
- #449 Brasserie Haven (9 Straatjes, no address) — name mismatch (De Haven van Texel)

---

## 🟢 Cleared — memory was stale, these are fine
- #1406 Star Ferry — **operational** (memory listed it as permanently closed; it isn't)
- #588 Restaurant Turquoise Meating — operational (was on the temp-closed watchlist)
- #611 Iets Aparts — on-file address matches Google

The full machine report is at `scratchpad/refresh-audit-jul21-report.json`.
