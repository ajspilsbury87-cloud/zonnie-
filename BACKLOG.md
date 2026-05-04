# Zonnie — Feature Backlog

Synthesized from competitor analysis (Sun Seekr, Coffee in the Sun, Seats in the Sun) plus the venue-coverage diff against our 378-curated set. Each item has a tier, an effort estimate, and the competitor evidence that motivates it.

---

## Tier 0 — Bug fixes blocking the user

| # | Item | Effort | Evidence |
|---|---|---|---|
| 0.1 | Time-range chip taps still crash the native build | 1–3 days, needs device crash log first | Andy's repeated reports |
| 0.2 | Pin colors are not legible against map / users can't tell sunny vs shade | 0.5 day | Andy's report; cocoa-on-tile contrast issue |

---

## Tier 1 — Build the parity moat (next 2–3 weeks)

These match the table-stakes Coffee in the Sun and Seats in the Sun already ship. Without them Zonnie looks under-baked next to either competitor.

| # | Item | Effort | Evidence |
|---|---|---|---|
| 1.1 | **Time scrubber** — drag a slider, watch pin colors / shadow overlay update live across the day | 1 week | Coffee in the Sun's signature feature ("Time travel"); Seats in the Sun's `sundata.sunlevels[]` half-hourly array; Sun Seekr's per-venue chart |
| 1.2 | **Per-terrace 24h sun chart** in the detail sheet (already half-built as SunTimeline — ship it as a band-highlighting chart, not raw bars) | 0.5 day | All three competitors expose this; Sun Seekr's hero feature |
| 1.3 | **Favorites / saved spots** with simple AsyncStorage persistence | 1 day | Sun Seekr 4★ Josh Everard "wants a favourites tab"; Coffee in the Sun gates it as Pro |
| 1.4 | **Find my location** as default cold-start (geolocation-first map) | 0.5 day | Seats in the Sun's homepage flow; Sun Seekr 4★ pulsand: "shows LA weather while in Denver" |
| 1.5 | **Filter chip row** above the map (cafés / bars / restaurants / outdoor / late-open) | 1 day | Coffee in the Sun's category filters; Seats in the Sun's bench/toilet/water/shelter chips |
| 1.6 | **Address + phone + opening hours** on detail card (currently just shows our internal fields; we have placeId-based fetch but it needs the API key in the build) | 0.5 day | Sun Seekr complaints about "what's actually here"; we already coded the fetcher |

---

## Tier 2 — Differentiate (3–6 weeks)

Things that genuinely beat what's on the App Store today.

| # | Item | Effort | Evidence |
|---|---|---|---|
| 2.1 | **Curation badge on detail card** ("Verified by Zonnie · last checked 2026-05-04") + visible "report a problem" link | 1 day | Sun Seekr's #1 complaint pattern is closed/wrong venues — make our edge visible |
| 2.2 | **Visit-window scoring** that ranks all terraces by AVERAGE sun across `from–to` (already shipped; promote it in onboarding) | 0 — keep what we have | Structurally beats Sun Seekr's "right now"-only model |
| 2.3 | **Better-when-cloudy mode**: when forecast > 70% cloud, switch ranking to "warmest indoor-feel terrace" (south-facing + low wind + heat lamp data?) | 2 days, needs heat-lamp data | Differentiation play — no competitor does cloudy-day ranking |
| 2.4 | **Wind-shelter score** for each terrace (Open-Meteo gives wind speed + direction; combine with `facing` to score "sheltered from today's wind") | 1.5 days | None of the three competitors do this; Amsterdam wind is a real terrace-killer |
| 2.5 | **Public utility overlay** — benches/toilets/water-taps from OpenStreetMap as toggleable layer | 1.5 days | Seats in the Sun does this and it adds genuine value for non-spend afternoons |
| 2.6 | **Today's "1 hour ago" history badge** ("This terrace was 80% sunny an hour ago") so users can decide on the fly | 0.5 day after time scrubber | None of the three do this; small but lovely |

---

## Tier 3 — Engagement & growth (6–12 weeks)

Sticky patterns from competitors that lift retention.

| # | Item | Effort | Evidence |
|---|---|---|---|
| 3.1 | **Home screen + lock screen widgets** — "Top 3 sunniest near you right now" | 2 days | Coffee in the Sun gates this as Pro; sticky for a seasonal app |
| 3.2 | **Saved-spot push notifications** ("Your saved Café 't Smalle is 90% sunny right now") | 2 days | Sun Seekr advertises this; we already have the score engine |
| 3.3 | **"Suggest a terrace" submission flow** with light moderation | 2 days | Seats in the Sun has 1,095 because of this loop; we'd be slower but more curated |
| 3.4 | **Contributor leaderboard** (after Suggest is shipped and we have submissions) | 1 day | Seats in the Sun's tiny reputation game |
| 3.5 | **Share a terrace card** — beautiful image with sun-% + time, designed for Stories/WhatsApp | 1 day | Coffee in the Sun gates as Pro; viral potential is real for a summer app |
| 3.6 | **Today's best terrace email digest / push** (opt-in) | 1 day | None of the three have this |

---

## Tier 4 — Pricing & monetization (when ready to monetize)

| # | Item | Effort | Evidence |
|---|---|---|---|
| 4.1 | Free + Pro ($0.99/mo, $5.99/yr, **$17.99 lifetime**) — exact price match to Coffee in the Sun, beats them on curation | 0.5 day code, ASC config | Coffee in the Sun's tiering proves the price point works |
| 4.2 | **Pro paywall**: unlimited time travel · widgets · favorites · share · push · search history | 1 day | Same gating as Coffee in the Sun |
| 4.3 | **B2B "claim your terrace"** for owners (£/€350/yr, photo upload, owner-verified badge) | 1 week | Sun Seekr's only revenue stream; Seats in the Sun has a stub `/owner` page |

---

## Tier 5 — Data quality & coverage

This is where we have the biggest **moat opportunity**. The diff against Seats in the Sun's 1,095 Amsterdam venues showed:

| Bucket | Count |
|---|---|
| Their venues already in ours | **130** (12% overlap) |
| Their venues NOT in ours | **952 candidates** |
| Of those, ≥90% peak-sun (high-quality leads) | **751** |
| Noise filtered (museums, stations, hotels) | 11 |
| Chains filtered | 2 |

Files saved at `scripts/competitor-research/`:
- `seatsinthesun_amsterdam_full.{csv,json}` — full 1,095
- `venues-not-in-zonnie.json` — 952 candidates, sorted by peak-sun

| # | Item | Effort | Evidence |
|---|---|---|---|
| 5.1 | **Triple our terrace count** — import top 200–300 from `venues-not-in-zonnie.json`, validate each via Places API, manually spot-check coordinates, assign `area`, infer `facing` | 2–3 days | Seats in the Sun has 1,095 vs our 378 — matters for App Store positioning |
| 5.2 | **Re-validate the 94 currently-unsourced terraces** (already had a script, just needs env var + run) | 1 hour | Already noted in earlier sessions |
| 5.3 | **Postcode → neighborhood mapping** so any imported venue auto-categorizes (101x = Centrum, 105x = West, 107x = Oost, 109x = Watergraafsmeer, 110x = Zuidoost) | 0.5 day | Seats in the Sun has no neighborhood field — postcode is the only proxy |
| 5.4 | **Manual `facing` inference** — for imported venues, use the per-terrace adjacent-building shadow approach we already ship; needs human assignment of facing per venue | scales with batch size | Without `facing`, scoring degrades |

---

## Steal vs Don't-Steal (consolidated)

### From Coffee in the Sun

**Steal:**
- ✅ Time scrubber (Tier 1.1)
- ✅ Lifetime Pro at $17.99 (Tier 4.1)
- ✅ Home/lock-screen widgets (Tier 3.1)
- ✅ Pricing structure ($0.99/$5.99/$17.99) (Tier 4.1)

**Don't:**
- ❌ Apple Maps generic POI dataset (their main weakness)
- ❌ Sports/playground filters (product drift)
- ❌ 30+ language localization (premature for one city)

### From Seats in the Sun

**Steal:**
- ✅ Half-hourly sun granularity (`sundata.sunlevels[]` shape) (Tier 1.1)
- ✅ Public utility overlay — benches/toilets/water (Tier 2.5)
- ✅ "Suggest a terrace" + leaderboard (Tier 3.3, 3.4)
- ✅ Their 1,095 venue list as **leads** (Tier 5.1)

**Don't:**
- ❌ User-drawn polygon submission (desktop UX, moderation nightmare)
- ❌ Wholesale import of all 1,095 (quality dies — train stations, museums, dead chains)
- ❌ Volume-race ("we have more places than them") — quality > quantity

### From Sun Seekr

**Steal:**
- ✅ Per-venue hourly sun chart (Tier 1.2)
- ✅ Push notifications on saved spots (Tier 3.2)
- ✅ Terrace-shape polygons w/ sun-% fill (deferred — high authoring cost; consider for Tier 5 once we have 800+ venues)

**Don't:**
- ❌ Going global (their data quality is the casualty)
- ❌ "Right now" only mental model (we already do better)

---

## Suggested execution order (next 4 weeks)

**Week 1** — Stability & polish: Tier 0.1 (crash debug), 0.2 (pin colors), 1.4 (geolocate-on-launch), 1.6 (Places API key into build).

**Week 2** — Time scrubber + chart: Tier 1.1 + 1.2. Single biggest visible feature.

**Week 3** — Coverage push: Tier 5.1 (import 200-300 best from competitor list, validate via Places, manual spot-check). Tier 5.3 (postcode→neighborhood).

**Week 4** — Engagement: Tier 1.3 (favorites), 3.1 (widgets), 1.5 (filters).

**Then** — App Store submission with the new dataset count (~600 verified terraces) + time scrubber as the screenshot hero.

---

## Positioning statement (for App Store description)

> **Zonnie is the locals' sun app for Amsterdam terrace-goers who want the ranked best place to drink in the sun in the next hour.** Built on hand-verified Amsterdam terraces and real building geometry. Unlike global apps that rely on stale OpenStreetMap data, every Zonnie terrace is checked by humans. Unlike "right now" tools, Zonnie ranks terraces for your visit window — "I'll be there 14:00–17:00, where will be sunny?"

---

*Last updated: 2026-05-04. Sources: Sun Seekr App Store listing + 18 reviews; Coffee in the Sun (coffeeinthesun.app) v2.3; Seats in the Sun (seatsinthesun.com) full API scrape; Zonnie venue diff (`scripts/diff-competitor-venues.ts`).*
