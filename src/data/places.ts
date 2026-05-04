/**
 * Runtime fetcher for Google Places details (rating, hours, phone, photo).
 *
 * Called from the detail sheet when a terrace with a `placeId` is opened.
 * Hits Places API (New) — same endpoint family used at build time by
 * `scripts/validate-coords.ts`. Read-only; restricted basic fields only
 * to keep within the cheapest billing SKU.
 *
 * API key sourcing: `process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Expo's
 * `EXPO_PUBLIC_*` prefix means the value is baked into the JS bundle at
 * build time. The key MUST be restricted server-side (GCP Console →
 * Credentials → API restrictions: Places API (New) only; iOS app
 * restriction: bundle ID `com.spilsbury.zonnie`) so leaking the bundle
 * doesn't enable misuse.
 *
 * Graceful degradation: when the key is missing or the fetch fails, the
 * fetcher resolves to null and the UI falls back to non-Places info.
 */

const PLACES_DETAIL_URL = 'https://places.googleapis.com/v1/places';

// Basic SKU fields ($0.005/req). Add Atmosphere fields (rating, reviews)
// for Pro SKU at $0.017/req. Keeping it on Basic for now.
const FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'priceLevel',
  'currentOpeningHours',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
].join(',');

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  /** 0–5 stars, fractional. Undefined when no rating. */
  rating?: number;
  /** Total user ratings count. */
  ratingCount?: number;
  /** "PRICE_LEVEL_INEXPENSIVE" | "..._MODERATE" | "..._EXPENSIVE" | "..._VERY_EXPENSIVE" | "..._FREE" */
  priceLevel?: string;
  /** Today's opening hours line (e.g. "Monday: 10:00 - 23:00") if available. */
  todayHours?: string;
  /** "Open" / "Closed" if currentOpeningHours.openNow is set. */
  openNow?: boolean;
  phone?: string;
  websiteUrl?: string;
  /** Canonical https://maps.google.com/?cid=... URL Google provides. */
  googleMapsUrl?: string;
}

interface PlacesResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

const apiKey = (): string | null => {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return key && key.length > 0 ? key : null;
};

/**
 * Fetch place details. Resolves to `null` on missing key, network error,
 * or HTTP error — the caller is expected to render fallback UI.
 */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const key = apiKey();
  if (!key) return null;

  const url = `${PLACES_DETAIL_URL}/${encodeURIComponent(placeId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let data: PlacesResponse;
  try {
    data = (await res.json()) as PlacesResponse;
  } catch {
    return null;
  }

  if (!data.id) return null;

  // currentOpeningHours.weekdayDescriptions is a 7-element array starting
  // with Monday. Pick today's by JS Date weekday (0=Sun, 1=Mon, ..., 6=Sat).
  let todayHours: string | undefined;
  if (data.currentOpeningHours?.weekdayDescriptions?.length === 7) {
    const jsDay = new Date().getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1; // map Sun→6, Mon→0, etc.
    todayHours = data.currentOpeningHours.weekdayDescriptions[idx];
  }

  return {
    placeId: data.id,
    name: data.displayName?.text ?? '',
    address: data.formattedAddress ?? '',
    rating: data.rating,
    ratingCount: data.userRatingCount,
    priceLevel: data.priceLevel,
    todayHours,
    openNow: data.currentOpeningHours?.openNow,
    phone: data.internationalPhoneNumber,
    websiteUrl: data.websiteUri,
    googleMapsUrl: data.googleMapsUri,
  };
}

/** Convert a `priceLevel` enum to a "$$$" display. */
export function priceLevelToDollars(priceLevel: string | undefined): string {
  switch (priceLevel) {
    case 'PRICE_LEVEL_FREE':
      return 'Free';
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '€';
    case 'PRICE_LEVEL_MODERATE':
      return '€€';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '€€€';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '€€€€';
    default:
      return '';
  }
}

/**
 * Build a Google Maps deep-link URL for navigation TO this terrace.
 *
 * Prefers placeId (richer destination card) when available; falls back to
 * raw lat/lng. Opens the Google Maps app on iOS/Android, or maps.google.com
 * in the browser as fallback.
 */
export function buildGoogleMapsNavigationUrl(opts: {
  lat: number;
  lng: number;
  placeId?: string;
  name?: string;
}): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${opts.lat},${opts.lng}`,
  });
  if (opts.placeId) params.set('destination_place_id', opts.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Build a Google Maps URL that VIEWS the place (no navigation), useful
 * when the user just wants to read reviews / see photos.
 */
export function buildGoogleMapsViewUrl(opts: {
  lat: number;
  lng: number;
  placeId?: string;
  name?: string;
}): string {
  const params = new URLSearchParams({ api: '1' });
  if (opts.placeId) {
    params.set('query', opts.name ?? `${opts.lat},${opts.lng}`);
    params.set('query_place_id', opts.placeId);
  } else {
    params.set('query', `${opts.lat},${opts.lng}`);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
