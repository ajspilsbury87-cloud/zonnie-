# App Store Submission Checklist — Zonnie 1.0.0

Living checklist for the first App Store submission. Items marked **[A]**
need Andy to do them (web portal access, Apple ID auth, manual content
review). Items marked **[C]** are already done in code or can be done
by Claude. Items **[T]** = together (Andy provides input, Claude executes).

Last updated: 2026-05-08 (commit `<this commit>`).

---

## 1 · App Store Connect listing (web portal) **[A]**

You'll need to create the app entry at <https://appstoreconnect.apple.com>.
Apple Developer Program membership ($99/yr) is a prerequisite — you have
this since you've been doing TestFlight builds.

| Field | Value |
|---|---|
| App Name | **Zonnie** |
| Subtitle | *Sunny terraces, Amsterdam* (max 30 chars — see §2 for alternatives) |
| Bundle ID | `com.spilsbury.zonnie` (already registered via TestFlight) |
| SKU | `zonnie-001` (your free choice, doesn't appear publicly) |
| Primary Language | English (US) |
| Primary Category | **Travel** |
| Secondary Category | **Food & Drink** |
| Pricing | Free |
| Availability | Netherlands first; expand later |
| Age Rating | **4+** (no objectionable content; questionnaire answers in §6) |

Once created, the **App Store Connect ID** (a 10-digit number) appears in the
URL: `appstoreconnect.apple.com/apps/<NUMBER>/...`. Paste it into
`eas.json:submit.production.ios.ascAppId` so `eas submit` knows where
to upload.

---

## 2 · App Store description copy (text content) **[T]**

Suggested copy below — edit freely, then paste into App Store Connect.

### Subtitle (≤ 30 chars)

> Sunny terraces, Amsterdam

Alternatives:
- "Find sun in Amsterdam"
- "Where to drink in the sun"
- "Amsterdam terrace finder"

### Promotional Text (≤ 170 chars, can change without re-review)

> Updated daily. Find the sunniest terrace in Amsterdam right now —
> 880+ verified bars and cafés ranked by real sun, weather, and your
> visit window.

### Description (≤ 4000 chars)

> Zonnie shows you which Amsterdam terrace will be in the sun right
> now — or whenever you're heading out.
>
> Pick a date, pick a time window, and Zonnie ranks 880+ bars and
> cafés across the city by how much sun their terrace will get during
> your visit. The score combines real building shadows (LIDAR-derived
> heights from the Dutch government 3D BAG registry), the sun's
> position, live weather, and the direction the terrace faces.
>
> WHY ZONNIE
> ▸ Real building geometry, not guesswork. Every shadow that matters,
>   modelled from official Amsterdam data.
> ▸ Live weather. Hour-by-hour cloud cover and wind for every venue.
> ▸ Wind shelter. We know which terraces are sheltered behind the
>   building and which take the breeze full-on.
> ▸ Find by neighbourhood, café-vs-bar-vs-restaurant, your saved
>   favourites, or — for the World Cup — outdoor TV screens.
> ▸ Home-screen widget. The top three sunny spots, always one glance
>   away.
> ▸ Privacy-first. Location stays on your device. No accounts, no
>   tracking, no ads.
>
> Built in Amsterdam, for Amsterdam. New venues added regularly.

### Keywords (≤ 100 chars, comma-separated)

```
amsterdam,terrace,sun,sunny,bar,cafe,weather,terras,zon,where to drink,outdoor,WK,EK,beer,beach
```

(99 chars; tune as Apple suggests during review.)

### What's New in This Version (≤ 4000 chars)

> First public release. Find the sunniest terrace in Amsterdam in
> seconds — across 880+ verified venues, with real-time weather and
> shadow modelling, plus a home-screen widget for the top three
> sunny spots right now.

---

## 3 · Privacy policy + support URLs **[A]**

App Store Connect requires both. Easiest path: GitHub Pages or a Notion
public page.

- **Privacy Policy URL** — REQUIRED. Draft text in
  `docs/PRIVACY-POLICY.md` (see commit). Host it at e.g.
  `https://zonnie.app/privacy` or
  `https://github.com/<you>/zonnie-legal/blob/main/privacy.md`.
- **Support URL** — REQUIRED. Can be a mailto link via redirect, a
  Notion FAQ, or a one-page site. Just needs to load without error
  during App Store review.
- **Marketing URL** — optional. A landing page if you've made one.

---

## 4 · Screenshots & app preview **[T]**

Apple requires screenshots for at least one device size. The
recommended set covers:

- **6.7" iPhone** (1290×2796 pt) — REQUIRED. Most users see these.
- **6.1" iPhone** (1170×2532 pt) — optional but recommended.

Five recommended shots (in this order — Apple shows them as a carousel):

1. **Hero**: the map with bright spritz pins clustered around Stadionbuurt
   on a sunny May afternoon. Show the three highest-scoring pins.
2. **Detail sheet**: a high-scoring terrace (Café Kiebêrt or similar)
   with its score chip, sun timeline, weather strip, and verified badge.
3. **Time scrubber**: the bottom sheet open at the time-presets row,
   "Now"/"Afternoon"/"Evening"/"All day" pills visible, weather summary
   under the title.
4. **Match filter**: the 📺 Match chip active, showing the World Cup
   venues filtered down (Westergasterras visible).
5. **Widget on home screen**: actual home-screen capture with the
   medium widget showing top 3.

Capture from your iPhone (Settings → Accessibility → Touch → AssistiveTouch
→ Device → Screenshot). Save to Photos, AirDrop to your Mac, drag into
App Store Connect.

I can also generate marketing-quality SVG/PNG mocks if you want a
"crafted" set rather than raw captures — say the word.

### Optional: app preview video

15-30 sec MP4 showing the core flow (open → see top 3 → tap a venue →
sun timeline). Recommended but skippable for v1. Can add later
without re-review.

---

## 5 · Privacy nutrition labels (App Store Connect → App Privacy) **[A]**

Apple requires you to declare what data you collect. Zonnie's answers:

- **Data Used to Track You**: NONE.
- **Data Linked to You**: NONE.
- **Data Not Linked to You**:
  - **Coarse Location** — used "to display the map and surface
    nearby terraces". Not linked to identity. Not used for tracking.
  - **Diagnostics** (if you enable Sentry / Expo crash reporting later) —
    none in v1.
- **Data Collected by Third-Party SDKs**:
  - Open-Meteo API — receives **no user data**, just date/coordinate
    queries (Amsterdam centroid, never user lat/lng).
  - Google Places API — receives **no user data**, just place IDs to
    fetch open-hours/rating.
  - 3D BAG API — used at build time only, never at runtime.

In ASC, declare all the above as "Not Collected" except Location, which
is "Used for App Functionality, Not Linked to User, Not Used for
Tracking".

---

## 6 · Age rating questionnaire (App Store Connect) **[A]**

All NO except where noted. Result: **4+**.

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | **Infrequent/Mild** (we list bars + the Aperol-spritz pin design references alcohol — Apple is fine with this; "Mild" is correct) |
| Simulated Gambling | None |
| Sexual Content | None |
| Nudity | None |
| Contests | None |
| Unrestricted Web Access | No |
| Gambling and Contests | No |

---

## 7 · Code-side production readiness **[C]**

| Item | Status |
|---|---|
| `app.config.ts:version` is `1.0.0` | ✅ This commit |
| `app.config.ts:bundleIdentifier` matches ASC | ✅ `com.spilsbury.zonnie` |
| `app.config.ts:scheme` set for deep links | ✅ `zonnie` |
| `app.config.ts:newArchEnabled` correct | ✅ `true` (RN 0.81.5 + RNM 1.27.2 stable) |
| Privacy strings present | ✅ NSLocationWhenInUseUsageDescription |
| Transport security strict | ✅ NSAllowsArbitraryLoads: false |
| Encryption export-compliance | ✅ ITSAppUsesNonExemptEncryption: false |
| App Group entitlement (widget) | ✅ `group.com.spilsbury.zonnie` |
| Apple Team ID set | ✅ via `EXPO_APPLE_TEAM_ID` EAS secret |
| No `console.log` left in src | ✅ (only `console.error`/`warn` in legitimate paths) |
| No TODO/FIXME markers | ✅ |
| Dead code removed | ✅ (SplashOverlay deleted in this commit) |
| Tests pass | ✅ 54/54 |
| TypeScript clean | ✅ |
| Pin assets present (full/mostly/partial/mshade/shade/selected × 3 densities) | ✅ |
| Splash icon + app icon present | ✅ |

---

## 8 · Production build & submit **[T]**

Once §1 + §2 + §3 + §4 + §5 + §6 are done, run:

```powershell
cd C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae

# Build for App Store distribution (~25 min)
npx eas-cli@latest build --platform ios --profile production

# Submit the build to App Store Connect (after build succeeds)
npx eas-cli@latest submit --platform ios --profile production --latest
```

EAS will guide you through any remaining credentials. The `production`
profile in `eas.json` already has `autoIncrement: true`, so each
production build bumps the build number automatically; you don't have
to manage that manually.

After upload to ASC, fill in the metadata from §1+§2, attach screenshots
from §4, fill privacy from §5+§6, and click **Submit for Review**.

Apple's review queue is typically 24-48 hours, sometimes faster.
Common rejection reasons we should NOT hit:
- ❌ Crashes on launch — we've tested
- ❌ Missing privacy strings — present
- ❌ Misleading description — accurate
- ❌ Broken permissions flow — handled gracefully
- ⚠️  "Looks like a website" — we don't, we have native UI
- ⚠️  "Missing functionality" — we have a working core feature

---

## 9 · Post-launch (after approval) **[A]**

- Monitor App Store Connect for crash reports
- Watch the first 24h of reviews for blocker bugs
- If any feature is broken, hot-fix via OTA push (`preview` → `production`
  channel) without resubmitting
- For native bugs, do a 1.0.1 build and submit (Apple usually fast-tracks
  bug-fix releases)

---

## What I need from you to keep moving

In rough priority order, **this is what unblocks the next steps**:

1. **Apple Developer Program membership active** — you have this.
2. **App Store Connect listing created** at appstoreconnect.apple.com →
   gives you the **ASC App ID** (a number).
3. **Privacy Policy + Support URL hosted somewhere public.** Easiest:
   GitHub Pages with `docs/PRIVACY-POLICY.md` rendered as a page. I've
   drafted the content; you host it.
4. **Decide on subtitle and final description.** I've drafted; tweak as
   you like.
5. **Take 5 screenshots from your iPhone.** Or ask me to mock them.

Once those exist, I trigger the production build. Apple takes it from
there.
