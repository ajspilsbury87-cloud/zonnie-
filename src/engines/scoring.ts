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
import { shadowCoverage, treeShadowCoverage } from './shadow';
import type {
  Building,
  Facing,
  ScoreResult,
  Terrace,
  Tree,
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

/**
 * Temperature comfort multiplier.
 *
 * Even in full sun, a 10°C day on an Amsterdam terrace is noticeably less
 * pleasant than a 25°C one. This factor shifts scores up on warm days and
 * down on cold ones, so the ranking reflects the full outdoor experience
 * rather than sun position alone.
 *
 * Baseline: 20°C (comfortable Dutch terrace weather). Linear ramp of ±15%
 * over 10°C on each side — enough to meaningfully separate a cool noon
 * from a warm afternoon, but small enough that the sun altitude signal
 * always dominates.
 *
 *   10°C → ×0.85   (cold, most people wouldn't sit outside long)
 *   15°C → ×0.925  (cool, fleece weather)
 *   20°C → ×1.0    (baseline comfortable)
 *   25°C → ×1.075  (warm, ideal terrace conditions)
 *   30°C → ×1.15   (hot, still pleasant in the shade)
 */
export function temperatureFactor(temp: number): number {
  const normalised = Math.max(-1, Math.min(1, (temp - 20) / 10));
  return 1 + normalised * 0.15;
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
  /**
   * Optional nearby trees from the Bomenkaart dataset. When provided,
   * tree canopy shadow is combined with building shadow (Math.max).
   * Pass an empty array or omit to skip tree shadow (e.g. during
   * testing or when Bomenkaart data hasn't been fetched yet).
   */
  trees?: Tree[],
): ScoreResult {
  const utcDate = amsterdamLocalToUtc(dateStr, hour);
  const sun = solarPosition(utcDate, terrace.lat, terrace.lng);
  const weather = weatherOverride ?? getWeather(hour, weatherProfile);
  const buildingCoverage = shadowCoverage(terrace, buildings, sun.altitude, sun.azimuth);
  const treeCoverage = trees && trees.length > 0
    ? treeShadowCoverage(terrace, trees, sun.altitude, sun.azimuth)
    : 0;
  const coverage = Math.max(buildingCoverage, treeCoverage);

  let score = 0;
  if (sun.altitude > 0) {
    // Altitude factor: sqrt(altitude / 61).
    //
    // Earlier versions used `min(1, altitude / 60)` — physically right for
    // solar irradiance (W/m²), but it under-rated the perceived "sunniness"
    // of golden-hour and evening sun. At alt 19° (a sunny May 19:00) the
    // linear curve gives 0.32 — labelled "Partial Sun" — but the actual
    // experience on a W-facing terrace is bright and warm. Andy flagged
    // the top evening scores reading 28% as "Mostly Shade" which is wrong.
    //
    // sqrt(alt / 61) calibrates the scale to Amsterdam's actual sky:
    //   61° = 90° - 52.37° (latitude) + 23.45° (max solar declination)
    //       = the highest the sun ever gets in Amsterdam (midsummer noon).
    // Using 61 as the denominator means a perfect midsummer noon → score
    // of 1.0 (100). Using the old denominator of 90 (theoretical zenith,
    // unreachable here) permanently capped real-world scores at ~0.82
    // (√(61/90) ≈ 0.82), which made perfect sunny afternoons read as ~76
    // instead of the ~95+ locals expect.
    //
    // The sqrt curve still:
    //   - lifts evening scores into the Partial → Mostly-Sunny range
    //   - mirrors human perception: sun feels "sunny" across a wide
    //     altitude range, not just at noon
    // Math.min(1, ...) caps the result so scores never exceed 1.0 on
    // the rare day an altitude measurement rounds above 61°.
    score = Math.min(1, Math.sqrt(sun.altitude / 61));
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
        // Sun is in front of the terrace: linear bonus from +25% (aligned)
        // down to ×1.0 (perpendicular). Unchanged from before.
        score *= 1 + (1 - facingDiff / 90) * 0.25;
      } else {
        // Sun is behind the terrace: the host building's own shadow falls
        // over the seating area, reducing score. Smooth linear ramp from
        // ×1.0 at 90° down to ×0.6 at 180°.
        //
        // Previously this was a flat ×0.6 for ALL diffs ≥ 90°, which
        // created a harsh cliff: at sun-az 269° (diff=89°) a S-facing
        // terrace scored ×1.003, but at 270° (diff=90°) it dropped to
        // ×0.600 — a 40% jump for a 1° sun movement. The smooth ramp
        // removes that discontinuity while preserving the ×0.6 maximum
        // penalty at 180° (sun exactly behind the terrace).
        score *= 1 - ((facingDiff - 90) / 90) * 0.4;
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

    // Temperature comfort factor: lifts warm afternoons, lowers cool mornings.
    // Max ±15% so sun altitude stays the primary signal.
    score *= temperatureFactor(weather.temp);
  }

  // ── Score normalisation ────────────────────────────────────────────────────
  //
  // The multiplicative chain can exceed 1.0 well before the clamp, because
  // Amsterdam's summer sun regularly reaches 55–58° altitude — which gives an
  // altFactor of 0.95–0.975 — and the facing bonus (×1.25 max) together with
  // the temperature factor (×1.15 max) combine to:
  //
  //   0.975 × 1.25 × 1.15 = 1.40  (raw score on a hot clear afternoon)
  //
  // Math.min(1, ...) silently discards that excess. On any warm, sunny day
  // this locks 50–100+ terraces to exactly 1.0, causing two visible bugs:
  //
  //   (a) All well-facing terraces display "99" regardless of their actual
  //       shadow, orientation, or distance from the sun's path — users see
  //       "99 everywhere, makes no sense."
  //
  //   (b) The relative colour banding in ZonnieMap spreads 5 pin colours
  //       across the visible score range. When that range is (0.80–1.0),
  //       a terrace at 0.84 ("Full Sun" by label) gets t = 0.18 → painted
  //       BLACK — deeply misleading.
  //
  // Fix: divide the raw score by MAX_RAW (the theoretical product of the two
  // bonus factors) before clamping. This preserves all relative orderings and
  // label semantics while ensuring the ceiling is only reached by a genuinely
  // extreme combination (perfect midsummer noon + 0% cloud + perfectly-aligned
  // terrace + 30°C heat):
  //
  //   Typical hot sunny afternoon, SW-facing, 22°C  → ~0.74  ("Full Sun")
  //   N-facing on same day                           → ~0.50  ("Mostly Sunny")
  //   In deep building shadow                        → ~0.15  ("Mostly Shade")
  //
  // This is the only change needed — the score label thresholds (0.7/0.5/0.3/
  // 0.1) remain correct, and relative comparisons across terraces are unaffected
  // because every terrace's score is divided by the same constant.
  const MAX_RAW = 1.25 * 1.15; // facingBonus_max × tempFactor_max = 1.4375
  return {
    score: Math.min(1, Math.max(0, score / MAX_RAW)),
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

export interface BestWindow {
  /** Start hour (Amsterdam local, inclusive). */
  fromHour: number;
  /** End hour (Amsterdam local, inclusive). */
  toHour: number;
  /** Average score across the window, 0–1. */
  avgScore: number;
  /** Peak (highest single-hour) score within the window, 0–1. */
  peakScore: number;
}

/**
 * Find the best contiguous sunny window for a terrace on a given day.
 *
 * Accepts a pre-computed array of 24 hourly scores (one per hour 0–23)
 * so callers that already have the hourly array (e.g. SunTimeline, the
 * detail sheet) don't trigger a redundant scoring pass.
 *
 * Algorithm: sliding window of `windowHours` hours, scored by average.
 * Ties broken by earlier start time. Returns null if no window has an
 * average score above `minScore`.
 *
 * @param hourlyScores  Array of 24 scores, index = Amsterdam local hour.
 * @param windowHours   Width of the window in hours (default 2).
 * @param minScore      Minimum average to qualify (default 0.35 = Partial Sun).
 * @param searchFrom    Earliest start hour to consider (default 8).
 * @param searchTo      Latest end hour to consider (default 21).
 */
export function findBestWindow(
  hourlyScores: readonly number[],
  windowHours = 2,
  minScore = 0.35,
  searchFrom = 8,
  searchTo = 21,
): BestWindow | null {
  if (hourlyScores.length < 24) return null;

  let bestAvg = -1;
  let bestFrom = -1;

  for (let start = searchFrom; start + windowHours - 1 <= searchTo; start++) {
    let sum = 0;
    for (let h = start; h < start + windowHours; h++) {
      sum += hourlyScores[h] ?? 0;
    }
    const avg = sum / windowHours;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestFrom = start;
    }
  }

  if (bestFrom < 0 || bestAvg < minScore) return null;

  const toHour = bestFrom + windowHours - 1;
  let peak = 0;
  for (let h = bestFrom; h <= toHour; h++) {
    peak = Math.max(peak, hourlyScores[h] ?? 0);
  }

  return {
    fromHour: bestFrom,
    toHour,
    avgScore: bestAvg,
    peakScore: peak,
  };
}

export function scoreLabel(score: number): string {
  if (score > 0.7) return 'Volle zon';
  if (score > 0.5) return 'Grotendeels zonnig';
  if (score > 0.3) return 'Deels zonnig';
  if (score > 0.1) return 'Grotendeels schaduw';
  return 'In de schaduw';
}

// scoreColor() was removed — it used hardcoded hex values that duplicated
// scoreToColor() in src/theme/tokens.ts (which stays in sync with the brand
// palette). Nothing imported scoreColor from this module; use scoreToColor
// from tokens.ts for all score → colour mappings.
