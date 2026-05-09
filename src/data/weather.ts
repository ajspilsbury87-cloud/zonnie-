/**
 * Hourly weather forecast for Amsterdam, sourced from Open-Meteo.
 *
 * Why Open-Meteo over KNMI: KNMI's open data is dataset-based (GRIB files)
 * and not consumable directly from a phone. Open-Meteo wraps the same
 * underlying ECMWF + DWD models in a phone-friendly JSON API with no key,
 * no rate limits, and 7-day forecast horizon that matches our date picker.
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
      // wind_speed_10m + wind_direction_10m feed the wind-shelter score
      // (engines/scoring → terrace facing × wind direction). Adds ~3KB
      // per response, no extra request — same endpoint, just more fields.
      hourly: 'cloud_cover,temperature_2m,wind_speed_10m,wind_direction_10m',
      start_date: dateStr,
      end_date: dateStr,
      timezone: 'Europe/Amsterdam',
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
    };
  };

  const cloud = data.hourly?.cloud_cover;
  const temp = data.hourly?.temperature_2m;
  const wind = data.hourly?.wind_speed_10m;
  const windDir = data.hourly?.wind_direction_10m;
  const time = data.hourly?.time;
  if (!cloud || !temp || !time || cloud.length !== 24) {
    throw new Error(`Unexpected Open-Meteo payload (got ${cloud?.length ?? 0} hours)`);
  }

  return Array.from({ length: 24 }, (_, h) => ({
    cloudCover: Math.round(cloud[h] ?? 0),
    temp: Math.round(temp[h] ?? 0),
    windSpeed: wind?.[h] != null ? Math.round(wind[h]!) : undefined,
    windDirection: windDir?.[h] != null ? Math.round(windDir[h]!) : undefined,
  }));
}
