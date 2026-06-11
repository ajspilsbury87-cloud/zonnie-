/**
 * Read-only Places-API wrapper for the audit.
 *
 * Copied verbatim from `scripts/validate-coords.ts:124–199` (placesLookup +
 * distanceMeters + AMSTERDAM_BOUNDS + FIELD_MASK + PLACES_URL constants),
 * with the `--apply`, file-write, and `coord_corrections.jsonl` paths
 * intentionally NOT included. Per Decisions Log §6 the audit must reuse
 * Places plumbing without inheriting any data-mutating behaviour.
 *
 * If `validate-coords.ts` changes its Places call shape in future, this
 * file does NOT auto-sync — it's a deliberate snapshot to keep the audit
 * deterministic. Re-copy if/when the canonical version drifts in a way
 * the audit cares about.
 */

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

// Field mask is REQUIRED by the new API and determines the billing tier.
// id + displayName + location + formattedAddress = Basic SKU (cheapest).
const FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress';

// Widened per audit finding A2-1 (2026-06): the previous tight box
// (52.32-52.42 N, 4.75-5.0 E) excluded ~17 legitimate terraces on the
// Zuidoost / IJburg / Noord edges. The audit-spec box below covers the
// whole municipality while still rejecting far-away geocoder mistakes.
export const AMSTERDAM_BOUNDS = {
  minLat: 52.27,
  maxLat: 52.45,
  minLng: 4.72,
  maxLng: 5.07,
};

export interface PlacesResult {
  lat: number;
  lng: number;
  matchName: string;
  placeId: string;
}

export interface PlacesError {
  status: string;
  errorMessage?: string;
}

export type LookupOutcome =
  | { kind: 'hit'; result: PlacesResult }
  | { kind: 'zero_results' }
  | { kind: 'out_of_bounds'; lat: number; lng: number }
  | { kind: 'api_error'; error: PlacesError };

export const FATAL_STATUSES = new Set([
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'RESOURCE_EXHAUSTED',
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
]);

export async function placesLookupReadOnly(
  query: string,
  apiKey: string,
): Promise<LookupOutcome> {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: 52.3676, longitude: 4.9041 },
        radius: 15000.0,
      },
    },
    maxResultCount: 1,
    languageCode: 'en',
  };

  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string };
    };
    const status = errBody.error?.status ?? `HTTP_${res.status}`;
    const errorMessage = errBody.error?.message ?? res.statusText;
    return { kind: 'api_error', error: { status, errorMessage } };
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string; languageCode?: string };
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
    }>;
  };

  if (!data.places || data.places.length === 0) {
    return { kind: 'zero_results' };
  }

  const top = data.places[0]!;
  if (!top.location || !top.displayName) {
    return { kind: 'zero_results' };
  }

  const lat = top.location.latitude;
  const lng = top.location.longitude;

  if (
    lat < AMSTERDAM_BOUNDS.minLat ||
    lat > AMSTERDAM_BOUNDS.maxLat ||
    lng < AMSTERDAM_BOUNDS.minLng ||
    lng > AMSTERDAM_BOUNDS.maxLng
  ) {
    return { kind: 'out_of_bounds', lat, lng };
  }

  return {
    kind: 'hit',
    result: { lat, lng, matchName: top.displayName.text, placeId: top.id },
  };
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320 * Math.cos((52.37 * Math.PI) / 180);
  const dx = (lng2 - lng1) * M_PER_DEG_LNG;
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}
