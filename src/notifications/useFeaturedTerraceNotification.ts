/**
 * Mounts in app/_layout.tsx. Syncs the "featured terrace of the month"
 * notification once on every app open. No weather dependency — just
 * needs the app to have opened at least once before the 1st.
 */
import { useEffect } from 'react';
import { syncFeaturedTerraceNotification } from './featuredTerraceNotification';

export function useFeaturedTerraceNotification(): void {
  useEffect(() => {
    void syncFeaturedTerraceNotification();
  }, []); // Once on mount
}
