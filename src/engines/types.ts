/**
 * Shared types for the solar/shadow/scoring engines.
 * Mirrors the schema in `terras-tracker/src/data/terraces.json`.
 */

export type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'All';

export type Capacity = 'S' | 'M' | 'L';

export type WeatherProfile = 'sunny' | 'partlyCloudy' | 'cloudy' | 'overcast';

export type CoordSource = 'places_api' | 'manual' | 'estimated';

export interface Terrace {
  id: number;
  name: string;
  lat: number;
  lng: number;
  area: string;
  facing: Facing;
  capacity: Capacity;
  vibe: string;
  address: string;
  verified: boolean;
  /** Added in PR 3 — origin of the lat/lng. Optional for backwards compat with the legacy JSON. */
  coordSource?: CoordSource;
  /** ISO8601 timestamp of last verification. */
  verifiedAt?: string;
  /**
   * Google Places place ID for this terrace, when known. Used at runtime to
   * fetch details (rating, hours, phone) and for Google Maps deep-link
   * navigation. Backfilled from `coord_corrections.jsonl`.
   */
  placeId?: string;
}

export interface Building {
  lat: number;
  lng: number;
  /** Metres above ground. */
  height: number;
  /** Approximate footprint width in metres (used for angular-width tolerance). */
  width?: number;
}

export interface SunPosition {
  /** Degrees above horizon. 0 = horizon, 90 = zenith, negative = below horizon. */
  altitude: number;
  /** Degrees from north, clockwise. 0 = N, 90 = E, 180 = S, 270 = W. */
  azimuth: number;
}

export interface Weather {
  /** 0–100. */
  cloudCover: number;
  /** Celsius. */
  temp: number;
}

export interface ScoreResult {
  /** 0–1 normalized sun score. */
  score: number;
  sun: SunPosition;
  shadow: boolean;
  weather: Weather;
}
