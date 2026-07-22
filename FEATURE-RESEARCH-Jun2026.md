# Zonnie — Feature Research & Proposal (June 2026)

> Deep-research synthesis on net-new features to drive user traction, built on top of
> what Zonnie already ships. Researched across four angles (comparable-app teardown,
> the bar-crawl/itinerary space, viral growth mechanics, and retention/monetisation),
> each evidence-based with cited examples. This doc is the founder-facing summary +
> recommended build order. Companion to the older `FEATURES-ENGAGEMENT.md` (most of
> which is now shipped).
>
> **Plain-English note:** where you see **OTA** = "over-the-air", it means we can ship
> the feature as a silent update without a new App Store review (fast, same-week).
> **Native build** = needs a new app binary + Apple review (slower, ~days-to-weeks).
> Effort: **S** = a few days, **M** = ~1–2 weeks, **L** = several weeks.

---

## TL;DR — what to build, in order

1. **Build the quiet foundation first: a "sun log".** A tiny on-device record of which
   terraces a user opens/favourites/visits. *No UI.* Almost every high-value feature
   below (daily verdict, Wrapped, streaks, "remember this place") is shallow or
   impossible without it. Cheap, OTA, ships now. **This is the single most important
   sequencing call in this whole doc.**
2. **"Sun's leaving — move!" live nudge** (the cheap wedge). Sitting on a terrace,
   Zonnie warns *"sun leaves here in 20 min — Café Y is sunny till 19:30, 4 min away."*
   The purest expression of the one thing only Zonnie can do. Mostly OTA.
3. **"Chase the Sun" crawl** (the flagship). A route that keeps you in sunlight as it
   moves across the afternoon. Your "bar crawl" instinct — elevated into something
   **no competitor has, and only Zonnie's shadow data can build.** Likely OTA for a
   static v1.
4. **"First Sunny Day" city-wide push moment** (the growth loop). A BeReal-style
   synchronized notification on the season's first real sunny afternoon → one-tap share
   to the group chat. Cheapest re-activation lever you have.
5. **Winter "Cosy Mode" + "Sun Wrapped" recap** (seasonal survival). Without these the
   app is deletable Nov–Feb — and a competitor is *already* doing winter sun.

Everything else (monetisation, presence, AR) is real but sits behind these.

---

## Strategic context — the competitive picture changes the priorities

The research turned up **direct competitors we should treat as real**, not hypothetical:

| Competitor | Coverage | What they have | What they DON'T have |
|---|---|---|---|
| **SunSeekr** | London, Berlin, Barcelona, **Amsterdam** | Same "sun-by-hour" shadow data model | **No routing / crawl / itinerary** |
| **Coffee in the Sun** | Amsterdam, Barcelona | Shadow-aware "time-travel" sun, **winter-sun marketing** | No social / crawl layer |
| **Seats in the Sun** | Amsterdam | Sunny-terrace listings | No per-hour shadow depth, no social |

Two things fall out of this:

- **The crawl is genuinely defensible blue ocean.** The entire sun-mapping category is
  single-venue discovery. The entire pub-crawl category has mature routing but *zero
  sun-awareness*. **Nobody has combined them.** That intersection requires the
  building-shadow time model only Zonnie and SunSeekr possess — and SunSeekr hasn't
  shipped it. This is where Zonnie should plant its flag.
- **Winter sun + a daily-habit anchor are now table stakes, not extras.** Coffee in the
  Sun already markets "compare your spot in June vs December." A sun app with no
  off-season answer gets deleted in November. Reframe Cosy Mode from "nice idea" to
  "defensive necessity."

**Zonnie's actual moat:** (a) 993-terrace data density in one city, (b) it's already
further along on the *social + Pro* layer than the weather-style competitors, and (c)
the per-hour shadow engine that makes the crawl possible. The strategy below leans into
all three.

---

## The Foundation (build FIRST, before the features that need it)

### F0 — The "sun log" (silent activity tracking)
- **What:** a persisted, on-device list of lightweight events — `{date, terraceId,
  scoreAtTime, action}` for opens, favourites, shares, "directions" taps. Capped FIFO
  (~2,000 entries). All local, no server, no new permission. (The old engagement doc
  already specced this as `sunLogStore`.)
- **Why first:** the **daily verdict**, **Sun Wrapped**, **streaks/passport**, and
  **"remember this place" resurfacing** are all mutually reinforcing — they read from
  the same history. Three of the four research angles independently flagged: *build the
  tracking first or these features stay shallow.* If you ship them without a season of
  data behind them, they feel empty.
- **Effort:** **S, OTA.** No UI beyond a hidden debug screen. Ship it now so data
  accumulates through the summer and the autumn features land full, not hollow.

---

## Tier 1 — Quick wins (mostly OTA, ship this season)

These reuse infrastructure you already have (push, scoring, share pipeline, filters)
and directly monetise the per-hour shadow engine.

### 1. Per-terrace sun alerts — "notify me when the sun hits"
- **What:** "Café X goes sunny at 14:20 today", or a standing rule "alert me when any
  terrace near me hits 80+ in the next 2 hours."
- **Why it gets traction:** Resy's **Notify** ("tell me when this opens up") is one of
  its most-loved power-user features and a documented return-visit driver. **No weather
  app or maps app can send "sun is about to hit *this specific table*" — only Zonnie
  knows that minute.** It's the inverse of the "sun leaves in 40 min" countdown you
  already compute — same engine.
- **Effort:** **M, mostly OTA.** Push infra exists; scheduling logic is JS. A
  server-side "any terrace near me" rule may need a small scheduler later.

### 2. "Sun's leaving — move!" live single-nudge  ⭐ the cheap wedge
- **What:** You're at a terrace; Zonnie pings *"sun leaves here in 20 min — nearest
  still-sunny terrace is Café Y, 4 min away"* with a one-tap "take me there."
- **Why it gets traction:** It's the atomic, zero-planning version of the whole
  chase-the-sun concept — useful even to a solo user with no plan, and it *trains the
  behaviour* that makes the full crawl (Tier 2) feel natural. Lowest-friction proof that
  Zonnie's data is magic. Strong retention/notification hook.
- **Effort:** **S–M.** Reuses sun-leaves data + existing notifications. No routing
  engine. **Ship this before the full crawl as a teaser.**

### 3. "Today's Verdict" — one-glance daily card + morning briefing
- **What:** A "Today" view that opens to a single verdict: *"Best sun today: 4 terraces
  hitting 90+ between 14:00–18:00"* + your favourites' sun windows + 2–3 fresh picks.
  Optional 8–9am opt-in push.
- **Why it gets traction:** The habit anchor. Weather + discovery apps that show a
  glanceable daily verdict (and a morning push) see strong daily-engagement lifts — it
  gives a reason to open Zonnie *every* day, not just when going out. Defends directly
  against the competitors' "open us daily" play.
- **Effort:** **S–M, OTA.** Presentation layer over scoring + favourites you already
  compute. Personalised picks get better once F0 (sun log) has data.

### 4. Dynamic "Perfect For…" guides
- **What:** Tappable, *live-data* collections — "Sunny right now + big screen", "Where's
  the sun at 19:30 tonight", "Shady tables for a hot day", "Golden-hour photo spots".
- **Why it gets traction:** The Infatuation's "Perfect For" occasion tags make discovery
  feel human, not like a query builder. Zonnie's version is **better than their static
  editorial because it updates hourly from live data.** It turns your existing filters
  into inviting, low-effort entry points.
- **Effort:** **S–M, OTA.** Mostly a new presentation layer over existing filters/scoring.

---

## Tier 2 — The Flagship: "Chase the Sun" crawl  ⭐⭐

> Your "bar crawl" instinct was right — but the *generic* version (pick some bars, make a
> route) is a commodity a dozen apps already do. The version worth building is the one
> **only Zonnie can:** a route that keeps you in the sun as it moves.

**One-line:** Zonnie knows the exact minute the sun leaves each terrace, so it can build
an afternoon→evening route that keeps you in sunlight the whole way — *start sunny here at
15:00, hop to the next terrace at 17:00 just as this one falls into shade, finish at a
west-facing golden-hour spot.*

### How it works (kept simple — a greedy, explainable algorithm, not an optimiser)
1. **Input (3 taps):** start ("now" / a time + a start point), length (2–5 stops or
   "until sunset"), optional vibe filters (neighbourhood, canal-side, drinks vs food) —
   all reusing existing terrace metadata.
2. **Anchor stop 1:** from terraces sunny *now* near the start, pick a high score that
   *also loses sun soonest* — "use it before you lose it." Dwell = until its sun-leaves
   time (clamped 45–90 min).
3. **Hand-off:** at that sun-leaves moment, find a terrace within an easy walk (≤~6 min)
   that's *still sunny on arrival* and stays sunny longest. Repeat.
4. **Golden-hour finish:** bias the last stop to a west/southwest terrace that holds sun
   latest, so the crawl ends in golden light.
5. **Weather gate:** rain/cold window → not a sun stop; drop or flag it.

### The UI (this is where it sings)
- **A horizontal "sun bar" timeline** for the whole crawl, like a transit journey:
  `☀️ 15:00–17:00 De Pijp → 6 min walk → ☀️ 17:00–19:30 …`, each segment coloured by
  sun intensity, with a subtle *"leave by 16:58 to stay in the sun"* frontier marker.
- **Map:** numbered sun-coloured pins + the walking line; each pin shows a mini
  sun-clock / shade-fill (how long till it goes dark).
- **Live mode** (later): as a hand-off approaches, the Tier-1 nudge fires.
- **Navigation:** hand off to Apple/Google Maps for turn-by-turn — don't rebuild nav.

### The growth engine — the "Sun Route" share card
A vertical, story-sized, genuinely *pretty* card: the day's route as a sun timeline,
stop names + times, neighbourhood, golden-gradient Amsterdam styling, Zonnie watermark +
a deep link that opens the live crawl in-app (or the App Store if not installed). This
mirrors the "copyable aesthetic itinerary" trend (Boop, Mindtrip) — **the card is the
marketing; one planner exposes the whole group to Zonnie.**

### Effort & the honest risk
- **Effort: M.** The routing generator + timeline UI + share card is real work, but it
  sits **entirely on data Zonnie already has** (per-terrace hourly sun + locations + the
  existing map + the existing share-image pipeline). A **static v1** (generate once, no
  live nudges) is **likely OTA-shippable** — it's React Native screens over existing
  data, no obvious new native module. *Verify no new native dep before promising OTA.*
  Live mode (notifications) reuses existing push.
- **⚠️ The one thing to validate before committing to the promise:** does the *real*
  993-terrace dataset actually produce clean sun-loss hand-offs within walking distance
  often enough to deliver "always in the sun"? **Test the generator against the live data
  first.** If hand-offs are frequently >10-min walks, reframe the promise as *"the
  sunniest route we can find"* rather than *"never leave the sun."* This is a half-day
  data experiment and it de-risks the whole flagship.

### Crawl variants (reuse the same engine)
- **Curated "Sun Routes"** (S, OTA): hand-named editorial crawls — "Canal-Side Sunset
  Crawl", "De Pijp Sunny Gems" — that still auto-retime to today's sun. Solves the
  blank-page problem, gives shareable/SEO content, seeds neighbourhood identity.
- **Group Sun Crawl** (M): crawl × your existing group-vote — one person generates,
  shares a code/QR, friends join and vote on stops. This is the real social occasion
  (18–30s go in groups) and makes each crawl pull in 3–6 people.
- **Reservation hand-off** (S as link-only): a "reserve" action on the golden-hour
  finale stop — reuses the reservation links you just shipped. Solves "we arrived and it
  was full." A future monetisation lane.

---

## Tier 3 — Retention & seasonal survival (build by autumn)

### 5. "First Sunny Day" + city-wide "Sun's out" push moment  ⭐ growth
- **What:** On the season's first genuinely sunny afternoon after a grey spell, push
  *every* Amsterdam user at once — *"☀️ 23° and the sun's hitting [top terrace] right
  now. Where are you drinking?"* — deep-linking to a pre-filled share card → WhatsApp.
- **Why it gets traction:** BeReal's entire engine was one *synchronized* notification
  creating a shared cultural moment (peak ~73M MAU). Zonnie's core data (hour-by-hour
  sun) *is* a perfect, authentic trigger. Synchronisation makes forwarding to the group
  chat *timely* — "decide fast, the sun's out *now*" is exactly what a seasonal social
  audience acts on. The cheapest re-activation lever you have.
- **Effort:** **S–M.** Weather-gated trigger + push + deep-link; mostly OTA if the push
  category exists. **Cap frequency hard** (5–15×/season, not daily) — fatigue is the risk.

### 6. "Sun Wrapped" — end-of-season recap  ⭐ acquisition + anti-churn
- **What:** An Instagram-story-style recap at season close: *"You chased the sun to 23
  terraces, your sunniest day was June 8, top spot Hannekes Boom, top 5% of Amsterdam
  sun-chasers."*
- **Why it gets traction:** Spotify Wrapped is the canonical play — it drives a download
  bump and tens of millions of shares because it showcases the *user's* identity, and
  "the more you used it, the better your recap" is a churn-killer. It lands *exactly* when
  seasonal deletion risk peaks. Reuses your share-image pipeline; depends on F0's log.
- **Effort:** **M, OTA-able.** Add a "compare with friends" overlap line for the
  belong/stand-out tension that makes Wrapped travel.

### 7. Winter "Cosy Mode" — the off-season pivot  ⭐ survival
- **What:** Nov–Feb the app flips to surfacing **heated, wind-sheltered, and
  low-winter-sun** terraces ("south-facing, sun till 15:00 even in December").
- **Why it gets traction:** The documented anti-churn move for seasonal apps is to
  *repurpose* the off-season, not go dark. There's real Amsterdam demand (heated-terrace
  guides are a staple of local blogs), Zonnie's shadow model already computes low winter
  sun angles, **and the competitor is already there.** Without this, Zonnie is deletable
  for a third of the year.
- **Effort:** **M.** Needs a heated/sheltered tag per venue (data work) + a winter UI
  skin. OTA-able once the data exists. The heated filter could even be a Pro hook.

### 8. Streaks / "Sun Passport" — light gamification
- **What:** A sunny-day streak, plus a "passport" of terraces/neighbourhoods collected,
  monthly themed challenges ("Canal-side June"), shareable badges.
- **Why it gets traction:** Strava proves seasonal/outdoor gamification (challenges +
  streaks + kudos) builds compulsion loops and reignites users after a quiet winter;
  brewery passports report ~47% engagement / ~22% loyalty lifts, and *streaks beat
  points* (loss aversion). **Important caveat from the research:** keep it **personal and
  friends-scoped — Foursquare learned global leaderboards demotivate everyone outside the
  top.** Your audience is social, not a fitness crowd, so keep it light/charming.
- **Effort:** **M, mostly OTA.** Reads F0's log. Badges first (S), streaks/challenges later.

---

## Tier 4 — Monetisation (when you're ready to re-gate Pro)

Pro is currently fully unlocked. When you re-gate, the research points to better-fitting
models than a year-round wall:

- **"Summer Sun Pass" — seasonal subscription** (S–M, OTA). Re-frame Pro as a
  low-priced April–Oct pass, psychologically matched to terrace season and sold hard on
  the first sunny day. Directly answers "how to re-gate without making winter non-users
  feel cheated." **Recommended re-gate framing.** Revenue: medium, better conversion fit
  than annual.
- **Promoted "Sunny Spot of the Day"** (S–M, OTA). Extend your existing `featured` flag
  into a *paid, dated, single-slot* daily pick — shown only when the spot is actually
  sunny then, so it stays useful not spammy. One per day, clearly labelled. Revenue:
  medium, scales with venue density.
- **Affiliate reservation links** (S, OTA). You already ship reservation links — switch
  to commission/affiliate deep-links where the booking partner offers it. Near-zero
  friction; incremental, not a pillar (per-cover commissions are small).
- **B2B "claim your terrace"** (L, native-ish — needs a venue dashboard + auth + billing).
  Venues claim their listing, manage photos/hours, see "X people viewed your sun score
  this week", pay a small monthly fee for analytics + a verified badge. **Yelp's model;
  the most durable, recurring revenue, and it works *through winter*** (sell venues "be
  ready for spring"). The biggest build, but the only model that survives the seasonal
  lull on the revenue side. A longer-term bet.

---

## Tier 5 — Bigger / handle-with-care bets

High ceiling, but higher effort/risk — deliberately *after* the above.

- **AR "point your phone at the terrace" sun overlay** (L, **native**). Hold up your
  camera, see the sun's path + hour-markers + when the building shadow swallows your
  table. Sun Seeker's signature paid feature; **the most visually shareable expression of
  Zonnie's data** (instant TikTok/Stories moment) and a strong Pro driver. But it's
  ARKit + sensors = new binary + review. A flagship Pro bet, not a quick win.
- **Ephemeral "who's out in the sun now" presence** (L, **native**, privacy-sensitive).
  Opt-in, mutual-consent, friends-only, *auto-expiring* "I'm here ☀️" at terrace-level
  (not a GPS dot). Zenly proved the engagement ceiling is huge. **But:** location +
  young women + public venues is a real safety vector — mutual-consent only, ephemeral,
  ghost-mode, terrace-level precision. Highest reward, highest risk; **do it last and
  carefully, or not at all.**
- **Friends' sun feed + "sun-taste" similarity** (L, needs accounts + backend). Beli's
  social feed + taste-match is what tipped it from utility to Gen-Z habit; a novel twist
  is that Zonnie's "sun taste" can be *objective* (blazing vs dappled). The deepest social
  moat, but the largest infra lift (accounts, friend graph, server feed).
- **Contact-sync invite loop** (M, **native**, GDPR-sensitive). The proven second-user
  mechanic (Partiful, BeReal). Strongly prefer *on-device* contact matching, explicit
  opt-in — contact upload is sensitive under EU/Dutch GDPR.
- **Reaction-only "kudos" on terraces** (S, OTA) and **crowd-confirm "is it sunny now?"**
  (M, OTA): lightweight *multipliers* that make presence/alerts stickier and sharpen the
  data — not standalone acquisition loops. Cheap to add alongside Tier 1.

---

## Recommended build sequence (a phased roadmap)

**Phase 0 — now, silent (S, OTA):** Ship **F0 sun log**. Start accumulating history.

**Phase 1 — this season, the quick wins (S–M, OTA):**
1. "Sun's leaving — move!" nudge (#2) — the wedge
2. "Today's Verdict" + morning briefing (#3) — the daily habit
3. "First Sunny Day" / city-wide push moment (#5) — the growth spike
4. Dynamic "Perfect For" guides (#4) — discovery polish

**Phase 2 — the flagship (M):**
5. Validate the hand-off data (½-day experiment) → build **static "Chase the Sun" crawl
   + Sun Route share card** → then curated routes → then group crawl.

**Phase 3 — autumn, seasonal survival (M):**
6. Sun Wrapped (#6) → Winter Cosy Mode (#7) → light streaks/passport (#8).

**Phase 4 — when re-gating Pro / monetising:**
7. Summer Sun Pass framing → Sunny Spot of the Day → affiliate links → (later) B2B claim.

**Phase 5 — bigger bets, resourced properly:** AR overlay, presence, friends feed.

---

## Open risks to validate (don't skip these)

1. **Crawl hand-off feasibility** — does real terrace data give walkable sun hand-offs
   often enough? Test before promising "always in the sun." (½ day.)
2. **Notification fatigue** — the city-wide push and per-terrace alerts are powerful but
   easy to overdo; cap hard and tie strictly to real weather.
3. **Gamification tone** — keep streaks/passport personal + friends-scoped, never a
   global leaderboard (Foursquare's documented mistake).
4. **Privacy** — anything touching contacts or live location is native + GDPR-sensitive;
   on-device, opt-in, ephemeral by default. Don't ship presence without proper care.
5. **OTA-vs-native verification** — confirm the static crawl needs no new native module
   before committing to an OTA timeline.

---

## Appendix — full idea catalogue & sources

Four research briefs underpin this doc (comparable-apps, bar-crawl, viral growth,
retention/monetisation), each with inline citations. Representative sources:

- **Competitors:** SunSeekr (App Store — no routing), Coffee in the Sun (DutchReview),
  Seats in the Sun.
- **Crawl/route UX:** PubCrawl App, Golden Mile, PubCrawl Roulette, Google Maps
  multi-stop, Wanderlog, Komoot, AllTrails, Atlas Obscura itineraries; Boop (aesthetic
  shareable itineraries).
- **Discovery features:** Resy Notify, Beli (comparative ranking + taste-match + Want-to-
  Try), The Infatuation "Perfect For", Sun Seeker (AR), Shadowmap, Citymapper GO.
- **Viral mechanics:** BeReal (synchronized moment + contacts), Partiful (text-blast
  invites), Zenly/Snap Map (presence), Monzo/Revolut (status referral), Spotify Wrapped,
  Strava (kudos/segments/challenges), Citymapper (data-as-magnet, city voting).
- **Retention/monetisation:** Carrot Weather (achievements), Live Activities/Dynamic
  Island (iOS retention), Yelp (claim-your-business), Topgolf (season pass), brewery
  passports (gamified loyalty); Amsterdam civic moments — King's Day (27 Apr 2026),
  WorldPride (25 Jul–8 Aug 2026).

*Full per-idea write-ups with every citation are preserved in the four research-agent
transcripts from this session if you want to go deeper on any one.*
