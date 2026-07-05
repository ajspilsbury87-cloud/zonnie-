/**
 * Spatial pin thinning — pick which map pins render when a viewport holds
 * more terraces than the zoom-level cap allows.
 *
 * The old strategy (`visible.slice(0, cap)`) kept the top-priority pins
 * citywide, which starved whole neighbourhoods: at city zoom a decent
 * terrace in a quiet buurt never rendered, and users read that as "venue
 * missing from the dataset" (it happened with YNK Coffee, #1337).
 *
 * This version spreads the same budget geographically: the viewport is
 * divided into a coarse grid, items keep their incoming order as priority
 * (the caller's ranking — sun score, or gem-order in Hidden-Gems mode),
 * and cells take turns contributing their best remaining pin until the cap
 * is spent. Every occupied corner of the map gets representation; dense
 * hotspots still show more (they win the later rounds).
 *
 * Pure and synchronous — same cost class as the slice it replaces.
 */

const GRID_COLS = 6;
const GRID_ROWS = 8;

interface LatLng {
  lat: number;
  lng: number;
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Thin `visible` down to at most `cap` items, spreading picks across a
 * GRID_COLS x GRID_ROWS grid over `region`. Input order = priority order.
 * Output preserves the input's relative order.
 */
export function thinPins<T extends { terrace: LatLng }>(
  visible: readonly T[],
  cap: number,
  region: Region,
): T[] {
  if (visible.length <= cap) return [...visible];
  if (cap <= 0) return [];

  const minLat = region.latitude - region.latitudeDelta / 2;
  const minLng = region.longitude - region.longitudeDelta / 2;

  // Bucket by grid cell; each bucket keeps input (priority) order.
  const buckets = new Map<number, { item: T; idx: number }[]>();
  visible.forEach((item, idx) => {
    const col = clampCell(
      Math.floor(((item.terrace.lng - minLng) / region.longitudeDelta) * GRID_COLS),
      GRID_COLS,
    );
    const row = clampCell(
      Math.floor(((item.terrace.lat - minLat) / region.latitudeDelta) * GRID_ROWS),
      GRID_ROWS,
    );
    const key = row * GRID_COLS + col;
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ item, idx });
    else buckets.set(key, [{ item, idx }]);
  });

  // Cells take turns, strongest-first-cell first, one pin per round.
  const cells = [...buckets.values()].sort((a, b) => a[0]!.idx - b[0]!.idx);
  const picked: { item: T; idx: number }[] = [];
  let round = 0;
  while (picked.length < cap) {
    let tookAny = false;
    for (const cell of cells) {
      const next = cell[round];
      if (next == null) continue;
      picked.push(next);
      tookAny = true;
      if (picked.length >= cap) break;
    }
    if (!tookAny) break;
    round++;
  }

  return picked.sort((a, b) => a.idx - b.idx).map((p) => p.item);
}

function clampCell(n: number, max: number): number {
  if (n < 0) return 0;
  if (n >= max) return max - 1;
  return n;
}
