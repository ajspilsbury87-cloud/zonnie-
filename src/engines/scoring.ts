/**
 * Sun-score engine — port of `terras-tracker/src/engines/scoring.js`.
 *
 * Combines:
 *   1. Solar altitude (higher sun → higher base score)
 *   2. Shadow obstruction (in-shadow → 15% of full sun)
 *   3. Cloud cover attenuation (100% cloud → 85% reduction)
 *   4. Terrace orientation bonus (facing the sun → up to +30%)
 *
 * Change from the prototype: the hardcoded `utcOffset = 2` parameter is gone.
 * Instead we resolve dates against `Europe/Amsterdam` so the engine is correct
 * year-round (CET in winter, CEST in summer). See HANDOVER.md gotcha #1.
 */

import { fromZonedTime } from 'date-fns-tz';
import { solarPosition } from './solar';
import { isInShadow } from './shadow';
import type {
  Building,
  Facing,
  ScoreResult,
  Terrace,
  Weather,
  WeatherProfile,
} from './types';

export const AMSTERDAM_TZ = 'Europe/Amsterdam';

const FACING_AZIMUTHS: Record<Facing, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
  All: -1,
};

interface WeatherProfileBaseline {
  baseCloud: number;
  baseTemp: number;
}

const WEATHER_PROFILES: Record<WeatherProfile, WeatherProfileBaseline> = {
  sunny: { baseCloud: 10, baseTemp: 18 },
  partlyCloudy: { baseCloud: 40, baseTemp: 16 },
  cloudy: { baseCloud: 75, baseTemp: 14 },
  overcast: { baseCloud: 95, baseTemp: 12 },
};

/**
 * Synthesised weather for an hour-of-day given a profile preset.
 * KNMI live data is the planned replacement (PR 14).
 */
export function getWeather(hour: number, profile: WeatherProfile): Weather {
  const p = WEATHER_PROFILES[profile];
  const cloudCover = Math.max(0, Math.min(100, p.baseCloud + Math.sin(hour * 0.7) * 10));
  const temp = Math.round(p.baseTemp + Math.sin(((hour - 6) * Math.PI) / 16) * 7.5);
  return { cloudCover: Math.round(cloudCover), temp };
}

/**
 * Resolve a local-Amsterdam wall-clock time to a UTC instant, DST-correct.
 * Exported for tests + day-timeline view.
 */
export function amsterdamLocalToUtc(dateStr: string, hour: number): Date {
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const ss = Math.floor((((hour - hh) * 60) - mm) * 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const localISO = `${dateStr}T${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return fromZonedTime(localISO, AMSTERDAM_TZ);
}

/**
 * Compute the sun score for a single terrace at a given local Amsterdam date/hour.
 *
 * @param terrace          Terrace (only lat/lng/facing are read)
 * @param buildings        Nearby buildings for shadow ray-casting
 * @param hour             Hour of day in Amsterdam local time (fractional, e.g. 14.5)
 * @param dateStr          Date in 'YYYY-MM-DD' (interpreted as Amsterdam local)
 * @param weatherProfile   sunny | partlyCloudy | cloudy | overcast
 */
export function computeSunScore(
  terrace: Pick<Terrace, 'lat' | 'lng' | 'facing'>,
  buildings: Building[],
  hour: number,
  dateStr: string,
  weatherProfile: WeatherProfile,
  /**
   * Optional real-forecast weather for this exact hour. When provided
   * (e.g., from Open-Meteo via weatherStore), overrides the synthetic
   * profile. When absent, falls back to the synthetic curve so the
   * engine stays runnable offline / before the fetch lands.
   */
  weatherOverride?: Weather,
): ScoreResult {
  const utcDate = amsterdamLocalToUtc(dateStr, hour);
  const sun = solarPosition(utcDate, terrace.lat, terrace.lng);
  const weather = weatherOverride ?? getWeather(hour, weatherProfile);
  const inShadow = isInShadow(terrace, buildings, sun.altitude, sun.azimuth);

  let score = 0;
  if (sun.altitude > 0) {
    score = Math.min(1, sun.altitude / 45);
    if (inShadow) score *= 0.15;
    // Cloud penalty: 100% cloud cover reduces score to ~45% of clear-sky.
    // Previously this was 0.85 (100% cloud → 15% of clear), which on a
    // cloudy day in Amsterdam crushed every terrace into the same low
    // score band and the map looked uniformly grey. The shadow / facing
    // factors couldn't distinguish terraces because cloud was multiplying
    // them all by the same tiny number.
    //
    // 0.55 keeps the cloud signal meaningful (a cloudy day clearly scores
    // lower than a clear one) while preserving enough dynamic range that
    // shadow + facing differentiation still lands in different score bands.
    score *= 1 - (weather.cloudCover / 100) * 0.55;

    const facingAzimuth = FACING_AZIMUTHS[terrace.facing];
    if (facingAzimuth >= 0) {
      const diff = Math.abs(sun.azimuth - facingAzimuth);
      const facingDiff = Math.min(diff, 360 - diff);
      if (facingDiff < 90) {
        score *= 1 + (1 - facingDiff / 90) * 0.3;
      }
    } else {
      // 'All' facing (rooftop / 360°) gets flat +20%.
      score *= 1.2;
    }
  }

  return {
    score: Math.min(1, Math.max(0, score)),
    sun,
    shadow: inShadow,
    weather,
  };
}

/**
 * Average sun score across an inclusive hour range [fromHour..toHour].
 *
 * Used when the user picks a "visit window" (e.g., 14:00–17:00). We sample
 * every integer hour and average; cheap because there are at most 24 samples
 * per terrace per call. Returns 0 if `toHour < fromHour` (caller should clamp).
 */
export function computeRangeScore(
  terrace: Pick<Terrace, 'lat' | 'lng' | 'facing'>,
  buildings: Building[],
  fromHour: number,
  toHour: number,
  dateStr: string,
  weatherProfile: WeatherProfile,
  /**
   * Optional 24-hour forecast indexed by hour. When provided, overrides
   * the synthetic weather profile per-hour. Indices outside [fromHour..toHour]
   * are ignored.
   */
  hourlyWeather?: readonly Weather[],
): number {
  if (toHour < fromHour) return 0;
  let sum = 0;
  let count = 0;
  for (let h = fromHour; h <= toHour; h++) {
    const override = hourlyWeather?.[h];
    sum += computeSunScore(terrace, buildings, h, dateStr, weatherProfile, override).score;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function scoreLabel(score: number): string {
  if (score > 0.7) return 'Full Sun';
  if (score > 0.5) return 'Mostly Sunny';
  if (score > 0.3) return 'Partial Sun';
  if (score > 0.1) return 'Mostly Shade';
  return 'In Shadow';
}

export function scoreColor(score: number): string {
  if (score > 0.7) return '#F59E0B';
  if (score > 0.5) return '#FBBF24';
  if (score > 0.3) return '#D97706';
  if (score > 0.1) return '#6B7280';
  return '#374151';
}
