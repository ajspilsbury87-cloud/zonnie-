/**
 * SunLegend — collapsible sun-score legend pinned to the left edge of the map.
 *
 * Collapsed: a slim 24px-wide vertical colour bar with tick labels ("100" / "0")
 * and a chevron expand affordance. Five colour segments, top = hottest → bottom = shade.
 *
 * Expanded: a rounded card with a "Sun score" header, × close button, and five
 * labelled bands showing the fun label, score range, and one-line descriptor.
 *
 * Colours come exclusively from scoreToColor() (src/theme/tokens.ts) evaluated at
 * a representative score per band — the same function that drives map pins, so the
 * legend and the pins are guaranteed to match. Text contrast is hand-chosen per band:
 *   full (burnt #D9633E)   → cream text  (dark bg)
 *   mostly (orange #E89C5A) → ink text   (medium-light bg)
 *   partial (mustard #F4D58D) → ink text (light bg)
 *   mshade (cocoa #7A2E14) → cream text  (dark bg)
 *   shade (ink #2A1F15)    → cream text  (very dark bg)
 *
 * Positioning: absolute, left edge, vertically centred between the chip row and the
 * bottom-sheet top handle. Inset-aware (respects safeAreaInsets.left + top).
 *
 * Z-layering: placed in index.tsx inside the same !landingVisible && selectedId==null
 * gate as FilterChips, and BEFORE TerraceDetailSheet, so it is above the map but
 * below the detail sheet and all modals. Document order handles z-layering — no
 * explicit zIndex needed.
 */

import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStrings } from '@/src/i18n/useStrings';
import { haptics } from '@/src/lib/haptics';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';

// ── Band definitions ──────────────────────────────────────────────────────────
// One representative score per band, chosen well within the band's range so
// scoreToColor() → bandForScore() always resolves to the correct band.
// This guarantees the legend colours match the map pins exactly.
//
//   full    > 0.85  → use 0.92
//   mostly  > 0.65  → use 0.75
//   partial > 0.40  → use 0.52
//   mshade  > 0.15  → use 0.27
//   shade   ≤ 0.15  → use 0.05

const BANDS = [
  { score: 0.92, range: '85–100', labelKey: 'legendScorchio',  subKey: 'legendScorchioSub'  },
  { score: 0.75, range: '65–84',  labelKey: 'legendSunSoaked', subKey: 'legendSunSoakedSub' },
  { score: 0.52, range: '40–64',  labelKey: 'legendDappled',   subKey: 'legendDappledSub'   },
  { score: 0.27, range: '15–39',  labelKey: 'legendShady',     subKey: 'legendShadySub'     },
  { score: 0.05, range: '0–14',   labelKey: 'legendShadeCity', subKey: 'legendShadeCitySub' },
] as const;

// Text colour that contrasts sufficiently on each band's background.
// Checked against WCAG AA for normal text on the actual hex values.
function textColorForScore(score: number): string {
  // orange (#E89C5A, mostly) and mustard (#F4D58D, partial) are light enough
  // for dark ink; the other three (burnt / cocoa / ink) need cream.
  if (score === 0.75 || score === 0.52) return palette.ink;
  return palette.cream;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const BAR_WIDTH = 24;          // collapsed bar width
const BAR_HEIGHT = 120;        // total collapsed bar height (5 × 24 per segment)
const SEGMENT_HEIGHT = BAR_HEIGHT / BANDS.length; // 24 px per segment
const CARD_WIDTH = 192;        // expanded card width

// Offset from the top of the safe-area to the top of the legend.
// Must clear: top inset + chip-row top (insets.top+14) + chip-row height (32) + gap.
// We use a fixed offset of 72 px below the top inset as a comfortable clearance.
const TOP_OFFSET_BELOW_INSET = 72;

// ── Component ─────────────────────────────────────────────────────────────────

export function SunLegend() {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    haptics.light();
    setExpanded((v) => !v);
  };

  // Left position: respect the safe-area left inset (e.g. landscape notch),
  // then add the same md spacing used by the home button.
  const leftPos = insets.left + spacing.md;
  // Top position: below the status bar / notch, then clear the chip row.
  const topPos = insets.top + TOP_OFFSET_BELOW_INSET;

  return (
    <View
      style={[styles.anchor, { left: leftPos, top: topPos }]}
      pointerEvents="box-none"
    >
      {expanded ? (
        // ── Expanded card ───────────────────────────────────────────────
        <View style={styles.card}>
          {/* Header row: title + close button */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t.legendTitle}</Text>
            <Pressable
              onPress={handleToggle}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close legend"
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          {/* Five labelled bands */}
          {BANDS.map((band) => {
            const bg = scoreToColor(band.score);
            const fg = textColorForScore(band.score);
            const label = t[band.labelKey];
            const sub = t[band.subKey];
            return (
              <View key={band.score} style={[styles.cardBand, { backgroundColor: bg }]}>
                <View style={styles.cardBandLeft}>
                  <Text style={[styles.cardBandLabel, { color: fg }]}>{label}</Text>
                  <Text style={[styles.cardBandSub, { color: fg }]}>{sub}</Text>
                </View>
                <Text style={[styles.cardBandRange, { color: fg }]}>{band.range}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        // ── Collapsed bar ───────────────────────────────────────────────
        <Pressable
          onPress={handleToggle}
          style={styles.bar}
          accessibilityRole="button"
          accessibilityLabel={`${t.legendTitle} — tap to expand`}
        >
          {/* "100" tick at the top */}
          <Text style={styles.barTick}>100</Text>

          {/* Five colour segments */}
          {BANDS.map((band) => (
            <View
              key={band.score}
              style={[styles.segment, { backgroundColor: scoreToColor(band.score) }]}
            />
          ))}

          {/* "0" tick at the bottom */}
          <Text style={styles.barTick}>0</Text>

          {/* Expand affordance chevron */}
          <Text style={styles.barChevron}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Absolutely-positioned anchor in the left-edge overlay layer.
  // pointerEvents="box-none" on the View means the View itself doesn't block
  // touches, but children (the Pressable bar or card) still receive them.
  anchor: {
    position: 'absolute',
  },

  // ── Collapsed bar ────────────────────────────────────────────────────────
  bar: {
    width: BAR_WIDTH,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    // Shadow/elevation matches FilterChips (elevation 4, same shadow params).
    elevation: 4,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 6,
    backgroundColor: palette.white,
    borderWidth: 0.5,
    borderColor: palette.mist,
  },
  segment: {
    width: BAR_WIDTH,
    height: SEGMENT_HEIGHT,
  },
  barTick: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: palette.inkSoft,
    lineHeight: 10,
    paddingVertical: 2,
  },
  // Chevron rotated to point right (›) — signals "tap to expand".
  barChevron: {
    fontSize: 14,
    color: palette.inkSoft,
    lineHeight: 18,
    paddingBottom: 2,
  },

  // ── Expanded card ────────────────────────────────────────────────────────
  card: {
    width: CARD_WIDTH,
    borderRadius: radii.lg,
    backgroundColor: palette.white,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    borderWidth: 0.5,
    borderColor: palette.mist,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.sand,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.mist,
  },
  cardTitle: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.sm,
    color: palette.ink,
  },
  closeGlyph: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    lineHeight: 18,
  },
  cardBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardBandLeft: {
    flex: 1,
    gap: 1,
  },
  cardBandLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    lineHeight: 16,
  },
  cardBandSub: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    lineHeight: 14,
    opacity: 0.85,
  },
  cardBandRange: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    lineHeight: 14,
    opacity: 0.75,
    marginLeft: spacing.sm,
  },
});
