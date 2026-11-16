import type { GpxPoint } from "./gpx.ts";

export interface RouteStatistics {
  distanceMeters: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  /** Lowest raw `<ele>` value across all tracks (unsmoothed). Same availability rule as gain/loss. */
  minElevationMeters?: number;
  /** Highest raw `<ele>` value across all tracks (unsmoothed). Same availability rule as gain/loss. */
  maxElevationMeters?: number;
  /**
   * Mean absolute grade in percent: (gain + loss) / distance * 100. A loop
   * that climbs and descends 500 m over 20 km averages 5%, where a net
   * (end - start) grade would read ~0%. Same availability rule as gain/loss.
   */
  averageGradePercent?: number;
  /**
   * Elapsed time from each track's first to last timestamped point, summed
   * across tracks (gaps between disconnected tracks are not counted).
   * `undefined` without at least two usable `<time>` values in some track.
   */
  durationSeconds?: number;
  /**
   * Time spent moving: the sum of time deltas between consecutive points
   * whose segment speed is at least `MOVING_SPEED_THRESHOLD_MPS` (stops,
   * pauses and GPS drift while standing still are excluded). Defined
   * whenever `durationSeconds` is.
   */
  movingTimeSeconds?: number;
  /** Moving distance / moving time, in m/s. `undefined` when moving time is 0 or unknown. */
  averageSpeedMetersPerSecond?: number;
}

const EARTH_RADIUS_METERS = 6371000;
const ELEVATION_SMOOTHING_WINDOW = 5;
/**
 * Below 0.5 m/s (1.8 km/h, well under walking pace) a segment is treated as
 * stationary: it's what GPS jitter typically looks like while standing still.
 */
export const MOVING_SPEED_THRESHOLD_MPS = 0.5;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters. Exported for the elevation-profile chart, which needs the same cumulative-distance x-axis. */
export function haversineMeters(a: GpxPoint, b: GpxPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Centered moving average — raw GPS elevation is noisy enough that unsmoothed gain/loss is typically wildly inflated. */
function smoothElevations(elevations: readonly number[]): number[] {
  const half = Math.floor(ELEVATION_SMOOTHING_WINDOW / 2);
  return elevations.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(elevations.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += elevations[j]!;
    return sum / (end - start);
  });
}

function elevationGainLossForTrack(points: readonly GpxPoint[]): { gain: number; loss: number } {
  const elevations = points.map((p) => p.elevation).filter((e): e is number => e !== undefined);
  if (elevations.length < 2) return { gain: 0, loss: 0 };

  const smoothed = smoothElevations(elevations);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i]! - smoothed[i - 1]!;
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { gain, loss };
}

interface TrackTiming {
  durationSeconds: number;
  movingSeconds: number;
  movingMeters: number;
}

/**
 * Timing for one track, walking only points with a parseable `<time>`. A
 * point without one is skipped (its neighbours are paired directly, with
 * the distance between them), and a non-increasing timestamp is ignored
 * rather than producing a negative delta. `undefined` with fewer than two
 * timestamped points.
 */
function timingForTrack(points: readonly GpxPoint[]): TrackTiming | undefined {
  let first: number | undefined;
  let prevTime: number | undefined;
  let prevPoint: GpxPoint | undefined;
  let lastTime: number | undefined;
  let movingSeconds = 0;
  let movingMeters = 0;

  for (const point of points) {
    if (point.time === undefined) continue;
    const t = Date.parse(point.time);
    if (!Number.isFinite(t)) continue;
    if (prevTime === undefined || prevPoint === undefined) {
      first = t;
      prevTime = t;
      prevPoint = point;
      lastTime = t;
      continue;
    }
    const deltaSeconds = (t - prevTime) / 1000;
    if (deltaSeconds <= 0) continue;
    const meters = haversineMeters(prevPoint, point);
    if (meters / deltaSeconds >= MOVING_SPEED_THRESHOLD_MPS) {
      movingSeconds += deltaSeconds;
      movingMeters += meters;
    }
    prevTime = t;
    prevPoint = point;
    lastTime = t;
  }

  if (first === undefined || lastTime === undefined || lastTime === first) return undefined;
  return { durationSeconds: (lastTime - first) / 1000, movingSeconds, movingMeters };
}

/**
 * Distance (haversine, summed within each track — never across a gap
 * between disconnected tracks) and, if at least half the points across all
 * tracks carry `<ele>` data, smoothed elevation gain/loss, min/max
 * elevation and mean absolute grade. Elevation fields stay `undefined` when
 * there isn't enough elevation data to make them meaningful. Time fields
 * (duration, moving time, average speed) are filled in when tracks carry
 * `<time>` data.
 */
export function computeStatistics(
  tracks: readonly { points: readonly GpxPoint[] }[],
): RouteStatistics {
  let distanceMeters = 0;
  let totalPoints = 0;
  let pointsWithElevation = 0;

  for (const track of tracks) {
    totalPoints += track.points.length;
    for (const point of track.points) {
      if (point.elevation !== undefined) pointsWithElevation++;
    }
    for (let i = 1; i < track.points.length; i++) {
      distanceMeters += haversineMeters(track.points[i - 1]!, track.points[i]!);
    }
  }

  const stats: RouteStatistics = { distanceMeters };

  if (totalPoints > 0 && pointsWithElevation >= totalPoints / 2) {
    let gain = 0;
    let loss = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const track of tracks) {
      const result = elevationGainLossForTrack(track.points);
      gain += result.gain;
      loss += result.loss;
      for (const point of track.points) {
        if (point.elevation === undefined) continue;
        if (point.elevation < min) min = point.elevation;
        if (point.elevation > max) max = point.elevation;
      }
    }
    stats.elevationGainMeters = gain;
    stats.elevationLossMeters = loss;
    stats.minElevationMeters = min;
    stats.maxElevationMeters = max;
    stats.averageGradePercent = distanceMeters > 0 ? ((gain + loss) / distanceMeters) * 100 : 0;
  }

  let timed = false;
  let durationSeconds = 0;
  let movingSeconds = 0;
  let movingMeters = 0;
  for (const track of tracks) {
    const timing = timingForTrack(track.points);
    if (!timing) continue;
    timed = true;
    durationSeconds += timing.durationSeconds;
    movingSeconds += timing.movingSeconds;
    movingMeters += timing.movingMeters;
  }
  if (timed) {
    stats.durationSeconds = durationSeconds;
    stats.movingTimeSeconds = movingSeconds;
    if (movingSeconds > 0) stats.averageSpeedMetersPerSecond = movingMeters / movingSeconds;
  }

  return stats;
}

/** Which pieces of `RouteStatistics` the stats badge shows, in this order. */
export type StatsField =
  | "distance"
  | "elevation"
  | "elevationRange"
  | "grade"
  | "duration"
  | "movingTime"
  | "speed"
  | "pace";

export const DEFAULT_STATS_FIELDS: readonly StatsField[] = ["distance", "elevation"];

/** "3h07" (or "42min" under an hour). */
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatField(stats: RouteStatistics, field: StatsField): string | undefined {
  switch (field) {
    case "distance": {
      const km = stats.distanceMeters / 1000;
      return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(stats.distanceMeters)} m`;
    }
    case "elevation":
      if (stats.elevationGainMeters === undefined || stats.elevationLossMeters === undefined) {
        return undefined;
      }
      return `+${Math.round(stats.elevationGainMeters)} m  -${Math.round(stats.elevationLossMeters)} m`;
    case "elevationRange":
      if (stats.minElevationMeters === undefined || stats.maxElevationMeters === undefined) {
        return undefined;
      }
      return `min ${Math.round(stats.minElevationMeters)} m  max ${Math.round(stats.maxElevationMeters)} m`;
    case "grade":
      if (stats.averageGradePercent === undefined) return undefined;
      return `avg ${stats.averageGradePercent.toFixed(1)}%`;
    case "duration":
      if (stats.durationSeconds === undefined) return undefined;
      return formatDuration(stats.durationSeconds);
    case "movingTime":
      if (stats.movingTimeSeconds === undefined) return undefined;
      return `moving ${formatDuration(stats.movingTimeSeconds)}`;
    case "speed":
      if (stats.averageSpeedMetersPerSecond === undefined) return undefined;
      return `${(stats.averageSpeedMetersPerSecond * 3.6).toFixed(1)} km/h`;
    case "pace": {
      if (!stats.averageSpeedMetersPerSecond) return undefined;
      const secondsPerKm = Math.round(1000 / stats.averageSpeedMetersPerSecond);
      const minutes = Math.floor(secondsPerKm / 60);
      const seconds = secondsPerKm % 60;
      return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
    }
  }
}

/**
 * Formats stats for the on-image badge. With the default fields this is
 * e.g. "42.3 km  +512 m  -498 m". A field whose data is unavailable (no
 * `<ele>`, no `<time>`) is silently left out.
 */
export function formatStatistics(
  stats: RouteStatistics,
  fields: readonly StatsField[] = DEFAULT_STATS_FIELDS,
): string {
  return fields
    .map((field) => formatField(stats, field))
    .filter((text): text is string => text !== undefined)
    .join("  ");
}
