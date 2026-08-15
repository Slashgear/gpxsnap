import { haversineMeters } from "./statistics.ts";

/** Forward/backward-fills gaps from the nearest defined neighbor — assumes at least one defined value exists. */
function fillGaps(values: readonly (number | undefined)[]): number[] {
  const result = [...values];
  for (let i = 1; i < result.length; i++) if (result[i] === undefined) result[i] = result[i - 1];
  for (let i = result.length - 2; i >= 0; i--)
    if (result[i] === undefined) result[i] = result[i + 1];
  return result as number[];
}

/** Normalizes a filled series to [0, 1] by its own min/max (a flat series maps entirely to 0). */
function normalize(filled: readonly number[]): number[] {
  const min = Math.min(...filled);
  const max = Math.max(...filled);
  const range = max - min || 1;
  return filled.map((v) => (v - min) / range);
}

/**
 * Per-point elevation normalized to [0, 1] by this track's own min/max, for
 * `line.colorBy: "elevation"`. `undefined` if fewer than 2 points have
 * elevation data — not enough to establish a meaningful range.
 */
export function normalizeElevations(
  elevations: readonly (number | undefined)[],
): number[] | undefined {
  const defined = elevations.filter((e): e is number => e !== undefined);
  if (defined.length < 2) return undefined;
  return normalize(fillGaps(elevations));
}

/**
 * Per-point instantaneous speed (m/s, from real-world distance / elapsed
 * time between consecutive points) normalized to [0, 1] by this track's own
 * min/max, for `line.colorBy: "speed"`. The first point copies the second's
 * speed (nothing precedes it to compute a delta from). `undefined` if fewer
 * than 2 points have a usable consecutive `<time>` delta (missing/
 * unparseable timestamps, or a non-positive delta).
 */
export function normalizeSpeeds(
  points: readonly (readonly [number, number])[],
  times: readonly (string | undefined)[],
): number[] | undefined {
  if (points.length !== times.length || points.length < 2) return undefined;

  const speeds: (number | undefined)[] = [undefined];
  for (let i = 1; i < points.length; i++) {
    const tA = times[i - 1];
    const tB = times[i];
    const deltaSeconds = tA && tB ? (Date.parse(tB) - Date.parse(tA)) / 1000 : NaN;
    if (!(deltaSeconds > 0)) {
      speeds.push(undefined);
      continue;
    }
    const [lonA, latA] = points[i - 1]!;
    const [lonB, latB] = points[i]!;
    const meters = haversineMeters({ lon: lonA, lat: latA }, { lon: lonB, lat: latB });
    speeds.push(meters / deltaSeconds);
  }
  speeds[0] = speeds[1];

  const defined = speeds.filter((s): s is number => s !== undefined);
  if (defined.length < 2) return undefined;
  return normalize(fillGaps(speeds));
}
