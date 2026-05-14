/**
 * Solar position engine — direct port of `terras-tracker/src/engines/solar.js`.
 *
 * Simplified Solar Position Algorithm. Accuracy ~1°, sufficient for terrace scoring.
 * Pure math, zero dependencies — safe to call from any thread.
 */

import { fromZonedTime } from 'date-fns-tz';

import type { SunPosition } from './types';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Convert a UTC Date to Julian Day number. */
export function julianDay(date: Date): number {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  if (m <= 2) {
    y--;
    m += 12;
  }

  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);

  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    d +
    h / 24 +
    B -
    1524.5
  );
}

/**
 * Compute the sun's position at a UTC instant for a given lat/lng.
 *
 * @param date  UTC instant
 * @param lat   degrees
 * @param lng   degrees
 */
export function solarPosition(date: Date, lat: number, lng: number): SunPosition {
  const jd = julianDay(date);
  const n = jd - 2451545.0;

  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) * DEG) as number;

  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = 23.439 * DEG;

  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  let ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  if (ra < 0) ra += 2 * Math.PI;

  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let ha = ((gmst + lng) % 360) * DEG - ra;
  if (ha < -Math.PI) ha += 2 * Math.PI;
  if (ha > Math.PI) ha -= 2 * Math.PI;

  const latRad = lat * DEG;
  const sinAlt =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(ha);
  const altitude = Math.asin(sinAlt) * RAD;

  const cosAz =
    (Math.sin(declination) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(altitude * DEG));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (Math.sin(ha) > 0) azimuth = 360 - azimuth;

  return { altitude, azimuth };
}

/**
 * Last integer hour (Amsterdam local time) on the given date where the
 * sun is still above the horizon. Used to cap the visit-window's "To"
 * slider — there's no point letting users pick a sun-score visit time
 * after sunset, when every terrace scores zero.
 *
 * Searches downward from 23:00 to find the latest hour with positive
 * altitude. Falls back to 12 if the sun never sets at this lat (won't
 * happen at Amsterdam's latitude, but the guard is cheap).
 *
 * Pure deterministic — just date + lat/lng — so the caller can safely
 * memo by dateStr.
 *
 * @param dateStr  YYYY-MM-DD in Amsterdam local time
 * @param lat      latitude in degrees
 * @param lng      longitude in degrees
 * @param tz       IANA timezone (e.g., 'Europe/Amsterdam')
 */
export function sunsetHour(
  dateStr: string,
  lat: number,
  lng: number,
  tz: string,
): number {
  for (let h = 23; h >= 12; h--) {
    const local = `${dateStr}T${h.toString().padStart(2, '0')}:00:00`;
    const utc = fromZonedTime(local, tz);
    const pos = solarPosition(utc, lat, lng);
    if (pos.altitude > 0) return h;
  }
  return 12;
}

/**
 * First hour of the day (Amsterdam local) when the sun is above the
 * horizon at the given lat/lng. Pre-sunrise hours have zero score
 * everywhere, so the time slider clamps to this value as its lower
 * bound — no point letting users pick 03:00 in May, the slider just
 * wastes space at the low end.
 *
 * Searches upward from 0 to find the earliest hour with positive
 * altitude. Falls back to 12 if the sun never rises (won't happen at
 * Amsterdam's latitude; guard is cheap).
 *
 * Pure deterministic; memo by dateStr at the caller.
 */
export function sunriseHour(
  dateStr: string,
  lat: number,
  lng: number,
  tz: string,
): number {
  for (let h = 0; h <= 12; h++) {
    const local = `${dateStr}T${h.toString().padStart(2, '0')}:00:00`;
    const utc = fromZonedTime(local, tz);
    const pos = solarPosition(utc, lat, lng);
    if (pos.altitude > 0) return h;
  }
  return 12;
}
