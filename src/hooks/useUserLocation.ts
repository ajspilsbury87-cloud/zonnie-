/**
 * One-shot user-location hook for the map's cold-start "center on me" UX.
 *
 * Behaviour:
 *   - Asks for foreground permission on first call. If granted, fetches a
 *     single low-accuracy fix and resolves it once. We don't subscribe —
 *     the user's position rarely matters for picking a terrace, and we
 *     don't want background location.
 *   - If permission denied or location unavailable (simulator, no signal),
 *     resolves to `null`. Caller falls back to the Amsterdam centroid.
 *   - Resolution policy `Lowest` — within ~3km is fine for "find sunny
 *     spots near me" and saves battery + GPS lock time.
 *
 * Returns: { coord: {lat, lng} | null, status: 'idle'|'asking'|'ready'|'denied' }
 */

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LocationStatus = 'idle' | 'asking' | 'ready' | 'denied' | 'error';

export interface UserLocation {
  coord: { lat: number; lng: number } | null;
  status: LocationStatus;
}

export function useUserLocation(): UserLocation {
  const [coord, setCoord] = useState<UserLocation['coord']>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('asking');
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm !== 'granted') {
          setStatus('denied');
          return;
        }
        const fix = await Location.getLastKnownPositionAsync({
          maxAge: 15 * 60 * 1000, // accept up to 15-min-old fix
        });
        if (cancelled) return;
        if (fix) {
          setCoord({ lat: fix.coords.latitude, lng: fix.coords.longitude });
          setStatus('ready');
          return;
        }
        // Fall back to a current fix at low accuracy (faster + cheaper).
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
        });
        if (cancelled) return;
        setCoord({ lat: current.coords.latitude, lng: current.coords.longitude });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coord, status };
}
