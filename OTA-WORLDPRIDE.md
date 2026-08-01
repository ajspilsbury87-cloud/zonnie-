# OTA runbook — get WorldPride to the live App Store users

**Branch:** `ota/worldpride-1.3.0` (off `master` @ `527ed37`) · **Do not merge to master.**

## Why this branch exists

The **WorldPride 2026 Canal Parade layer** (`src/data/pride.ts`, date-gated **25 Jul–8 Aug**,
Canal Parade **1 Aug**) is on TestFlight but **not** on the public App Store.

Cause is `runtimeVersion: { policy: 'appVersion' }`: every OTA and every binary is keyed to
its exact version string, and a build only receives OTAs tagged with its own version.

- Master flipped to **1.4.0** on 21 Jul → every `eas update` from master now tags OTAs **"1.4.0"**.
- Only the **1.4.0** binary (TestFlight build #18) can see those. It has Pride.
- The **live** App Store app is **1.3.0** (build #16). It listens only for **"1.3.0"** OTAs, so it
  will *never* see the Pride that's tagged 1.4.0.

This branch pins `version` back to **1.3.0** so an `eas update` from here is tagged **"1.3.0"** and
lands on the live public build — no App Store review, live in minutes.

## Safety — why the full bundle is OK on build #16

Pride is pure JS/data (`pride.ts` imports only a type — zero native deps). And native parity holds:
`git diff --stat 514a659..master` (share-card merge, which is *in* build #16, → master) touches only
`app.config.ts` (the version field). **No native module / plugin / iOS / Android change since build
#16**, so the entire current JS bundle runs on that binary. `react-native-view-shot` (the only recent
native dep) already shipped *in* build #16.

## Pre-flight

1. **Confirm the live App Store version** in App Store Connect.
   - If it is **1.3.0** → proceed as-is.
   - If it is **older (e.g. 1.2.1 / build #15)** → **stop.** Build #15 does *not* contain
     `react-native-view-shot`; the Sun Route share card would crash. Either go Path A (release 1.4.0),
     or strip/guard the share card and re-run the native-parity diff against that build first.
2. **Confirm the channel→branch mapping.** The `production` build channel maps to a branch in EAS
   (`eas channel:view production`). Publish to whatever branch that channel points at.
3. Optional smoke test: install the current live App Store build on a device, point it at a
   `preview`/staging update of this bundle first if you have one.

## Publish

```powershell
cd "C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae"
git fetch origin
git checkout ota/worldpride-1.3.0

# tags the OTA runtime "1.3.0" (from app.config version) on the production channel
npx eas-cli@latest update --channel production --message "WorldPride Canal Parade layer (1.3.0 OTA)"
```

If `--channel` errors on your CLI version, resolve the branch first
(`eas channel:view production`) and use `--branch <that-branch>`.

## Verify

- `eas update:list --branch <branch>` → the new group shows **runtimeVersion 1.3.0**.
- Force-quit + reopen the live App Store app twice (expo-updates applies on the *next* launch after
  download). The parade filter chip / spotlight card should appear (window is active 25 Jul–8 Aug).
- The 1.4.0 TestFlight build is unaffected — it only consumes "1.4.0" OTAs.

## Timing

Canal Parade is **1 Aug**; the layer auto-retires **8 Aug**. This OTA is the only path that reaches
existing public users *inside* the window. Releasing 1.4.0 through review (+ any 7-day phased rollout)
would likely miss most of it — if you do go that route, release to **100%, not phased**.

## After the window

This branch is disposable. Once WorldPride is over (or 1.4.0 is live on the App Store), delete it —
do not merge it, as it would regress master's version to 1.3.0.
