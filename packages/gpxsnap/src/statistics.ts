import type { GpxPoint } from "./gpx.ts";

export interface RouteStatistics {
  distanceMeters: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
}

const EARTH_RADIUS_METERS = 6371000;
const ELEVATION_SMOOTHING_WINDOW = 5;

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

/**
 * Distance (haversine, summed within each track — never across a gap
 * between disconnected tracks) and, if at least half the points across all
 * tracks carry `<ele>` data, smoothed elevation gain/loss. Elevation fields
 * stay `undefined` when there isn't enough elevation data to make gain/loss
 * meaningful.
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

  if (totalPoints === 0 || pointsWithElevation < totalPoints / 2) {
    return { distanceMeters };
  }

  let elevationGainMeters = 0;
  let elevationLossMeters = 0;
  for (const track of tracks) {
    const { gain, loss } = elevationGainLossForTrack(track.points);
    elevationGainMeters += gain;
    elevationLossMeters += loss;
  }

  return { distanceMeters, elevationGainMeters, elevationLossMeters };
}

/** Formats stats for the on-image badge, e.g. "42.3 km  +512 m  -498 m" (elevation omitted when unavailable). */
export function formatStatistics(stats: RouteStatistics): string {
  const km = stats.distanceMeters / 1000;
  const distanceText = km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(stats.distanceMeters)} m`;

  if (stats.elevationGainMeters === undefined || stats.elevationLossMeters === undefined) {
    return distanceText;
  }

  return `${distanceText}  +${Math.round(stats.elevationGainMeters)} m  -${Math.round(stats.elevationLossMeters)} m`;
}
