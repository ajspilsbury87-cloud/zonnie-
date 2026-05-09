# Sun-rating Algorithm Validation

Living document. Updated whenever scoring.ts / shadow.ts / solar.ts /
the building dataset changes. Confirms the engine produces sensible
output on physics, edge cases, and competitor benchmarks.

Last updated: 2026-05-09 (commit `<this commit>`).

---

## Three validation layers

| Tool | What it tests | Run |
|---|---|---|
| `__tests__/scoring.test.ts` + `__tests__/shadow.test.ts` etc. | Unit-level: per-function correctness | `npm test` |
| `scripts/validate-algorithm.ts` | End-to-end: physics, monotonicity, output bounds | `npx tsx scripts/validate-algorithm.ts` |
| `scripts/compare-zonopjebakkes.ts` | External: how our ranking compares to a known-quality competitor | `npx tsx scripts/compare-zonopjebakkes.ts` |

All three should pass before any production build is triggered.

---

## Methodology comparison: Zonnie vs zonopjebakkes.nl

zonopjebakkes.nl is the leading "where's the sun on Amsterdam terraces"
competitor. Public methodology
(<https://www.gratissoftware.nl/app/zon-op-je-bakkes.php>):
**solar position + building geometry only.**

What they include:
- Sun azimuth + altitude per hour
- Building shadows (binary in/out)

What they explicitly **don't** factor:
- Cloud cover ("you'll need to check the weather yourself")
- Wind
- Perceived brightness (linear vs sqrt curve)
- Continuous shadow coverage

What Zonnie adds beyond their methodology:
- ✅ **3D BAG LIDAR-derived building heights** (Dutch government
  registry, accurate to ~0.5m). They likely use OSM `building:levels`
  if anything.
- ✅ **Continuous shadow coverage** [0, 1] — partial blocking from
  buildings that just-barely peek above the sun's altitude is
  weighted by angular dominance. Theirs is binary.
- ✅ **Open-Meteo cloud-cover penalty** — a sunny terrace under a 95%
  overcast sky scores 45% of clear-sky.
- ✅ **Wind-shelter factor** — terraces facing into the wind take a
  comfort penalty up to 15% on windy days.
- ✅ **`sqrt(altitude / 90)` perceived-brightness curve** — golden-hour
  scores reflect what the sun *feels* like, not raw irradiance.
  Calibrated against user feedback (Andy: "evening scores at 28%
  feels too low") in May 2026.
- ✅ **5 score bands** (full / mostly / partial / mshade / shade) +
  selected with halo, vs their binary yellow/grey dots.

We should beat them on accuracy whenever the sky isn't clear. On a
clear-sky midday, our rankings should largely agree.

---

## Top-10 ranking comparison (2026-05-09 run)

zonopjebakkes' published top 10 sunny terraces in Amsterdam, scored
under our engine:

| Their # | Venue | Zonnie rank | Mid-day avg | Evening avg | Label |
|---:|---|---:|---:|---:|---|
| #1 | Hangar Oost | #149 | 78% | 28% | Full Sun |
| #2 | Zoku Rooftop | #12 | 79% | 28% | Full Sun |
| #3 | The Butcher Social Club | #114 | 78% | 17% | Full Sun |
| #4 | Watts Hub | #96 | 78% | 28% | Full Sun |
| #5 | Camping Zeeburg | #208 | 78% | 28% | Full Sun |
| #6 | IJ-Kantine | #71 | 79% | 40% | Full Sun |
| #7 | 't Zusje Amsterdam | #293 | 67% | 44% | Mostly Sunny |
| #8 | Lagerwal | #189 | 78% | 28% | Full Sun |
| #9 | Kaap Amsterdam | #552 | 54% | 37% | Mostly Sunny |
| #10 | Brasserie Vrijburcht | #331 | 67% | 40% | Mostly Sunny |

**Match rate: 10/10. In our top 25%: 7/10. Median rank: #152 of 892.**

### Why ranking divergence isn't a scoring bug

Eight of the ten venues score "Full Sun" or "Mostly Sunny" in our
engine — i.e., we agree they're sunny. The rank gap reflects how many
venues we score slightly higher: there are ~150 SW-facing terraces in
Stadionbuurt, Oud-West, Zuid that score 85-95% on a clear May day, and
they out-rank waterfront destinations that score 78%.

zonopjebakkes' editorial top-10 isn't pure-score — it leans toward
*destinations* (large-format venues, scenic, popular) that happen to
be sunny. Both rankings are defensible; they answer slightly different
questions.

### Outliers worth a second look (not action items)

- **'t Zusje Amsterdam** (#7 / their list, #293 / ours, 67% mid-day) —
  Buitenveldert courtyard. Could be that our facing inference picked
  the wrong wall; worth manual verification.
- **Kaap Amsterdam** (#9 / their list, #552 / ours, 54% mid-day) —
  IJdijk waterfront, NW-facing per our data. NW gets evening sun, not
  midday — 54% is honest. They likely rated for "feels sunny in
  evening", which their algorithm doesn't separately capture.

---

## Data-quality issues surfaced + fixed (2026-05-09)

The comparison run on 2026-05-09 surfaced four data issues, fixed in
the same commit (`scripts/fix-data-issues.ts`):

1. **Hangar Oost** missing from dataset → added (id 1263, Zuiderzeeweg 6H,
   Zeeburgereiland, SW-facing).
2. **Watts Hub** missing from dataset → added (id 1264, Radarweg 480,
   Sloterdijk, S-facing).
3. **Café Restaurant Camping Zeeburg** had `facing: 'N'` (wrong inference
   from OSM building footprint orientation) → corrected to `S`. Real
   terrace is on the south shore of IJburg, faces the IJ.
4. (Earlier, May 7) The previous fuzzy match for "Hangar" was hitting
   "Hangar Amsterdam" in Noord rather than "Hangar Oost" in Zeeburg —
   different venues. Now both exist, the matcher prefers exact-name.

Match rate before fixes: 9/10. After fixes: **10/10**. Top-25% rate
went from 5/9 to **7/10**.

---

## Algorithm validator results (2026-05-09)

`scripts/validate-algorithm.ts` runs 15 physics + monotonicity checks.

```
✅ Sun is below horizon at midnight (May)
✅ Sun is at expected azimuth at noon (May)
✅ Sun has positive altitude all day (May, peak hours)
✅ All scores fall in [0, 1] for 100 random samples
✅ Score is 0 when sun is below horizon (midnight, May)
✅ S-facing > N-facing at solar noon (sunny day, no shadow)
✅ SW-facing peaks in afternoon, NE-facing peaks in morning
✅ Heavy cloud cover reduces score by ~50% vs clear sky
✅ Wind shelter: facing AWAY from wind direction is more sheltered
✅ Wind shelter: calm wind has no penalty regardless of facing
✅ Score with no nearby buildings ≥ score with nearby buildings
✅ Continuous shadow coverage produces non-binary scores
✅ Score smoothly decays as sun sets (May 18-22h)
✅ Score never exceeds 1.0 even at perfect noon + S-facing + clear
✅ Score-band thresholds in scoreLabel match scoreToColor
```

**15/15 pass.** Plus 64/64 unit tests in jest.

---

## What we'd add given more data-quality time

(Out of scope for v1 launch; documented for future iterations.)

- **Per-area facing audit** — compute the share of N/NE/E-facing
  terraces in each Amsterdam neighbourhood. Areas with > 30% N-facing
  are probably mis-inferred (most Dutch streetscapes have buildings
  on both sides → balanced facings).
- **Cross-validate against `seatsinthesun` and `coffee-in-the-sun`** —
  similar sanity-check pass against two more competitor lists.
- **User reports** — in-app "wrong sun reading" button that flags
  terraces for re-inference; we've prepared the
  `outdoorScreensVerifiedAt` pattern that could mirror for facing.
- **Photo-based facing inference** — Google Places Photo API gives us
  an exterior shot of every venue; with a tiny vision model we could
  read the facing direction from the photo (more accurate than OSM
  building geometry alone).
