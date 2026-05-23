/**
 * Floating pill that sits at the top of the map and tells the user
 * which macro-region they're currently viewing.
 *
 * Why: a recurring piece of user-test feedback is "I can't tell which
 * neighbourhood I'm in." Street labels appear at high zoom only, and
 * the filter chips don't reflect what's on-screen — they're an
 * input, not an indicator. This pill is read-only at first glance
 * (the label tells you), and tappable as a secondary action (tap
 * to re-zoom to that region's centroid).
 *
 * Visual: pairs with the locate-me button — same shadow, same white
 * background, same hit area. Sits at the top-centre so it doesn't
 * collide with the locate button (top-right) or the bottom sheet.
 *
 * Fades on label change so swapping "Centrum" → "Jordaan" doesn't
 * jump. When `region` is null (e.g. user has panned out so far we
 * fall back to "Amsterdam"), the pill shows the city name and the
 * tap action recenters on the city.
 */

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '@/src/lib/haptics';
import { useStrings } from '@/src/i18n/useStrings';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';
import type { Region } from '@/src/data/regions';

interface MapRegionPillProps {
  /** Current region (null = zoomed-out / Amsterdam-wide view). */
  region: Region | null;
  /** Tap handler — recenter the map on this region. Receives null when at city view. */
  onPress: (region: Region | null) => void;
}

export function MapRegionPill({ region, onPress }: MapRegionPillProps) {
  const t = useStrings();
  // Cross-fade the label when it changes. We don't slide because the
  // pill sits in a fixed position; the label is just the contents.
  const opacity = useRef(new Animated.Value(1)).current;
  const prevRegionRef = useRef<Region | null>(region);

  useEffect(() => {
    if (prevRegionRef.current === region) return;
    prevRegionRef.current = region;
    // Fade out → swap (already happened via prop) → fade in.
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.0, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1.0, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [region, opacity]);

  const label = region ?? 'Amsterdam';

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress(region);
      }}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      accessibilityLabel={t.currentlyViewing(label)}
      hitSlop={8}
    >
      <Animated.View style={{ opacity, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.glyph}>📍</Text>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: spacing.xxl + spacing.lg, // clears the iOS status-bar / Android nav
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    // Same shadow as the locate-me button so they read as a coherent
    // floating layer above the map.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pillPressed: {
    opacity: 0.7,
  },
  glyph: {
    fontSize: fontSizes.md,
    marginRight: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.ink,
    letterSpacing: 0.2,
  },
});
