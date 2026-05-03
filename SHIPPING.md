# Shipping Zonnie to the App Store

The path from "works in Expo Go on my phone" → "live on the App Store". Steps that **only you** can run, in order.

---

## 1. Sign up for things (one-time)

You'll need accounts on three services.

### Apple Developer Program — $99/year, ~24h to approve

Required to ship any iOS app. There is no free path.

1. Go to https://developer.apple.com/programs/enroll/
2. Sign in with your Apple ID (or create one)
3. Choose **"Individual"** unless you're forming a company
4. Pay $99
5. Wait for Apple to verify (usually <24h, sometimes a couple days)

### Expo (EAS) — free tier covers everything we need

1. Go to https://expo.dev
2. Sign up — pick a username; it becomes the `owner` field in `app.config.ts`
3. Free tier: 30 builds/month, plenty for our cadence

### App Store Connect

Comes free with the Apple Developer Program. You'll create the app record there once approved.

---

## 2. Link this repo to your EAS account

From `SunBae/` on the command line:

```powershell
npx eas-cli@latest login
# Enter your Expo username + password

npx eas-cli@latest init
# Confirms you want to create a new EAS project
# Outputs a "projectId" — copy it
```

Then edit `app.config.ts` and replace the placeholder values:

```ts
const EAS_OWNER = process.env.EXPO_OWNER ?? 'YOUR_EXPO_USERNAME';
const EAS_PROJECT_ID = process.env.EXPO_EAS_PROJECT_ID ?? 'paste-the-projectId-here';
```

(Or set them as environment variables — either works.)

Verify:

```powershell
npx eas-cli@latest whoami
# Should print your username

npx eas-cli@latest project:info
# Should print "Zonnie" with your slug
```

---

## 3. First cloud build — install on your phone (no App Store yet)

This makes a real `.ipa` file you can install on your iPhone via TestFlight or Ad Hoc, identical to the production build but for internal testing. Takes ~15–25 minutes the first time (Expo provisions code-signing certs for you).

```powershell
npx eas-cli@latest build --platform ios --profile preview
```

What happens:
1. EAS asks for your Apple Developer credentials. You can paste them or use an App Store Connect API key (https://docs.expo.dev/app-signing/app-credentials/#app-store-connect-api-key — recommended once you've shipped a few times)
2. EAS handles the certificate + provisioning profile dance for you
3. Build runs on EAS cloud; you watch progress in the terminal or at https://expo.dev/accounts/<your-username>/projects/sunbae/builds
4. When done, EAS gives you a URL to download the `.ipa`, plus a QR code to install via TestFlight if you're a member

**On your iPhone:** install the [Expo Orbit](https://expo.dev/orbit) Mac/Win helper, or scan the QR code in Apple Configurator, or use TestFlight (next step).

Once installed: this build will look + behave exactly like the App Store version. **The Expo Go limitations from earlier (the iOS clustering crash, FlashList wrappers, etc.) are gone here — this is a real native build with everything the project needs.** Worth trying to re-enable clustering at this point.

---

## 4. TestFlight — beta-testing distribution

Skip this step the first time if you just want to confirm the build works on your phone. But before App Store submission, TestFlight is where you'd let friends or beta users try it.

1. https://appstoreconnect.apple.com → **My Apps → +**
2. Pick **iOS**, fill in:
   - Name: `Zonnie` (must be globally unique on the App Store — if taken, try `Zonnie Amsterdam` or similar)
   - Primary language
   - Bundle ID: pick `com.spilsbury.zonnie` from the dropdown (it appears here automatically the first time EAS uploads a build with that ID)
   - SKU: anything internal, e.g. `zonnie-001`
3. Copy the resulting **App Store Connect ID** (a long number)
4. Edit `eas.json`, replace `REPLACE_WITH_APP_STORE_CONNECT_ID` with that ID
5. Submit your preview build to TestFlight:

```powershell
npx eas-cli@latest submit --platform ios --latest
```

Or build + submit in one step:

```powershell
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

After Apple processes (~30 min the first time, often <5 min after), you can add testers via App Store Connect → TestFlight tab.

---

## 5. Things you still need before App Store review

The build will technically pass cert/sign, but Apple's review will reject without these:

| Item | Why it matters | Where |
|---|---|---|
| **App icon** (1024×1024 PNG, no transparency) | Required asset | Replace `assets/images/icon.png` |
| **Screenshots** (at least 6.5" iPhone) | Required for store listing | App Store Connect → App Info → Screenshots |
| **App description, keywords, support URL, privacy URL** | Required text for store listing | App Store Connect → App Info |
| **Privacy policy URL** | Apple requires one even for an app with no tracking | Hostable on a single Notion page or GitHub Pages |
| **Privacy nutrition labels** | Self-declaration of data collection | App Store Connect → App Privacy. For Zonnie: "no data collected" applies — there's no analytics, no auth, no tracking |
| **Real terrace data** | Apple reviewers will tap around. Spot-check that places aren't clearly mislocated | Re-run validation if needed (see below) |

---

## 6. Optional but recommended

### Run the Places API validation on the 94 unsourced terraces

```powershell
$env:GOOGLE_MAPS_API_KEY = "AIza..."   # your existing key
npm run validate-coords -- --apply --only-unsourced
npm run apply-corrections -- --apply
```

Cost: ~$0.50 in Places API calls. Removes the last cluster of unverified locations.

### Generate a real app icon

The current icon at `assets/images/icon.png` is whatever Expo's template ships. Replace with a 1024×1024 PNG (no rounded corners — Apple adds them) before the first build.

If you have a logo, [iconkitchen](https://icon.kitchen) generates the full set (iOS, Android adaptive, splash) from one source image.

### Set up OTA updates

Already configured in `app.config.ts` (`runtimeVersion: { policy: 'appVersion' }`). To push a JS-only update without rebuilding:

```powershell
npx eas-cli@latest update --branch production --message "Tweak copy"
```

Users on `Zonnie 0.1.0` get the update on next launch. Native code changes still require a new build + new version.

---

## Quick reference — every command, in order

```powershell
# One-time setup
npx eas-cli@latest login
npx eas-cli@latest init
# Then edit app.config.ts with the projectId + owner

# First build for your iPhone (preview = internal testing)
npx eas-cli@latest build --platform ios --profile preview

# After TestFlight is wired up:
npx eas-cli@latest build --platform ios --profile production --auto-submit

# Push a JS-only fix without a new build:
npx eas-cli@latest update --branch production --message "..."
```

---

## What I (Claude) cannot do for you

- Anything requiring your Apple ID password / App Store Connect login
- Running `eas login` / `eas init` (they're interactive)
- Triggering cloud builds (cost money against your account, plus Apple credentials)
- Uploading screenshots or filling in App Store Connect metadata (Apple-account scoped)

Everything in code/config/scripts I can — and have. Ping me when you've run `eas init` and I'll help wire the `projectId` into the right places, or if any of the commands above error and you don't recognize the message.
