/**
 * SunArc — the day drawn as a horizon (TodaysVerdict's hero visual).
 *
 * A dotted arc from morning to evening: dots inside the city's best sun
 * window glow warm, the rest stay muted, and a sun marker sits at "now".
 * The visual doubles as the data (Sunlitt-style) — no chart chrome.
 *
 * Deliberately dependency-free: react-native-svg isn't in the bundle, so
 * the arc is ~27 absolutely-positioned Views placed by pure trig
 * (sunArcGeometry.ts). They render once per weather change — no animation
 * loops, nothing on the JS thread after mount.
 *
 * Decorative by design: the statLine above the arc carries the same
 * information as text, so the whole arc is hidden from screen readers.
 */

import { StyleSheet, Text, View } from 'react-native';

import { ARC_RISE, ARC_WIDTH, arcPoint } from '@/src/engines/sunArcGeometry';
import { fonts, fontSizes, palette } from '@/src/theme/tokens';

/** Dot spacing along the arc, in hours. */
const DOT_STEP = 0.5;
const DOT_SIZE = 5;
const WARM_DOT_SIZE = 7;
const SUN_SIZE = 18;
const GLOW_SIZE = 30;
/** Vertical room under the baseline for the hour labels. */
const LABEL_STRIP = 16;
/** Headroom above the arc's peak so the sun marker + glow never clip. */
const TOP_PAD = Math.ceil(GLOW_SIZE / 2);

interface SunArcProps {
  /** Left horizon hour (start of the scored day). */
  fromHour: number;
  /** Right horizon hour (end of the scored day). */
  toHour: number;
  /** City-wide best sun window; null → no warm segment (grey day). */
  bestFrom: number | null;
  bestTo: number | null;
  /** Current time as a fractional hour; null hides the sun (e.g. tomorrow view). */
  nowHour: number | null;
}

export function SunArc({ fromHour, toHour, bestFrom, bestTo, nowHour }: SunArcProps) {
  const dots: { x: number; y: number; warm: boolean }[] = [];
  for (let h = fromHour; h <= toHour; h += DOT_STEP) {
    const { x, y } = arcPoint(h, fromHour, toHour);
    const warm = bestFrom != null && bestTo != null && h >= bestFrom && h <= bestTo;
    dots.push({ x, y, warm });
  }

  const sun =
    nowHour != null && nowHour >= fromHour && nowHour <= toHour
      ? arcPoint(nowHour, fromHour, toHour)
      : null;

  return (
    <View
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.arcBox}>
        {/* Horizon baseline */}
        <View style={styles.horizon} />
        {dots.map((d) => {
          const size = d.warm ? WARM_DOT_SIZE : DOT_SIZE;
          return (
            <View
              key={d.x}
              style={[
                styles.dot,
                d.warm && styles.dotWarm,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  left: d.x - size / 2,
                  bottom: LABEL_STRIP + d.y - size / 2,
                },
              ]}
            />
          );
        })}
        {sun != null ? (
          <>
            <View
              style={[
                styles.glow,
                {
                  left: sun.x - GLOW_SIZE / 2,
                  bottom: LABEL_STRIP + sun.y - GLOW_SIZE / 2,
                },
              ]}
            />
            <View
              style={[
                styles.sun,
                {
                  left: sun.x - SUN_SIZE / 2,
                  bottom: LABEL_STRIP + sun.y - SUN_SIZE / 2,
                },
              ]}
            />
          </>
        ) : null}
        {/* Horizon-end hour labels */}
        <Text style={[styles.hourLabel, styles.hourLabelLeft]}>
          {String(fromHour).padStart(2, '0')}
        </Text>
        <Text style={[styles.hourLabel, styles.hourLabelRight]}>
          {String(toHour).padStart(2, '0')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  arcBox: {
    width: ARC_WIDTH,
    height: TOP_PAD + ARC_RISE + LABEL_STRIP,
    position: 'relative',
  },
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: LABEL_STRIP,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.mist,
  },
  dot: {
    position: 'absolute',
    backgroundColor: palette.mistDeep,
  },
  dotWarm: {
    backgroundColor: palette.peach,
  },
  sun: {
    position: 'absolute',
    width: SUN_SIZE,
    height: SUN_SIZE,
    borderRadius: SUN_SIZE / 2,
    backgroundColor: palette.peach,
    borderWidth: 2,
    borderColor: palette.white,
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: palette.peach,
    opacity: 0.22,
  },
  hourLabel: {
    position: 'absolute',
    bottom: 0,
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.mistDeep,
  },
  hourLabelLeft: {
    left: 0,
  },
  hourLabelRight: {
    right: 0,
  },
});
