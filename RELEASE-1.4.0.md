# Zonnie 1.4.0 — build #18 (the store-refresh release)

Everything shipped via OTA since 1.3.0, now in a fresh embedded build so
App Review and first launches see the current app (OTAs only apply on
second launch — the store build must carry the real experience).

## App Store "What's New" (paste into ASC)

**EN:**
A big summer update ☀️
• Nearly 2,000 terraces — every bar, café and brown pub we could verify, city-wide
• A simpler first screen: today's sun verdict on a sundial, plus the sunniest terraces right now
• Tap a pin for an instant preview card
• Sun Run: plan a run that finishes on a sunny terrace
• My Sun Summer: your terraces, streaks and sunniest moment — shareable
• Chase the Sun now starts from where you are (and plans tomorrow after sunset)
• WorldPride (25 Jul – 8 Aug): find the 137 terraces along the Canal Parade route
• Sharper scores: better tree-shadow modelling and live weather handling

**NL:**
Een grote zomer-update ☀️
• Bijna 2.000 terrassen — elke bar, elk café en elke bruine kroeg die we konden verifiëren
• Een eenvoudiger beginscherm: het zonoordeel van vandaag op een zonnewijzer, plus de zonnigste terrassen van nu
• Tik op een pin voor een direct voorbeeldkaartje
• Sun Run: plan een rondje dat eindigt op een zonnig terras
• Mijn zonzomer: je terrassen, reeksen en zonnigste moment — deelbaar
• Chase the Sun start nu vanaf waar je bent (en plant morgen na zonsondergang)
• WorldPride (25 jul – 8 aug): vind de 137 terrassen langs de Canal Parade-route
• Scherpere scores: beter boomschaduw-model en live weerverwerking

## Screenshot shot-list (Andy: capture on iPhone, drop into marketing/screenshots/raw)

Take these AFTER the OTA has applied (launch twice), in daylight hours,
portrait, no notifications visible:

1. **Home.png** — the simplified landing: sundial verdict card + top list
2. **Map.png** — city view with colored pins (tap ☀️ chip off, mid-zoom)
3. **Peek.png** — map with a peek card open on a high-scoring pin
4. **Detail.png** — a sunny terrace's detail sheet (timeline visible)
5. **SunRun.png** — the Sun Run sheet with a plan showing
6. (optional) **SunSummer.png** — the My Sun Summer stats sheet

Then: `node scripts/marketing/make-frames.mjs` regenerates the framed store
set automatically (I'll run it and hand back upload-ready PNGs).

## Release flow

1. EAS build #18 (auto-increments) → auto-submits to TestFlight.
2. Andy: TestFlight sanity pass (launch, map, detail, run, stats).
3. Andy: upload framed screenshots + What's New in ASC, submit for review,
   release. (Outward step — Andy's tap.)
4. Post-release: future OTAs target runtime 1.4.0; publish nothing to the
   1.3.0 branch after release except critical fixes for stragglers.

## Deferred to build #19

Live Activity / Dynamic Island ("Sun until 17:40 at Café X") — needs a
native widget target (Swift + ActivityKit); developed against TestFlight
where it can actually be tested, not rushed into the store-refresh build.
