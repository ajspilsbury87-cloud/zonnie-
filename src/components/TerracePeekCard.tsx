/**
 * Compact "peek card" shown when a map pin is tapped (AllTrails pattern).
 *
 * Floats over the bottom of the map while the map stays visible and
 * interactive behind it — the user can compare pins without committing to
 * the full detail sheet. Tapping the card promotes the selection to the
 * full TerraceDetailSheet (`expand()`); tapping ✕ or the map background
 * dismisses it (`clear()` — the map-background part lives in ZonnieMap).
 *
 * Contents: terrace name (Fraunces), area · "sun until HH:00", and the
 * same warm score chip the detail sheet leads with.
 *
 * Perf notes (this app has burned itself on JS-thread saturation before):
 *   - Mounted only while a peek is active — zero cost otherwise.
 *   - Scoring work per open = one computeRangeScore + 24 computeSunScore
 *     calls, a small fraction of what opening the detail sheet costs.
 *   - The slide-up uses reanimated shared values + withTiming (same
 *     pattern as LandingPage), so the animation runs on the UI thread —
 *     no per-frame JS work.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TERRACES } from '@/src/data/terraces';
import { getBuildingsForTerrace } from '@/src/data/buildings';
import { getTreesForTerrace } from '@/src/data/trees';
import { computeRangeScore, computeSunScore } from '@/src/engines/scoring';
import { formatHour, sunUntilHour } from '@/src/engines/sunUntil';
import type { Terrace } from '@/src/engines/types';
import { haptics } from '@/src/lib/haptics';
import { useSelectionStore } from '@/src/store/selectionStore';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useStrings } from '@/src/i18n/useStrings';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  scoreToColor,
  spacing,
} from '@/src/theme/tokens';

export function TerracePeekCard() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const stage = useSelectionStore((s) => s.stage);

  const terrace = useMemo(() => {
    if (selectedId == null) return null;
    return TERRACES.find((t) => t.id === selectedId) ?? null;
  }, [selectedId]);

  if (stage !== 'peek' || terrace == null) return null;

  // Key by terrace id so switching pins remounts the card body and
  // replays the slide-up — the card visibly "arrives" for the new pin.
  return <PeekCardBody key={terrace.id} terrace={terrace} />;
}

function PeekCardBody({ terrace }: { terrace: Terrace }) {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const expand = useSelectionStore((s) => s.expand);
  const clear = useSelectionStore((s) => s.clear);
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  // Static per-terrace context — cheap table lookups, but resolved once
  // and shared by both scoring memos below.
  const buildings = useMemo(() => getBuildingsForTerrace(terrace.id), [terrace.id]);
  const trees = useMemo(() => getTreesForTerrace(terrace.id), [terrace.id]);

  // Same scoring inputs as TerraceDetailSheet so the chip here always
  // matches the chip the user sees after expanding.
  const score = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return computeRangeScore(
      terrace,
      fromHour,
      toHour,
      dateStr,
      weatherProfile,
      hourlyWeather,
      buildings,
      trees,
    );
  }, [terrace, buildings, trees, dateOffset, fromHour, toHour, weatherProfile, weatherByDate]);

  /** "Sun until HH:00" from the visit-window start, or null when shaded. */
  const sunUntil = useMemo(() => {
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    const hourlyScores = Array.from({ length: 24 }, (_, h) =>
      computeSunScore(
        terrace,
        h,
        dateStr,
        weatherProfile,
        hourlyWeather?.[h],
        buildings,
        trees,
      ).score,
    );
    return sunUntilHour(hourlyScores, fromHour);
  }, [terrace, buildings, trees, dateOffset, fromHour, weatherProfile, weatherByDate]);

  const handleExpand = useCallback(() => {
    haptics.light();
    expand();
  }, [expand]);

  const handleDismiss = useCallback(() => {
    haptics.light();
    clear();
  }, [clear]);

  // Slide-up + fade on mount. Shared values animate on the UI thread;
  // the body remounts per terrace (keyed above), so mount-once is enough.
  const translateY = useSharedValue(32);
  const opacity = useSharedValue(0);
  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
  }, [translateY, opacity]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const sunLine = sunUntil != null ? t.peekSunUntil(formatHour(sunUntil)) : t.peekInShade;

  return (
    <Animated.View
      style={[styles.wrap, { bottom: insets.bottom + spacing.lg }, cardStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handleExpand}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={terrace.name}
        accessibilityHint={t.peekOpenA11y}
      >
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {terrace.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {terrace.area}  ·  {sunLine}
          </Text>
        </View>
        <View style={[styles.scoreChip, { backgroundColor: scoreToColor(score) }]}>
          <Text style={styles.scorePct}>{Math.round(score * 100)}</Text>
          <Text style={styles.scoreUnit}>%</Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t.peekDismissA11y}
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Full-width anchor strip; box-none so map taps beside the card pass
  // through. The card itself captures its own touches.
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    // `bottom` set inline — needs the safe-area inset.
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    // Same floating treatment as the home/locate buttons so the card
    // reads as sitting above both the map and the MainSheet handle.
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: 2,
  },
  // Smaller sibling of the detail sheet's score chip — same colour scale
  // so the number carries over 1:1 when the card expands.
  scoreChip: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePct: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.white,
  },
  scoreUnit: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.white,
    marginLeft: 1,
    marginTop: 3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.sandDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.65,
  },
  closeGlyph: {
    fontSize: 13,
    lineHeight: 16,
    color: palette.inkSoft,
  },
});
