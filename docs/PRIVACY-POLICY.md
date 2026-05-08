# Zonnie — Privacy Policy

**Effective date:** 2026-05-08
**Last updated:** 2026-05-08

Zonnie ("the app", "we") is built and operated by Andy Spilsbury, an
independent developer based in Amsterdam. This policy explains what
data the app touches and what we do with it. The short version:
**we don't collect any of your data**, and the app works without an
account.

---

## What we collect

**Nothing personal. Nothing leaves your device that identifies you.**

Specifically:

- **No account.** The app does not ask you to sign up, sign in, or
  provide an email address.
- **No analytics.** The app does not include Google Analytics,
  Firebase, Mixpanel, Sentry, or any third-party analytics SDK.
- **No advertising IDs.** The app does not request or use IDFA, App
  Tracking Transparency permissions, or any advertising identifier.
- **No cookies.** Native apps don't have cookies in the web sense; we
  also store no equivalent persistent identifier.

## Data the app uses on-device only

- **Your location** (foreground only, while the app is open). Used
  exclusively to centre the map on you and rank nearby terraces by
  distance. Your coordinates **never leave your device.** Apple
  Maps' `react-native-maps` displays them as a blue dot; that's the
  only place they go.
- **Your favourites.** When you tap the heart on a terrace, the
  terrace's ID is stored on-device using `AsyncStorage` (Apple's
  encrypted-at-rest local storage). Your favourites never sync to
  any server.

## Data we send to third parties

To make the app useful we query a few public APIs. Each receives only
what's necessary, and **never anything that identifies you**:

- **Open-Meteo** (open-meteo.com) — receives the date and Amsterdam's
  city-centre coordinates (52.3676, 4.9041). It returns the weather
  forecast. Open-Meteo's privacy policy:
  <https://open-meteo.com/en/terms>
- **Google Places API** (Google, googleapis.com) — receives place IDs
  (each terrace has a public Google Place ID). Returns each venue's
  rating, opening hours, and phone number for display. Google receives
  the place ID and your IP address (the latter unavoidable in any HTTP
  request); Google's privacy policy:
  <https://policies.google.com/privacy>
- **Apple Maps tile servers** — your map view sends standard map-tile
  requests to Apple, the same as any iOS app using MapKit. Apple's
  privacy policy: <https://www.apple.com/legal/privacy/>

We do **not** send your location, favourites, in-app activity, device
ID, or any user-identifying data to any of these services.

## What we don't do

- We do not sell, rent, or share data — because we don't have any to
  sell.
- We do not use your data for advertising — there are no ads in the
  app.
- We do not track you across other apps or websites.
- We do not store your data on our servers — we don't have user-data
  servers.

## Crash reports and diagnostic data

Apple's standard crash-reporting system (which only reports back to
Apple, never to us, and only with your permission via Settings →
Privacy → Analytics) is the only diagnostic channel. We may add a
crash-reporting tool like Sentry in the future; if we do, we'll
update this policy and disclose it in the app.

## Children

The app is not directed at children under 13. The App Store age
rating is 4+ because the content is suitable for any age, but we
do not knowingly collect data from anyone (per the sections above).

## Your rights

Because we don't collect personal data, there's nothing for you to
request, export, or delete from us. To clear local data on your
device:

- **Favourites & app preferences:** delete and reinstall the app.
- **Location permission:** Settings → Zonnie → Location.

## Contact

Questions or concerns:

- Email: a.j.spilsbury87@gmail.com
- Repository (if open-sourced): TBD

## Changes to this policy

If we make material changes — for example, adding a third-party SDK
or a new permission — we'll bump the "Last updated" date above and
disclose the change in the app's release notes. We won't change
"we don't collect your data" without obvious in-app prompts.

---

*This policy is plain-language by design. If anything is unclear,
that's a bug; please email and we'll fix the wording.*
