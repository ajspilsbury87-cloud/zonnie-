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
  /**
   * Paid-placement / curated-feature flag. When true, this terrace
   * surfaces as the lead card on the LandingPage regardless of its
   * computed sun score, with a "Featured" badge. v1 plumbing only —
   * no terraces have it set yet; introduced so the monetisation
   * surface exists when we open it up to bar-side bookings.
   *
   * Selection rule on the landing page: the lead slot prefers a
   * featured terrace if one exists for the active filter set;
   * otherwise top-by-score for the current hour. Other slots are
   * always top-by-score.
   */
  featured?: boolean;
  /**
   * Explicit venue-category tag(s). When present, overrides the regex
   * inference in `src/data/categories.ts` — a terrace with
   * `category: ['coffee']` is shown under the ☕ Coffee chip even
   * though its name might match the ambiguous `café` / `koffie` text
   * patterns that would otherwise route it to Bar.
   *
   * Used primarily for specialty / third-wave coffee shops imported
   * via `scripts/import-coffee-shops.ts` — those venues need to be
   * distinguished from bruine kroegen ("Café X" brown bars), and that
   * distinction is impossible from name/vibe text alone.
   *
   * Multiple tags are allowed: a coffee roaster that also serves
   * natural wine could be `['coffee', 'bar']`. Untagged entries fall
   * back to text inference, preserving behaviour for the 800+
   * pre-existing terraces.
   *
   * Typed as `string[]` to avoid a circular import with
   * `src/data/categories.ts`; runtime values must be members of the
   * `VenueCategory` union ('bar' | 'restaurant' | 'coffee'). The
   * categoriser filters out unknown strings defensively.
   */
  category?: string[];
  /**
   * Number of outdoor TV screens visible from the terrace seating area.
   * Absent or 0 = no outdoor TVs. 1 = a single screen. 2+ = a multi-
   * screen sports-bar setup. Indoor-only TVs are intentionally NOT
   * counted — they don't serve Zonnie's "watch in the sun" use case.
   *
   * Drives the World Cup 2026 launch filter (`📺 Match` chip in
   * VenueTypeFilter) and the outdoor-screens badge in the detail sheet.
   * Sourced from beer-brand "WK kijken" listings (Heineken, Amstel,
   * Grolsch) plus manual curation; see `scripts/import-outdoor-tvs.ts`.
   */
  outdoorScreens?: number;
  /**
   * ISO8601 timestamp of last manual confirmation of `outdoorScreens`.
   * Mirrors the existing `verifiedAt` pattern; lets us age-out stale
   * data quietly in a "verified by Zonnie 3 days ago" badge.
   */
  outdoorScreensVerifiedAt?: string;
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
  /** km/h. Optional — synthetic profiles don't supply it. */
  windSpeed?: number;
  /** Degrees from north, clockwise (0 = N, 90 = E, 180 = S, 270 = W). The
   * direction the wind is coming FROM (meteorological convention). */
  windDirection?: number;
}

export interface ScoreResult {
  /** 0–1 normalized sun score. */
  score: number;
  sun: SunPosition;
  /**
   * Fraction of the sun's silhouette blocked by surrounding buildings,
   * 0 = unobstructed, 1 = fully blocked. Replaces the earlier `shadow:
   * boolean`. Used by debug/validation tooling and the detail sheet.
   */
  shadow: number;
  weather: Weather;
}
