export type LonLat = readonly [number, number];

/** Any tuple starting with `[lon, lat, ...]` — the RDP math only ever reads the first two elements. */
type PointLike = readonly [number, number, ...unknown[]];

const METERS_PER_LAT_DEGREE = 111320;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function metersPerLonDegree(latitude: number): number {
  return Math.cos(toRadians(latitude)) * METERS_PER_LAT_DEGREE;
}

/**
 * Projects [lon, lat] to local planar meters, scaling longitude by the
 * cosine of a reference latitude. This is a flat-earth approximation, not a
 * true geodesic — plenty accurate for a route-preview tolerance measured in
 * meters over the scale of a single recorded track.
 */
function toLocalMeters(point: PointLike, referenceLatitude: number): { x: number; y: number } {
  const [lon, lat] = point;
  return { x: lon * metersPerLonDegree(referenceLatitude), y: lat * METERS_PER_LAT_DEGREE };
}

/** Perpendicular distance, in meters, from `point` to the infinite line through `lineStart` and `lineEnd`. */
function perpendicularDistanceMeters(
  point: PointLike,
  lineStart: PointLike,
  lineEnd: PointLike,
): number {
  const referenceLatitude = point[1];
  const p = toLocalMeters(point, referenceLatitude);
  const a = toLocalMeters(lineStart, referenceLatitude);
  const b = toLocalMeters(lineEnd, referenceLatitude);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  const cross = dx * (a.y - p.y) - (a.x - p.x) * dy;
  return Math.abs(cross) / Math.sqrt(lengthSq);
}

function simplifySegment(
  coordinates: readonly PointLike[],
  start: number,
  end: number,
  toleranceMeters: number,
  keep: Uint8Array,
): void {
  if (end <= start + 1) return;

  let maxDistance = 0;
  let maxIndex = start;
  for (let i = start + 1; i < end; i++) {
    const distance = perpendicularDistanceMeters(
      coordinates[i]!,
      coordinates[start]!,
      coordinates[end]!,
    );
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > toleranceMeters) {
    keep[maxIndex] = 1;
    simplifySegment(coordinates, start, maxIndex, toleranceMeters, keep);
    simplifySegment(coordinates, maxIndex, end, toleranceMeters, keep);
  }
}

/**
 * Ramer-Douglas-Peucker line simplification: drops points that deviate less
 * than `toleranceMeters` from the line connecting their neighbors, while
 * always keeping the first/last point and any point that meaningfully
 * changes the route's shape. `toleranceMeters <= 0` or fewer than 3 points
 * returns the input unchanged (there's nothing to simplify).
 *
 * Generic over any tuple starting with `[lon, lat, ...]` — e.g. a
 * `[lon, lat, elevation]` triple — so callers that carry extra per-point
 * data through simplification (elevation, for the stats/profile features)
 * get it back on the points that survive, without a second, parallel
 * implementation.
 */
export function simplifyCoordinates<T extends readonly [number, number, ...unknown[]]>(
  coordinates: readonly T[],
  toleranceMeters: number,
): T[] {
  if (toleranceMeters <= 0 || coordinates.length < 3) return coordinates.slice() as T[];

  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;
  simplifySegment(coordinates, 0, coordinates.length - 1, toleranceMeters, keep);

  const result: T[] = [];
  for (let i = 0; i < coordinates.length; i++) {
    if (keep[i]) result.push(coordinates[i]!);
  }
  return result;
}
