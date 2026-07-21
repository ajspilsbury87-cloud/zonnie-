# Instagram grid v2 — posting playbook

Refreshed 2026-07-03 to match the redesigned zonnie.app (Fraunces/Inter type, warm
grained gradient, terrace-scene illustration, real dataset numbers). Replaces the
old flat-sun / skyline-silhouette tiles.

## Profile changes (do these first)

**Bio (copy-paste):**

```
Find your place in the sun ☀️
1,000+ Amsterdam terraces, scored for sun — live
Built with the city's 3D LIDAR · Free on iOS ↓
```

**Link:** change to `https://zonnie.app` — it serves everyone: iOS users get the
App Store button, everyone else gets the live browser demo. (The current direct
App Store link dead-ends Android/desktop visitors.)

## Posting order

Instagram shows newest first, so **post in reverse**: `09 → 08 → 07 → 06 → 05 →
04 → 03 → 02 → 01`. When done, the grid reads left-to-right, top-to-bottom:
hero → map → 3D → scores → know-before-you-go → De Pijp → chase → browser → brand.

Don't dump all 9 in one day — 1/day over ~9 days keeps reach up. After posting,
**pin** 01-hero, 02-map and 08-web (pinned trio = product story for new visitors).

## Captions

**09-brand** — `Amsterdam has 1,000+ terraces. Only some of them are in the sun right now. Zonnie knows which. ☀️ Free on iOS — link in bio.`
`#amsterdam #terras #amsterdamterrace #zonnetje #terrasjepakken`

**08-web** — `No iPhone? The whole thing runs in your browser — live map, sun scores, all of it. zonnie.app, no download.`
`#amsterdam #amsterdamlife #expatsamsterdam #terras`

**07-chase** — `Every terrace-goer knows the moment: the shade line creeps across your table. Chase the Sun tells you where the light went — and how many minutes' walk it is.`
`#amsterdam #terras #goldenhour #depijp #jordaan`

**06-depijp** — `De Pijp's sunniest, straight from the dataset. Your buurt next — tell us in the comments. 👇`
`#depijp #amsterdam #terras #amsterdamfood`

**05-know** — `Meeting friends at 5? Check whether that terrace still has sun at 5. Know before you go.`
`#amsterdam #terrasje #aperitivo #borrel`

**04-score** — `Every terrace gets a sun score, 0–100, for every hour of the day. 92 = bring sunglasses. 31 = bring a jacket.`
`#amsterdam #terras #sunseeker`

**03-lidar** — `We rebuilt Amsterdam in 3D with the city's LIDAR data. Real rooftops cast real shadows — so the score knows the exact minute your table goes dark.`
`#amsterdam #lidar #maps #dataviz #terras`

**02-map** — `One glance. Every sunny terrace in the city, right now. The map re-scores itself every hour.`
`#amsterdam #amsterdammap #terras #zon`

**01-hero** — `Find your place in the sun. 1,000+ Amsterdam terraces, scored live. Free on iOS — link in bio. ☀️`
`#amsterdam #terras #amsterdamterrace #summerinamsterdam`

## Keep it alive after the refresh

- **Weekly repeatable formats:** the 06 spotlight tile is a template — rerun
  `make-ig-grid-v2.mjs` with a different area for "Jordaan's sunniest", etc.
  Weather-pegged posts ("28° Saturday — here's where the sun is at 15:00") will
  outperform evergreen tiles.
- **Reel ideas (higher reach than stills):** screen-record the time scrubber
  sweeping 12:00→20:00 while pins change colour; a phone-in-hand shot walking to
  a sunny terrace it picked; before/after of the shade line crossing a terrace.
- **Stories → Highlights:** "How it works", "De Pijp", "Chase the Sun".
- The account follows 121 / has 38 followers — following far more than follow
  back reads growth-hacky for a brand; consider trimming follows to venues/press.

---

## July growth calendar (updated 2026-07-16 — pack refreshed to 1,900+ counts)

Status: 1 of the pack published so far — it drew good accounts into the likes,
so the series works. The rest are refreshed with live data and two NEW tiles
were added. Suggested order from today:

| When | Post | Why now |
|---|---|---|
| Today | `11-sunsummer.png` — "Your sun summer, counted." | New-feature news; caption: "New in Zonnie: your terraces, streaks and sunniest moment — counted. ☀️ Link in bio." |
| +1–2 days | Next unposted tile from the 09→01 order | Keep the cadence the algorithm rewarded |
| ~Jul 22–24 | `10-worldpride.png` — Canal Parade terraces | 2–3 days before WorldPride opens (Jul 25); the app's Parade filter lights up automatically Jul 25 |
| Jul 25 | Story: screen-record the 🏳️‍🌈 Parade filter on the map | Feature is LIVE that day — show it working |
| Aug 1 (parade day) | Story from a parade-view terrace + repost tile 10 | Peak relevance moment of the summer |
| After | Remaining pack tiles, ~2/week + a weather-pegged spotlight on hot days | `make-ig-grid-v2.mjs` regenerates the De Pijp spotlight with live data any time |

Reminder: pin the hero/map/browser trio once the grid is fully posted.
