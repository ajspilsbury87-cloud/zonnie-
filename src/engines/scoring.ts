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
import { shadowCoverage } from './shadow';
import type {
  Building,
  Facing,
  ScoreResult,
  Terrace,
  Weather,
  WeatherProfile,
} from './types';

export const AMSTERDAM_TZ = 'Europe/Amsterdam';
/** Amsterdam centroid — citywide solar calcs (sunset, etc.) when no terrace coord is in scope. */
export const AMSTERDAM_LAT = 52.3676;
export const AMSTERDAM_LNG = 4.9041;

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

/**
 * Wind-shelter multiplier. A terrace facing INTO the wind takes a comfort
 * penalty (cold + buffeting). A terrace facing AWAY from the wind is
 * sheltered behind its own building and takes none.
 *
 * Meteorological convention: `windDirection` is the direction wind is
 * coming FROM (0 = wind from north). So a S-facing terrace (opens south,
 * building behind to north) is sheltered when windDirection ≈ 0 (N wind
 * blocked by the building). It's most exposed when windDirection ≈ 180
 * (S wind blowing right at the seating area).
 *
 * Ramps in only above 8 km/h — calm days are unaffected. Caps the penalty
 * at ~15% so wind never dominates the sun signal.
 */
export function windShelterFactor(facing: Facing, weather: Weather): number {
  const windSpeed = weather.windSpeed;
  const windDir = weather.windDirection;
  if (windSpeed == null || windDir == null) return 1.0;
  if (windSpeed < 8) return 1.0; // calm — no penalty
  const facingAz = FACING_AZIMUTHS[facing];
  // Penalty ramps from 0 at 8 km/h up to 0.15 at 50+ km/h.
  const penaltyMagnitude = Math.min(0.15, (windSpeed - 8) / 280);
  if (facingAz < 0) {
    // 'All' facing (rooftop / open square) — no shelter at any direction.
    return 1.0 - penaltyMagnitude;
  }
  // Wind blowing AT the open side of the terrace = exposure 1; blowing
  // AT the back of the building (sheltering the terrace) = exposure 0.
  // Wind direction `windDir` is FROM-direction, so wind hits the terrace
  // when (windDir + 180) ≈ facingAz, i.e. when |windDir - (facingAz-180)|
  // is small. Equivalently: |windDir - facingAz| ≈ 180 = sheltered, ≈ 0
  // = exposed. Cosine maps that smoothly.
  const angleDiff = Math.abs(facingAz - windDir);
  const minDiff = Math.min(angleDiff, 360 - angleDiff);
  // Physics:
  //   facingAz = direction the terrace OPENS toward (where seating looks)
  //   windDir  = direction wind is COMING FROM (meteorology convention)
  //
  // Case 1: windDir == facingAz (e.g., N-facing terrace, wind from N).
  //   Building is BEHIND the terrace (south, opposite to facing). Wind
  //   blows from north → south, directly into the open seating area.
  //   → EXPOSED.
  // Case 2: windDir == facingAz ± 180 (e.g., S-facing terrace, wind from N).
  //   Building is to the north. Wind hits the building first; seating is
  //   in the lee. → SHELTERED.
  //
  // So: small minDiff = exposed; large minDiff = sheltered.
  // Mapping: exposure = (1 + cos(minDiff)) / 2
  //   minDiff = 0   → cos = 1  → exposure = 1 (fully exposed)
  //   minDiff = 180 → cos = -1 → exposure = 0 (fully sheltered)
  const exposure = (1 + Math.cos((minDiff * Math.PI) / 180)) / 2;
  return 1.0 - penaltyMagnitude * exposure;
}

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
  const coverage = shadowCoverage(terrace, buildings, sun.altitude, sun.azimuth);

  let score = 0;
  if (sun.altitude > 0) {
    // Altitude factor: max out at sun altitude 60° instead of 45°. This
    // leaves more headroom — a midday sun isn't the absolute peak any
    // more — so the facing bonus and 'All' multiplier don't slam every
    // terrace into the 1.0 cap. Score 1.0 is reserved for "perfect noon
    // + south-facing + sunny" cases, which is what users intuitively
    // expect "100%" to mean.
    score = Math.min(1, sun.altitude / 60);
    // Continuous shadow attenuation — the multiplier ramps smoothly from 1.0
    // (no obstruction) down to 0.15 (fully blocked). Replaces the old binary
    // "in shadow → ×0.15, else ×1.0" cliff that produced bimodal score
    // distributions.
    score *= 1 - 0.85 * coverage;
    // Cloud penalty: 100% cloud cover reduces score to ~45% of clear-sky.
    // 0.55 keeps the cloud signal meaningful while preserving enough
    // dynamic range that shadow + facing differentiation still lands in
    // different score bands.
    score *= 1 - (weather.cloudCover / 100) * 0.55;

    const facingAzimuth = FACING_AZIMUTHS[terrace.facing];
    if (facingAzimuth >= 0) {
      const diff = Math.abs(sun.azimuth - facingAzimuth);
      const facingDiff = Math.min(diff, 360 - diff);
      if (facingDiff < 90) {
        // Reduced from 0.3 to 0.25 — combined with the higher altitude
        // ceiling (60° instead of 45°), keeps S-facing midday under the
        // cap while still being clearly the best.
        score *= 1 + (1 - facingDiff / 90) * 0.25;
      } else {
        // Beyond 90° from sun (e.g., N-facing at noon) the terrace is in
        // the building's own shadow regardless of nearby buildings. Pin
        // a 0.6 multiplier so it scores noticeably lower than even an
        // E/W-facing one.
        score *= 0.6;
      }
    } else {
      // 'All' facing (rooftop / 360°) gets flat +15% (down from +20%).
      score *= 1.15;
    }

    // Wind-shelter factor: open terraces facing INTO the wind take a
    // comfort penalty; terraces facing AWAY from the wind (i.e., sheltered
    // by the building behind them) take none. None of our competitors do
    // this. Ramps in only on noticeably windy days (>8 km/h) so calm
    // afternoons aren't affected.
    score *= windShelterFactor(terrace.facing, weather);
  }

  return {
    score: Math.min(1, Math.max(0, score)),
    sun,
    shadow: coverage,
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
