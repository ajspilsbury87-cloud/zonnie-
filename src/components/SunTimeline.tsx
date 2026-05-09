/**
 * Hour-by-hour sun score bar chart for a single terrace.
 *
 * 24 vertical bars (one per hour 0–23) tinted by score and sized by score
 * height. Hours within the user's selected visit window are filled; others
 * are dimmed. Tapping an hour bar shifts the visit window to a single-hour
 * range starting at that hour, which is a quick way to ask "what about JUST
 * 6pm?" without thumbing through the picker.
 *
 * Pure RN Views — no charting dep.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { getBuildingsForTerrace } from '@/src/data/buildings';
import { computeSunScore } from '@/src/engines/scoring';
import { selectedDateStr, useTimeStore } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import type { Terrace } from '@/src/engines/types';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

/**
 * Saturated bar palette tuned for the timeline chart specifically.
 * The in-app `scoreToColor()` (warmer brand tones — burnt, orange,
 * mustard, cocoa) read as muted on a white sheet at chart scale —
 * Andy's feedback was the bars look dim. Mirrors the more
 * saturated map-pin palette so the chart pops alongside the sun
 * pins users see on the map.
 */
function timelineBarColor(score: number): string {
  if (score > 0.7) return '#FF6B1A'; // vivid bright orange — full sun
  if (score > 0.5) return '#F59328'; // warm orange — mostly sunny
  if (score > 0.3) return '#F4C443'; // saturated mustard — partial sun
  if (score > 0.1) return '#9A3A19'; // rust brown — mostly shade
  return '#5A2410'; // deep cocoa — shade
}

const BAR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface SunTimelineProps {
  terrace: Pick<Terrace, 'id' | 'lat' | 'lng' | 'facing'>;
}

export function SunTimeline({ terrace }: SunTimelineProps) {
  const dateOffset = useTimeStore((s) => s.dateOffset);
  const weatherProfile = useTimeStore((s) => s.weatherProfile);
  const fromHour = useTimeStore((s) => s.fromHour);
  const toHour = useTimeStore((s) => s.toHour);
  const setRange = useTimeStore((s) => s.setRange);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  const hourly = useMemo(() => {
    const buildings = getBuildingsForTerrace(terrace.id);
    const dateStr = selectedDateStr(dateOffset);
    const entry = weatherByDate[dateStr];
    const hourlyWeather = entry?.status === 'ready' ? entry.data : undefined;
    return HOURS.map((h) => ({
      hour: h,
      score: computeSunScore(
        terrace,
        buildings,
        h,
        dateStr,
        weatherProfile,
        hourlyWeather?.[h],
      ).score,
    }));
  }, [terrace, dateOffset, weatherProfile, weatherByDate]);

  return (
    <View style={styles.root}>
      <View style={styles.barRow}>
        {hourly.map(({ hour, score }) => {
          const inRange = hour >= fromHour && hour <= toHour;
          const fillHeight = Math.max(2, score * BAR_HEIGHT);
          return (
            <TouchableOpacity
              key={hour}
              onPress={() => setRange(hour, hour)}
              activeOpacity={0.6}
              style={styles.barCol}
              hitSlop={4}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: fillHeight,
                      backgroundColor: timelineBarColor(score),
                      // Out-of-window hours dim noticeably less now that
                      // the in-window bars are saturated — was 0.35,
                      // bumped to 0.55 so out-of-window context stays
                      // legible (you can see the curve of the day).
                      opacity: inRange ? 1 : 0.55,
                    },
                  ]}
                />
              </View>
              {hour % 6 === 0 ? (
                <Text style={styles.hourLabel}>{hour.toString().padStart(2, '0')}</Text>
              ) : (
                <Text style={styles.hourLabelEmpty}> </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '70%',
    height: BAR_HEIGHT,
    backgroundColor: palette.mist,
    borderRadius: radii.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: radii.sm,
  },
  hourLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: spacing.xs,
  },
  hourLabelEmpty: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
  },
});
