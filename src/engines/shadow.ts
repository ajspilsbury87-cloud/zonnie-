/**
 * Shadow engine — direct port of `terras-tracker/src/engines/shadow.js`.
 *
 * Ray-casting from the sun's azimuth across nearby buildings.
 * Building data is currently estimated (per-area density + height).
 * Real 3D BAG data is the planned upgrade — see `docs/DATA_SOURCES.md`
 * in the prototype repo.
 */

import type { Building } from './types';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const AMSTERDAM_LAT = 52.3676;

const METRES_PER_DEG_LNG = 111320 * Math.cos(AMSTERDAM_LAT * DEG);
const METRES_PER_DEG_LAT = 110540;

export function shadowLength(buildingHeight: number, sunAltitude: number): number {
  if (sunAltitude <= 0) return Infinity;
  return buildingHeight / Math.tan(sunAltitude * DEG);
}

export function shadowDirection(sunAzimuth: number): number {
  return (sunAzimuth + 180) % 360;
}

export function isInShadow(
  terrace: { lat: number; lng: number },
  buildings: Building[],
  sunAltitude: number,
  sunAzimuth: number,
): boolean {
  if (sunAltitude <= 2) return true;

  for (const building of buildings) {
    const dx = (building.lng - terrace.lng) * METRES_PER_DEG_LNG;
    const dy = (building.lat - terrace.lat) * METRES_PER_DEG_LAT;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 200 || distance < 5) continue;

    const maxShadow = shadowLength(building.height, sunAltitude);
    if (distance > maxShadow * 1.2) continue;

    // Bearing from terrace to building, compass degrees (0=N, 90=E, 180=S, 270=W).
    const angleToBuilding = (Math.atan2(dx, dy) * RAD + 360) % 360;

    // Bug fix vs prototype: a terrace is in a building's shadow only if the
    // building sits between the terrace and the sun. So bearing(terrace→building)
    // must match the SUN azimuth, not the shadow direction (sun + 180°). The
    // prototype compared against shadowDirection, which inverted the geometry —
    // it happened to "work" because procedurally-generated buildings ring each
    // terrace, so something was always in the wrong direction. See PR 2.
    const angleDiff = Math.abs(angleToBuilding - sunAzimuth);
    const normalizedDiff = Math.min(angleDiff, 360 - angleDiff);

    const buildingWidth = building.width ?? 15;
    const angularWidth = Math.atan2(buildingWidth / 2, distance) * RAD;

    // 8° tolerance accounts for building depth and penumbra.
    if (normalizedDiff < angularWidth + 8) {
      return true;
    }
  }

  return false;
}

/**
 * Procedurally generate buildings around a neighbourhood centroid.
 * Used until real 3D BAG data is wired in.
 */
export function generateBuildingsForArea(
  area: { lat: number; lng: number; density: number; avgHeight: number; radius?: number },
  rng: () => number,
): Building[] {
  const buildings: Building[] = [];
  const count = Math.floor(20 * area.density) + 6;
  const radius = area.radius ?? 0.006;

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius;
    buildings.push({
      lat: area.lat + Math.sin(angle) * dist,
      lng: area.lng + Math.cos(angle) * dist,
      height: Math.max(5, area.avgHeight + (rng() - 0.5) * 14),
      width: 8 + rng() * 20,
    });
  }

  return buildings;
}
