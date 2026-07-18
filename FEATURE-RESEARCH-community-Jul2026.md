# Community / check-ins / dating — plan, critique, feasibility (July 2026)

Prompt: build community via profiles + venue check-ins, with a possible dating
layer. This doc is the plan + critique + verdict, written to be re-read before
any build decision.

## Where the app stands (the constraints that matter)

- **No backend, no accounts, no user data.** Everything is on-device + static
  JSON + Open-Meteo. That's why the app is free to run, has no privacy surface,
  and one person can operate it.
- **Small audience** (App Store since late June; low hundreds of users at
  best). Every social feature's value scales with density; every social
  feature's *harm* (feeling dead) scales with sparsity.
- **Solo operator.** Any feature that creates standing duties (moderation,
  support, GDPR requests, abuse reports) is a lifestyle change, not a feature.

## The plan (staged, evidence-gated)

### Phase A — community *feeling*, zero backend (days, OTA-able)
1. **Sun Wrapped / streaks** from the existing on-device sun log
   (`sunLogStore` already records opens/shares/runs): "12 terraces this
   summer, 9 sunny — top 4% of sun-chasers" as a shareable card.
2. **Named groups on the existing invite loops** (vote / crawl / Sun Run):
   remember "the Thursday crew", one-tap re-invite. Community with people
   you already know — no cold start, no strangers, no moderation.
3. Success signal: share rates from the sun log. If people don't share
   *personal* moments, they won't check in publicly either.

### Phase B — anonymous "terrace buzz", first tiny backend (1–2 weeks)
- Opt-in, **aggregate-only check-ins**: "☀️ 14 check-ins here this week" on
  the detail sheet. No profiles, no names, no live "who's here".
- Cumulative framing on purpose — a counter that only grows never looks dead,
  unlike "0 people here now".
- Tech: Supabase/Cloudflare Worker + one table, anonymous device token.
  Costs ~€0 at this scale. Requires: privacy-policy update, App Store
  privacy-label change, a rate limiter, and venue-level abuse caps.
- This is also the future **B2B seed**: venue foot-traffic data is something
  bars might eventually pay to see.
- Gate: ship city-wide, measure for 4–6 weeks. If <10% of actives ever
  check in, stop here — the community appetite isn't there yet.

### Phase C — profiles (only if B proves demand; weeks + standing duties)
- Sign in with Apple, display name + avatar, check-in history, optional
  "visible to others at this terrace".
- Triggers Apple's UGC obligations (report/block/moderate) and full GDPR
  posture (access/erasure flows). This is the point of no return for
  "operating a service" vs "shipping an app".

### Dating — assessed, recommended OUT
Not a phase. See critique.

## Critique (the honest part)

1. **Cold start kills naive check-ins.** With today's density, live check-ins
   show emptiness everywhere, which reads as "this app is dead" — negative
   value. Foursquare→Swarm is the canonical cautionary tale even WITH
   millions of users. Only cumulative/aggregate framing survives sparsity.
2. **The backend is a one-way door.** The current architecture is a genuine
   competitive asset (zero cost, zero breach risk, zero moderation). Phase B
   crosses it deliberately small; profiles cross it completely.
3. **Dating is a different company.** 17+ age rating (changes store
   presence), safety tooling (blocking, reporting, human review), location +
   romantic-intent data under GDPR, real-world meetup liability — each alone
   is heavy for a solo dev. And the NL market has a strong native player in
   exactly this niche (Breeze: matches booked into real dates at partner
   venues). Competing there with a terrace utility's side-feature would lose;
   it would also re-brand Zonnie away from its clean "sun utility" identity
   that reviewers and users currently like. If a romance angle ever makes
   sense, it's a **partnership** (sunny-terrace date suggestions via someone
   else's dating product), not a build.
4. **Privacy of presence.** "Person X is at bar Y right now" is a stalking
   vector. Any per-person live visibility needs delay/coarsening/opt-in —
   Phase C design work, not an afterthought.
5. **The instinct is still right.** Terrace culture IS social; retention needs
   reasons to return. The critique is about *sequence*: prove sharing (A),
   prove presence appetite (B), only then buy the infrastructure (C).

## Verdict

- Phase A: **feasible now**, zero risk — recommended.
- Phase B: **feasible**, small real cost (privacy work > code) — recommended
  after A shows sharing appetite, or in parallel if impatient.
- Phase C: technically feasible, **premature** — decide on B's data.
- Dating: **not feasible for this team/stage** — recommend permanently out as
  a build; partnership-only if ever.
