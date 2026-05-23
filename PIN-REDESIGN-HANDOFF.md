# Zonnie pin redesign — handoff for Claude Code

## What's already done

I (Claude, web) edited `src/components/ZonnieMap.tsx` to replace the
PNG-asset Aperol spritz pins with **concept B**: a teardrop pin (circle
head + rotated-square tail) that renders the 0–99 sun score inside the
head. The change is on disk locally but **has not been published as an
OTA yet**.

The data model already supports `featured?: boolean` on `Terrace`
(see `src/engines/types.ts`). The new pin reads it and shows a gold
border when true — plumbing for the B1 "Featured partner" paid
placement variant. No terraces have `featured: true` set today.

## What you need to do

### 1. Verify the edit landed cleanly

Read `src/components/ZonnieMap.tsx` and confirm:

- The old `PIN_IMAGES` `require()` block and `pinAssetForScore` are gone
- A new `ScoreBand` type + `bandForScore` function are present
- A new `BAND_COLORS` map exists
- `TerracePin` is now a child-component marker (no `image=` prop),
  using inline `<View>` shapes for the teardrop and a `<Text>` for the score
- The markers `useMemo` and the JSX both pass `band`, `score`, `selected`,
  `featured` (not `asset`)
- `import { fonts, palette, spacing } from '@/src/theme/tokens'`
  (`radii` was removed)

Run `npx tsc --noEmit` (or whatever the project's typecheck command is).
If there's a type error, fix it before pushing.

### 2. Check version + runtime

`app.config.ts` should currently read `version: '1.1.0'`. If a previous
build process bumped it to `1.2.0`, revert to `1.1.0` first so this OTA
reaches the App Store binary (build #7 is at runtime 1.1.0 — confirmed
via `iPhone Settings → Storage → Zonnie`).

### 3. Publish the OTA

```powershell
cd "C:\Users\andys\OneDrive\Documents\SunBae_Claude\SunBae"
npx eas-cli@latest update --branch production --message "New pin design (concept B teardrop with score); featured plumbing for B1"
```

Expected output: `Runtime version: 1.1.0`, channel `production`,
"Published!" with a new group ID.

### 4. Verify on device

Force-close Zonnie, reopen. The aggressive update-check in
`app/_layout.tsx` (`Updates.checkForUpdateAsync` → `fetchUpdateAsync`
→ `reloadAsync`) will pull the new bundle and immediately reload. You
should see compact circular pins with a 0–99 number inside, in five
colour bands (terracotta / burnt / peach / mist / ink).

## Design spec for the new pins

**Shape:** circle (32 px diameter, 38 px when selected) + rotated 45°
square tail (11 px / 13 px) peeking from below. White 2 px outline
lifts it off dark map tiles.

**Score:** 0–99 number centred in the head, Fraunces Bold. Always
clamped `Math.min(99, Math.max(0, Math.floor(score * 100)))` — never
shows 100.

**Five bands** (mirrors `engines/scoring.ts#scoreLabel`):

| Band     | Score range  | Fill colour          | Text colour       |
|----------|--------------|----------------------|-------------------|
| full     | > 0.7        | `palette.terracotta` | `palette.cream`   |
| mostly   | > 0.5        | `palette.burnt`      | `palette.cream`   |
| partial  | > 0.3        | `palette.peach`      | `palette.cocoa`   |
| mshade   | > 0.1        | `palette.mist`       | `palette.inkSoft` |
| shade    | ≤ 0.1        | `palette.ink`        | `palette.cream`   |

**Selected:** size bumps from 32→38, border colour swaps white → cream,
border width 2 → 2.5. No halo (the existing detail-sheet handles
emphasis).

**Featured (paid placement):** thin `palette.mustard` border (gold)
plus mustard-coloured tail. Triggered when `terrace.featured === true`
in the data. **No terraces have this flag today.** The plumbing exists
so adding sponsored pins later is purely a data change.

**Anchor:** `{ x: 0.5, y: 0.92 }`. Tail tip sits on the lat/lng.

**Perf:**
- `tracksViewChanges={false}` (Android needs the first paint snapshot;
  iOS ignores this for child-component markers)
- Custom `memo` comparator on band/score/selected/featured/coords
- Existing `MAX_MARKERS = 200` cap unchanged

## The plumbing for B1 sponsored variant (future work)

When you want to ship B1, no code change is needed in `ZonnieMap.tsx`.
Just set `featured: true` on the relevant terraces in
`src/data/terraces.json` and push an OTA. The pin will pick up the gold
border automatically.

The B1 spec in our chat also called for a "Featured partner" badge on
the detail sheet card — that's in `TerraceDetailSheet.tsx` and is NOT
part of this change. Add it when actually onboarding the first paying
venue.

## Files touched

- `src/components/ZonnieMap.tsx` — pin component + markers map + JSX

## Files NOT touched (intentionally)

- `assets/images/pins/*.png` — left on disk in case rollback is needed.
  Safe to delete in a later cleanup PR once new pin is in production.
- `src/engines/types.ts` — `featured?: boolean` already existed
- `src/data/terraces.json` — no terraces set as featured yet
- `src/components/TerraceDetailSheet.tsx` — "Featured partner" badge
  not part of this change (no paying venues yet)

## Known nits to verify on device

- **Pixel-centring of the score number:** `lineHeight: 16` is tuned for
  the 32 px head. On the 38 px selected head with `fontSize: 16` the
  number may need `lineHeight: 18`. Eyeball it and tweak if it looks
  off.
- **Tail-head seam:** at the 45° rotation, the tail's top edge sits
  exactly at `size - tail/2`. If there's a visible gap or overlap on
  certain device pixel densities, nudge `top` by ±1.
- **Featured gold border visibility:** because no terraces have
  `featured: true` today, the gold border has not been visually
  verified. If you want to QA it, temporarily set `featured: true` on
  one terrace in `terraces.json`, push an OTA, check the pin renders
  the gold ring, then revert.
