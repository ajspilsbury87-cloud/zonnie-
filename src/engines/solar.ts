/**
 * Solar position engine — direct port of `terras-tracker/src/engines/solar.js`.
 *
 * Simplified Solar Position Algorithm. Accuracy ~1°, sufficient for terrace scoring.
 * Pure math, zero dependencies — safe to call from any thread.
 */

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
