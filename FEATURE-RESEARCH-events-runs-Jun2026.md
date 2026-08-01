# Zonnie — Feature Research & Proposal: Social Get-Togethers & "Sun Runs" (June 2026)

> Exploration of letting users **organise get-togethers at a place** — birthdays, meetups,
> and especially **organised runs** (with pace/distance, public "anyone can join" or
> private). Researched against the run-club, event/RSVP, and weather-social landscapes,
> evidence-based with cited examples. Founder-facing summary + an honest build path.
> Companion to `FEATURE-RESEARCH-Jun2026.md` (the crawl/verdict/Wrapped roadmap, mostly shipped).
>
> **Plain-English notes:** **OTA** = "over-the-air" — ship as a silent update, no Apple
> review (fast). **Native build** = new binary + Apple review (slower). **Backend** = a
> server + database we'd run (Zonnie has *none* today — see §5). Effort: **S** = days,
> **M** = ~1–2 weeks, **L** = several weeks, **XL** = a different product.

---

## 1. TL;DR — the recommendation

- **Yes, this is a real opportunity — and your instinct to lead with *runs* (not generic events) is correct.** Runs have a booming social trend behind them, a recurring reason to meet, and a gap nobody owns.
- **The defensible angle is not "another events app."** It's **"sunny social runs that finish at a terrace in the sun"** — merging the one thing only Zonnie has (live sun + the Chase-the-Sun crawl) with a behaviour that *already happens in Amsterdam* but lives on Instagram/WhatsApp.
- **The blocker isn't the feature — it's the architecture.** Zonnie has no accounts and no backend today. Real user-created events with RSVPs = a pivot from *utility* to *social platform* (§5). That's the actual decision.
- **So: validate before you build the platform.** Ship a **Phase 0** that works on today's architecture (no backend), riding the channels where run coordination already happens. Only build the accounts+backend platform (Phase 1) if Phase 0 pulls.

---

## 2. The opportunity — why runs, why now

Run-club culture is **growing fast, not plateauing**, and the motive is *social*, not athletic:

- New Strava clubs **~3.5×'d in 2025** (reaching ~1 million); global run-club membership **+59% in 2024**. [[Form Nutrition](https://formnutrition.com/inform/how-2025-became-the-year-of-the-run-club/), [CEP](https://ceprunning.com/blogs/news/run-club-culture-why-group-running-is-booming)]
- **~48%** say *social connection* is their top reason for joining a fitness group; **22% of Gen Z** call run clubs *"the new dating app"*; adidas walking clubs **+52% YoY**; widely framed as *"run club over nightclub"* amid falling under-30 drinking. [[Form Nutrition](https://formnutrition.com/inform/how-2025-became-the-year-of-the-run-club/), [AOL](https://www.aol.com/news/run-clubs-singles-bars-why-155044225.html), [social.plus](https://www.social.plus/blog/how-the-adidas-running-app-turned-solo-runs-into-a-global-movement)]
- Money is following — brands are pouring into **hyper-local run-club sponsorship**, and a sportswear giant took a controlling stake in an urban run-club network (Dec 2025). [[OpenPR](https://www.openpr.com/news/4383512/run-clubs-market-the-new-social-currency-and-the-monetization)]

**Takeaway:** the demand is for *easy, social, low-stakes ways to meet up*, and running is the channel pulling people in. Birthdays/parties are one-off and put us head-to-head with Partiful/Luma with no edge; runs give us cadence, a reason-to-meet, and a niche we can own.

---

## 3. The gap Zonnie can own

- **Nobody triggers meetups off good weather.** In a dedicated scan, *none* of the social/event apps reviewed organise meetups around good-weather conditions. The Weather Channel tells you it's a good day to run — it can't gather anyone. [[Weather Company](https://www.weathercompany.com/news/activities-forecasts-app-partners/)] Zonnie already scores sun 0–100, live, per venue. **That's a primitive Strava and Partiful structurally don't have.**
- **The run → sunny-terrace ritual already exists here, off-platform.** The **Amsterdam Coffee Run** meets twice weekly at *a different café each time* (~100 cafés visited); **City Alps** starts from a coffee bar; **Founders RC** finishes "with coffee and conversations." It's coordinated over Instagram/WhatsApp — **no app knows where the sun is.** [[runclubs.nl](https://www.runclubs.nl/runclubs/amsterdam-coffee-run), [Founders RC](https://foundersrc.com/)]
- Strava/Nike/Komoot own **the run**; nobody owns **where you land afterwards.** The sunny finish line is open ground — and it's exactly Zonnie's core competency.

---

## 4. Competitive landscape (condensed)

**Run apps — only Strava & Komoot have rich *structured* group-run primitives:**

| App | Group-run mechanics | Pace / route? | Public/Private | Cost |
|---|---|---|---|---|
| **Strava** | Club "Group Events", RSVP, **up to 4 pace groups**, attach route, RSVP cap, nearby Event Browse | Strongest | Club + discovery | Free core; routes paid |
| **Komoot** | **Group Tours**: invite by link/**QR**, everyone follows one route at own pace, organiser re-plans live; café "Highlights" | Route-centric | Invite-based | Freemium |
| **Nike Run Club / adidas** | Challenges + local groups/"crews"; lighter on scheduled meetups | Tracking yes | Friends/community | Free(+) |
| **Parkrun** | Fixed free weekly 5k, volunteer-run, just turn up | Fixed route | Fully public | Free |
| **Run-finder apps** (Paka, FindRunClubs, RunGo…) | Discovery directories — the category exists *because* finding real clubs is unsolved | Varies | Public dirs | Free(+) |

**Event/RSVP apps — the minimum viable "get-together" shape:** a shareable page (title/time/place), **invite-by-link with no forced signup**, RSVP (going/maybe/**waitlist**), **public/private toggle**, capacity cap, host/co-host. **Partiful** proves you can ship exactly that, free, and win a young audience; **Luma** = polished/recurring; **Bumble For Friends** (relaunched Sept 2025) is the closest "make friends → IRL plan" loop. [[Partiful](https://partiful.com/), [Bumble BFF](https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building/)]

**Patterns worth copying:** Partiful's *link-invite, no-signup*; Komoot's *QR/link join + re-plan*; Strava's *pace groups + RSVP cap*.

---

## 5. The honest blocker — this is a platform pivot 🚩

Zonnie today: **no accounts, no backend.** Static terrace data + a weather API + over-the-air JS updates. It's a privacy-friendly, read-only utility. That's a strength (cheap, simple, fast, no liability).

User-created events with people joining requires nearly all of:

- **Identity / accounts** (who created it, who's going).
- **A backend + database** (events, RSVPs, real-time-ish updates) — ongoing infra cost + maintenance.
- **Push updates** for changes/cancellations.
- **Content moderation** — anyone can post a public event.
- **Real-world safety** — strangers meeting IRL. Given the "run club = dating app" framing, **participant safety (especially women's) is a first-class design + liability concern**, not an afterthought.
- **GDPR** — EU personal data (names, locations, who's-attending) with real obligations.

**This is a different product** — *utility → social platform* — with a much bigger build *and ongoing operations* (support, moderation, infra). For a solo developer, **this is the decision**, and it shouldn't be made casually or all at once.

---

## 6. The build path

### Phase 0 — "Sun Run", on today's architecture (no backend). Effort: **M**, OTA-able
Validate demand *before* building a platform, by serving the behaviour that already exists:

- **Sun Run generator:** pick distance + pace + time; Zonnie plots a route that **finishes at a sunny terrace** (uses the existing sun engine + the Chase-the-Sun routing). Output a **shareable card/link** to drop into the WhatsApp/IG/Strava groups *where run coordination already happens*.
- **Group-joinable Chase the Sun:** make the existing single-player crawl **shareable as a group plan** (meet point, rough pace, the sunny stops) — same share mechanics we already built for the crawl card.
- **No accounts, no RSVP server.** Zonnie supplies the *plan + the sunny finish*; existing social channels handle the gathering. Rides the proven Coffee-Run ritual; ships same-week via OTA; **measures pull** (shares, link opens) cheaply.

### Phase 1 — Hosted events + RSVP + discovery. Effort: **XL**, Native + Backend
*Only if Phase 0 shows real demand.* A thin **managed** backend (e.g. Supabase/Firebase to minimise ops): create a public/private Sun Run, pace groups (copy Strava), RSVP + cap + waitlist (copy Partiful), link/QR join (copy Komoot), and a nearby "joinable runs" discovery feed. Tackle **moderation, safety, and GDPR deliberately** as part of this phase — they are the hard part, not the CRUD.

---

## 7. Monetisation (later, brief)
- Host tooling / club pages (the Heylo/Meetup-Pro lane) — but Meetup charges ~$55/mo and is resented; a *free* casual layer wins adoption first.
- **Sponsored sunny finish:** a terrace pays to be the suggested post-run stop (extends the existing Featured model — already in the app).
- Pro: private runs, bigger groups, route saving.

---

## 8. Risks
- **Cold-start / liquidity:** a social feature is dead without enough people. Phase 0 sidesteps this by using existing group chats instead of needing Zonnie's own network.
- **Scope & ops creep:** the platform (Phase 1) is a forever-commitment (moderation, support). Don't start it on a hunch.
- **Safety/trust & GDPR:** real liability the moment strangers meet via Zonnie. Must be designed in, not bolted on.
- **Focus cost:** every week on this is a week not spent on the sun-utility moat. Phase 0 keeps the bet small until the signal is real.

---

## 9. Recommendation
1. **Pursue runs, not generic events.** Own *"sunny social runs / run-to-terrace,"* don't fight Partiful/Strava head-on.
2. **Ship Phase 0** ("Sun Run" + group-joinable Chase-the-Sun) — on-brand *and* buildable on what you have now. Measure shares/opens.
3. **Treat the accounts + backend platform (Phase 1) as a separate, deliberate go/no-go** after Phase 0 validates pull — and budget for safety/moderation/GDPR if you green-light it.

---

*Sources inline above. Full sourced competitive scan available on request. Researched June 2026.*
