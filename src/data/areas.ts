/**
 * Amsterdam neighbourhood density centroids.
 * Ported verbatim from `terras-tracker/public/index.html` (the `BA` array, lines 1159–1171).
 *
 * Used by the shadow engine to procedurally generate buildings around each
 * area centroid. Replaced by real 3D BAG building data in a future PR.
 */

export interface AreaCentroid {
  lat: number;
  lng: number;
  /** 0–1 building density. Drives how many faux buildings are generated per area. */
  density: number;
  /** Average building height in metres. */
  avgHeight: number;
}

export const AREA_CENTROIDS: AreaCentroid[] = [
  { lat: 52.371, lng: 4.895, density: 0.85, avgHeight: 18 },
  { lat: 52.3755, lng: 4.883, density: 0.75, avgHeight: 14 },
  { lat: 52.354, lng: 4.892, density: 0.7, avgHeight: 15 },
  { lat: 52.361, lng: 4.92, density: 0.55, avgHeight: 13 },
  { lat: 52.37, lng: 4.865, density: 0.55, avgHeight: 14 },
  { lat: 52.387, lng: 4.902, density: 0.25, avgHeight: 7 },
  { lat: 52.348, lng: 4.878, density: 0.5, avgHeight: 16 },
  { lat: 52.363, lng: 4.87, density: 0.6, avgHeight: 15 },
  { lat: 52.366, lng: 4.912, density: 0.5, avgHeight: 14 },
  { lat: 52.386, lng: 4.872, density: 0.35, avgHeight: 10 },
  { lat: 52.391, lng: 4.876, density: 0.3, avgHeight: 22 },
  { lat: 52.356, lng: 4.955, density: 0.3, avgHeight: 12 },
  { lat: 52.352, lng: 4.906, density: 0.45, avgHeight: 14 },
  { lat: 52.358, lng: 4.868, density: 0.15, avgHeight: 8 },
  { lat: 52.392, lng: 4.893, density: 0.15, avgHeight: 6 },
  { lat: 52.338, lng: 4.873, density: 0.45, avgHeight: 35 },
  { lat: 52.345, lng: 4.905, density: 0.55, avgHeight: 16 },
  { lat: 52.39, lng: 4.865, density: 0.5, avgHeight: 14 },
  { lat: 52.351, lng: 4.87, density: 0.55, avgHeight: 18 },
  { lat: 52.378, lng: 4.853, density: 0.5, avgHeight: 14 },
  { lat: 52.367, lng: 4.853, density: 0.55, avgHeight: 14 },
  { lat: 52.343, lng: 4.868, density: 0.5, avgHeight: 16 },
];
