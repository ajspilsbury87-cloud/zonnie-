/**
 * Hourly weather forecast for Amsterdam, sourced from Open-Meteo.
 *
 * Why Open-Meteo over KNMI: KNMI's open data is dataset-based (GRIB files)
 * and not consumable directly from a phone. Open-Meteo wraps multiple models
 * including KNMI HARMONIE-Arome (the gold-standard NL micro-forecast) in a
 * phone-friendly JSON API with no key, no rate limits, and 7-day forecast
 * horizon that matches our date picker.
 *
 * Model strategy: we use `models: 'best_match'` rather than pinning to
 * HARMONIE exclusively. For days 0–2, Open-Meteo resolves this to HARMONIE
 * automatically (same accuracy). For days 3–7 it uses ECMWF, which is
 * necessary because HARMONIE only forecasts ~48-72 hours out — pinning to it
 * caused all hours on days 4+ to return null from the API.
 *
 * Swap path to a different provider (KNMI proxy, OpenWeather, etc.): replace
 * `fetchHourlyForecast` here. The shape of `Weather[]` is provider-neutral.
 */

import type { Weather } from '@/src/engines/types';

/** Amsterdam centroid — single fetch covers all terraces in the dataset. */
const AMSTERDAM_LAT = 52.3676;
const AMSTERDAM_LNG = 4.9041;

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch a 24-hour weather forecast for the given local date in Amsterdam.
 * Returns an array indexed by local hour (0–23). Falls back to throwing on
 * network error — the caller is expected to retry / show fallback synthetic.
 */
export async function fetchHourlyForecast(dateStr: string): Promise<Weather[]> {
  const url =
    `${OPEN_METEO_URL}?` +
    new URLSearchParams({
      latitude: AMSTERDAM_LAT.toString(),
      longitude: AMSTERDAM_LNG.toString(),
      // wind_speed_10m + wind_direction_10m feed the wind-shelter score.
      // direct_radiation is the actual horizontal direct irradiance (W/m²)
      // — the scoring engine uses it as a better "is the sun shining?" signal
      // than cloud_cover fraction (which inflates when thin cirrus is present).
      // precipitation_probability (0–100 integer) is the hourly chance of rain,
      // shown in the detail sheet as a free user-facing feature. Not used in
      // scoring so it adds no risk to the scoring path, just display richness.
      // All fields add ~2–4 KB per response; same request, no extra API cost.
      hourly: 'cloud_cover,temperature_2m,wind_speed_10m,wind_direction_10m,direct_radiation,precipitation_probability',
      start_date: dateStr,
      end_date: dateStr,
      timezone: 'Europe/Amsterdam',
      // Use Open-Meteo's automatic best-model selection. For days 0–2 this
      // resolves to KNMI HARMONIE-Arome (higher-res NL model, same accuracy
      // as pinning explicitly). For days 3–7 it falls back to ECMWF, which
      // has full 7-day coverage — HARMONIE's horizon is only ~48-72 h, so
      // pinning to it caused all afternoon hours on days 4+ to return null,
      // which the ?-fallback silently converted to 0 °C / 0 % cloud (frozen
      // but sunny), making those day-strips appear blank in the UI.
      models: 'best_match',
    }).toString();

  // 10-second timeout via AbortController. We previously used the static
  // `AbortSignal.timeout(10_000)`, but that's a 2022 WHATWG fetch API
  // not yet shipped in React Native's whatwg-fetch polyfill — the call
  // throws `TypeError: AbortSignal.timeout is not a function` on-device,
  // the fetch never fires, and every weather request ends up in the
  // store's error state (so the strip shows "Weather unavailable" / the
  // summary line never appears). Manual controller works on every RN
  // version.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    hourly?: {
      time?: string[];
      cloud_cover?: number[];
      temperature_2m?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
      direct_radiation?: number[];
      precipitation_probability?: number[];
    };
  };

  const cloud = data.hourly?.cloud_cover;
  const temp = data.hourly?.temperature_2m;
  const wind = data.hourly?.wind_speed_10m;
  const windDir = data.hourly?.wind_direction_10m;
  const directRad = data.hourly?.direct_radiation;
  const precipProb = data.hourly?.precipitation_probability;
  const time = data.hourly?.time;
  // DST days return 23 (spring-forward) or 25 (fall-back, e.g. 2026-10-25)
  // hours, and after the transition array index no longer equals the local
  // hour. Require the arrays to be present and aligned within that range,
  // then map each reading to its ACTUAL local hour parsed from `time`
  // ('YYYY-MM-DDTHH:MM'), instead of assuming index === hour. The old
  // `length !== 24` throw killed the whole day's forecast on the DST day.
  if (!cloud || !temp || !time || time.length !== cloud.length ||
      cloud.length < 23 || cloud.length > 25) {
    throw new Error(`Unexpected Open-Meteo payload (got ${cloud?.length ?? 0} hours)`);
  }

  const idxForHour: (number | undefined)[] = new Array(24).fill(undefined);
  for (let i = 0; i < time.length; i++) {
    const h = Number(time[i]!.slice(11, 13));
    // Fall-back duplicates the 2:00 hour; last-write-wins (near-identical weather).
    if (h >= 0 && h <= 23) idxForHour[h] = i;
  }

  return Array.from({ length: 24 }, (_, h) => {
    const i = idxForHour[h];
    if (i == null) {
      // Spring-forward skips 02:00 — that hour has no reading. Sun's down; 0 is fine.
      return { cloudCover: 0, temp: 0, windSpeed: undefined, windDirection: undefined, directRadiation: undefined, precipProbability: undefined };
    }
    return {
      cloudCover: Math.round(cloud[i] ?? 0),
      temp: Math.round(temp[i] ?? 0),
      windSpeed: wind?.[i] != null ? Math.round(wind[i]!) : undefined,
      windDirection: windDir?.[i] != null ? Math.round(windDir[i]!) : undefined,
      directRadiation: directRad?.[i] != null ? Math.round(directRad[i]!) : undefined,
      // precipProbability: undefined when the API doesn't return this field —
      // callers must distinguish undefined (no data) from 0; never coerce.
      precipProbability: precipProb?.[i] != null ? Math.round(precipProb[i]!) : undefined,
    };
  });
}
