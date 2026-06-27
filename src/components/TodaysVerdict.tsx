/**
 * TodaysVerdict — glanceable daily-summary card rendered at the TOP of LandingPage.
 *
 * Purpose: give users a daily habit anchor — "is today worth going out?" at a
 * glance, even before they scroll down to the per-region sunniest-now list.
 *
 * Complements (doesn't duplicate) the existing landing content:
 *   TodaysVerdict  → whole-day city-wide summary ("is today a terrace day?")
 *   Featured carousel → paid/curated picks (always shown)
 *   Sunniest now   → ranked snapshot of RIGHT NOW (current 2-hour window)
 *
 * Data strategy:
 *   We score every terrace across the full "core day" window (08:00–21:00)
 *   to find which ones are good at ANY point today. This is intentionally
 *   different from the sunniest-now list's 2-hour current-window approach.
 *   The computeRangeScore + cachedHourScore path is the same engine, so
 *   scores are consistent with what the user sees elsewhere in the app.
 *
 *   For the "top picks" rows we pick the 3 highest-scoring terraces over the
 *   full day — these tend to be the most reliably sun-facing terraces.
 *
 *   For the favourite highlight we find the favourite with the highest
 *   full-day score, then report the LAST hour it stays above the strong
 *   threshold (i.e., "sun until X:00").
 *
 * Loading state:
 *   While weather hasn't loaded yet (`byDate[today]` is idle or loading),
 *   we show a neutral placeholder card. This avoids a flash of misleading
 *   low scores driven by the synthetic fallback profile.
 *
 * No new native dependencies — uses only imports already in the bundle.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useStrings } from '@/src/i18n/useStrings';
import { cachedHourScore } from '@/src/hooks/scoreCache';
import { TERRACES } from '@/src/data/terraces';
import { computeTodaysVerdict, VERDICT_STRONG_THRESHOLD } from '@/src/engines/todaysVerdict';
import { haptics } from '@/src/lib/haptics';
import { useSelectionStore } from '@/src/store/selectionStore';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { todayAmsterdamDateStr } from '@/src/store/timeStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { fonts, fontSizes, palette, radii, scoreToColor, spacing } from '@/src/theme/tokens';
import type { Terrace } from '@/src/engines/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Full core-day scoring range: 08:00–21:00. */
const DAY_FROM = 8;
const DAY_TO = 21;

/** Number of top picks shown in the card. */
const TOP_PICKS_COUNT = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoredForDay {
  terrace: Terrace;
  /** Peak single-hour score over DAY_FROM..DAY_TO. */
  peakScore: number;
  /** Hourly score array (indices 0–23). */
  hourly: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the 24-hour score array for one terrace using the cached scorer.
 * Cheap because cachedHourScore memoises (terrace, hour, date, weather).
 */
function buildHourlyScores(
  terrace: Terrace,
  dateStr: string,
  hourlyWeather: readonly import('@/src/engines/types').Weather[] | undefined,
): number[] {
  return Array.from({ length: 24 }, (_, h) =>
    cachedHourScore(terrace, h, dateStr, hourlyWeather?.[h]),
  );
}

/**
 * Find the last hour (before day end) at which a terrace's score is still
 * above the strong threshold. Used for the "sun until X:00" favourite line.
 *
 * Returns null when the terrace never clears the threshold at all.
 */
function lastStrongHour(hourly: number[]): number | null {
  let last: number | null = null;
  for (let h = DAY_FROM; h <= DAY_TO; h++) {
    const s = hourly[h];
    if (s != null && s > VERDICT_STRONG_THRESHOLD) last = h;
  }
  return last;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TodaysVerdict() {
  const t = useStrings();
  const select = useSelectionStore((s) => s.select);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
  const weatherByDate = useWeatherStore((s) => s.byDate);

  // Always score for today — this card is always about today regardless of
  // whatever date the user might have selected in the main time picker.
  const dateStr = todayAmsterdamDateStr();
  const weatherEntry = weatherByDate[dateStr];
  const isLoading =
    weatherEntry == null ||
    weatherEntry.status === 'idle' ||
    weatherEntry.status === 'loading';
  const hourlyWeather =
    weatherEntry?.status === 'ready' ? weatherEntry.data : undefined;

  // Full scoring pass — memoised on weather changes (same dep as LandingPage).
  const { scored, verdictData } = useMemo(() => {
    const allScored: ScoredForDay[] = TERRACES.map((terrace) => {
      const hourly = buildHourlyScores(terrace, dateStr, hourlyWeather);
      let peak = 0;
      for (let h = DAY_FROM; h <= DAY_TO; h++) {
        if ((hourly[h] ?? 0) > peak) peak = hourly[h] ?? 0;
      }
      return { terrace, peakScore: peak, hourly };
    });

    const allDayArrays = allScored.map((s) => s.hourly);
    return {
      scored: allScored,
      verdictData: computeTodaysVerdict(allDayArrays),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dateStr is stable for today; re-computes only when weather changes
  }, [weatherByDate, dateStr]);

  // Top N picks: highest peak score across the day, excluding zero-score entries.
  const topPicks = useMemo(() => {
    return [...scored]
      .sort((a, b) => b.peakScore - a.peakScore)
      .filter((s) => s.peakScore > 0)
      .slice(0, TOP_PICKS_COUNT);
  }, [scored]);

  // Best favourite for today: highest full-day score among saved terraces.
  const bestFavourite = useMemo(() => {
    if (favoriteIds.size === 0) return null;
    let best: ScoredForDay | null = null;
    for (const s of scored) {
      if (!favoriteIds.has(s.terrace.id)) continue;
      if (best == null || s.peakScore > best.peakScore) best = s;
    }
    if (best == null || best.peakScore <= VERDICT_STRONG_THRESHOLD) return null;
    const until = lastStrongHour(best.hourly);
    if (until == null) return null;
    return { terrace: best.terrace, untilHour: until };
  }, [scored, favoriteIds]);

  const handlePickPress = (terraceId: number) => {
    haptics.light();
    select(terraceId);
  };

  // ── Headline text ─────────────────────────────────────────────────────────

  const headlineText = isLoading
    ? t.verdictLoading
    : verdictData.tier === 'high'
      ? t.verdictHigh
      : verdictData.tier === 'mid'
        ? t.verdictMid
        : t.verdictLow;

  const statText = !isLoading && verdictData.strongCount > 0
    ? verdictData.bestWindow != null
      ? t.verdictStatLine(
          verdictData.strongCount,
          verdictData.bestWindow.fromHour,
          verdictData.bestWindow.toHour,
        )
      : t.verdictStatLineNoWindow(verdictData.strongCount)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>
      {/* Section label above the card */}
      <Text style={styles.sectionLabel}>{t.verdictSectionLabel}</Text>

      {/* Headline verdict */}
      <Text style={styles.headline} accessibilityRole="header">
        {headlineText}
      </Text>

      {/* Stat line — only when weather is loaded and there are strong terraces */}
      {statText != null ? (
        <Text style={styles.statLine}>{statText}</Text>
      ) : null}

      {/* Favourite highlight — only when user has a qualifying favourite */}
      {bestFavourite != null ? (
        <Pressable
          onPress={() => handlePickPress(bestFavourite.terrace.id)}
          style={({ pressed }) => [
            styles.favouriteLine,
            pressed && styles.rowPressed,
          ]}
          accessibilityLabel={t.verdictFavouriteLine(
            bestFavourite.terrace.name,
            bestFavourite.untilHour,
          )}
        >
          <Text style={styles.favouriteText} numberOfLines={1}>
            {t.verdictFavouriteLine(
              bestFavourite.terrace.name,
              bestFavourite.untilHour,
            )}
          </Text>
        </Pressable>
      ) : null}

      {/* Divider before top picks, only when picks exist */}
      {!isLoading && topPicks.length > 0 ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.picksLabel}>{t.verdictTopPicks}</Text>
          {topPicks.map((s) => (
            <VerdictPickRow
              key={s.terrace.id}
              terrace={s.terrace}
              score={s.peakScore}
              onPress={handlePickPress}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

// ── VerdictPickRow ─────────────────────────────────────────────────────────────

interface VerdictPickRowProps {
  terrace: Terrace;
  /** Peak score today (0–1). Displayed as a percentage badge. */
  score: number;
  onPress: (id: number) => void;
}

function VerdictPickRow({ terrace, score, onPress }: VerdictPickRowProps) {
  const pct = Math.round(score * 100);
  const color = scoreToColor(score);

  return (
    <Pressable
      onPress={() => onPress(terrace.id)}
      style={({ pressed }) => [styles.pickRow, pressed && styles.rowPressed]}
      accessibilityLabel={`Open ${terrace.name}, ${pct}% sun today`}
    >
      <View style={styles.pickBody}>
        <Text style={styles.pickName} numberOfLines={1}>
          {terrace.name}
        </Text>
        <Text style={styles.pickArea} numberOfLines={1}>
          {terrace.area}
        </Text>
      </View>
      <View style={[styles.pickScore, { backgroundColor: color }]}>
        <Text style={styles.pickScoreText}>{pct}</Text>
      </View>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // The outer card sits on the sand background — a slight elevation separates
  // it visually from the page without feeling like a modal.
  card: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    // A subtle warm left border gives the card a "daily brief" feel that
    // differentiates it from the venue cards below without being loud.
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  headline: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.ink,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  statLine: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    marginBottom: spacing.xs,
  },
  // Favourite highlight — warm tinted background to stand out slightly.
  favouriteLine: {
    backgroundColor: palette.cream,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  favouriteText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.burnt,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.mist,
    marginVertical: spacing.sm,
  },
  picksLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  // Pick row — matches the VenueCard shape in LandingPage for visual consistency.
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowPressed: {
    opacity: 0.7,
  },
  pickBody: {
    flex: 1,
    minWidth: 0,
  },
  pickName: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.sm,
    color: palette.ink,
    letterSpacing: -0.1,
  },
  pickArea: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    marginTop: 1,
  },
  pickScore: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  pickScoreText: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xs,
    color: palette.white,
  },
});
