/**
 * Modal bottom sheet showing the detail of a single terrace.
 *
 * Opens when `useSelectionStore.selectedId` is set. Uses Gorhom
 * `BottomSheetModal` so it overlays the main sheet without dismissing it.
 *
 * Contents:
 *   - Header: name (Fraunces), area · facing · capacity, current score chip
 *   - SunTimeline (24h score bars, current hour highlighted)
 *   - Address + vibe
 *   - "Open in Apple Maps" action — uses `Linking` with `maps://` so it
 *     hands off to the native app cleanly.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';

import { TERRACES } from '@/src/data/terraces';
import { SunTimeline } from '@/src/components/SunTimeline';
import { computeRangeScore, scoreLabel } from '@/src/engines/scoring';
import { getBuildings } from '@/src/data/buildings';
import { useSelectionStore } from '@/src/store/selectionStore';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  scoreToColor,
  spacing,
} from '@/src/theme/tokens';

const FACING_LABELS: Record<string, string> = {
  N: 'North',
  NE: 'Northeast',
  E: 'East',
  SE: 'Southeast',
  S: 'South',
  SW: 'Southwest',
  W: 'West',
  NW: 'Northwest',
  All: 'All directions',
};

const CAPACITY_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

export function TerraceDetailSheet() {
  const ref = useRef<BottomSheetModal>(null);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const clear = useSelectionStore((s) => s.clear);
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const terrace = useMemo(() => {
    if (selectedId == null) return null;
    return TERRACES.find((t) => t.id === selectedId) ?? null;
  }, [selectedId]);

  // Open / close the sheet based on store state.
  useEffect(() => {
    if (selectedId != null) ref.current?.present();
    else ref.current?.dismiss();
  }, [selectedId]);

  const score = useMemo(() => {
    if (!terrace) return 0;
    const buildings = getBuildings();
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return computeRangeScore(
      terrace,
      buildings,
      fromHour,
      toHour,
      dateStr,
      weatherProfile,
      hourlyWeather,
    );
  }, [terrace, dateOffset, fromHour, toHour, weatherProfile, weatherByDate]);

  const rangeLabel = useMemo(() => {
    const f = fromHour.toString().padStart(2, '0');
    const t = toHour.toString().padStart(2, '0');
    return fromHour === toHour ? `at ${f}:00` : `${f}:00 – ${t}:00`;
  }, [fromHour, toHour]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
      />
    ),
    [],
  );

  const handleOpenInMaps = useCallback(() => {
    if (!terrace) return;
    const label = encodeURIComponent(terrace.name);
    const lat = terrace.lat;
    const lng = terrace.lng;
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${label}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() => {
      // Fallback to web Google Maps if the native app isn't reachable.
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
    });
  }, [terrace]);

  const setPanTo = useSelectionStore((s) => s.setPanTo);
  const handleShowOnMap = useCallback(() => {
    if (!terrace) return;
    setPanTo({ lat: terrace.lat, lng: terrace.lng });
    clear();
  }, [terrace, setPanTo, clear]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['70%', '92%']}
      enableDynamicSizing={false}
      onDismiss={clear}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetView style={styles.content}>
        {terrace ? (
          <>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={2}>
                  {terrace.name}
                </Text>
                <Text style={styles.subtitle}>
                  {terrace.area} · {FACING_LABELS[terrace.facing] ?? terrace.facing} ·{' '}
                  {CAPACITY_LABELS[terrace.capacity] ?? terrace.capacity}
                </Text>
              </View>
              <View style={[styles.scoreChip, { backgroundColor: scoreToColor(score) }]}>
                <Text style={styles.scorePct}>{Math.round(score * 100)}</Text>
                <Text style={styles.scoreUnit}>%</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Sun today</Text>
            <SunTimeline terrace={terrace} />
            <Text style={styles.scoreLabelText}>
              {rangeLabel}: <Text style={styles.scoreLabelStrong}>{scoreLabel(score)}</Text>
            </Text>

            {terrace.vibe ? (
              <>
                <Text style={styles.sectionLabel}>Vibe</Text>
                <Text style={styles.body}>{terrace.vibe}</Text>
              </>
            ) : null}

            {terrace.address ? (
              <>
                <Text style={styles.sectionLabel}>Address</Text>
                <Text style={styles.body}>{terrace.address}</Text>
              </>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleShowOnMap}
                style={({ pressed }) => [
                  styles.action,
                  styles.actionSecondary,
                  pressed && styles.actionPressed,
                ]}
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>
                  Show on Map
                </Text>
              </Pressable>
              <Pressable
                onPress={handleOpenInMaps}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <Text style={styles.actionText}>Open in Apple Maps</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: palette.mistDeep,
    width: 36,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginTop: spacing.xs,
  },
  scoreChip: {
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  scorePct: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.white,
  },
  scoreUnit: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.sm,
    color: palette.white,
    marginLeft: 1,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  scoreLabelText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    paddingHorizontal: spacing.lg,
  },
  scoreLabelStrong: {
    fontFamily: fonts.bodySemibold,
    color: palette.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.ink,
    lineHeight: fontSizes.md * 1.4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  action: {
    flex: 1,
    backgroundColor: palette.amber,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  actionSecondary: {
    backgroundColor: palette.sandDeep,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
  actionTextSecondary: {
    color: palette.ink,
  },
});
