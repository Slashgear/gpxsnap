import type { Canvas } from "./canvas.ts";
import type { Point } from "./line.ts";
import { parseColor, strokePolyline } from "./line.ts";
import type { GpxPoint } from "./gpx.ts";
import { haversineMeters } from "./statistics.ts";

export interface ElevationProfilePoint {
  distance: number;
  elevation: number;
}

export interface ElevationProfileStyle {
  height?: number;
  lineColor?: string;
  fillColor?: string;
  fillOpacity?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  /** Pixels of empty space kept clear on the right, so the plotted line doesn't run underneath another corner badge (e.g. attribution) drawn on top of it. */
  reservedRightMargin?: number;
}

const DEFAULT_HEIGHT = 50;
const DEFAULT_LINE_COLOR = "#E74C3C";
const DEFAULT_FILL_COLOR = "#E74C3C";
const DEFAULT_FILL_OPACITY = 0.35;
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_OPACITY = 0.65;
const PLOT_MARGIN = 4;

/**
 * Cumulative-distance/elevation pairs for every point that has `<ele>` data,
 * across all tracks — distance summed within each track only (matching
 * `computeStatistics`, no phantom jump added between disconnected tracks).
 * Points without elevation are skipped, not interpolated.
 */
export function buildElevationProfile(
  tracks: readonly { points: readonly GpxPoint[] }[],
): ElevationProfilePoint[] {
  const profile: ElevationProfilePoint[] = [];
  let cumulativeDistance = 0;

  for (const track of tracks) {
    let previous: GpxPoint | undefined;
    for (const point of track.points) {
      if (previous) cumulativeDistance += haversineMeters(previous, point);
      if (point.elevation !== undefined) {
        profile.push({ distance: cumulativeDistance, elevation: point.elevation });
      }
      previous = point;
    }
  }

  return profile;
}

/**
 * Draws a filled elevation-profile line chart into a translucent strip
 * along the bottom of the canvas — the map stays visible underneath, same
 * visual language as the attribution bar. Reuses the capsule-stroke
 * rasterizer for the profile line itself. No-ops on fewer than 2 points.
 */
export function drawElevationProfile(
  canvas: Canvas,
  profile: readonly ElevationProfilePoint[],
  style: ElevationProfileStyle = {},
): void {
  if (profile.length < 2) return;

  const height = Math.min(canvas.height, style.height ?? DEFAULT_HEIGHT);
  const stripY = canvas.height - height;

  const [bgR, bgG, bgB] = parseColor(style.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  const backgroundOpacity = style.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY;
  for (let y = stripY; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      canvas.blend(x, y, bgR, bgG, bgB, backgroundOpacity);
    }
  }

  const minDistance = profile[0]!.distance;
  const maxDistance = profile[profile.length - 1]!.distance;
  const elevations = profile.map((p) => p.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);

  const distanceRange = maxDistance - minDistance || 1;
  const elevationRange = maxElevation - minElevation || 1;

  const plotTop = stripY + PLOT_MARGIN;
  const plotBottom = canvas.height - PLOT_MARGIN;
  const plotHeight = plotBottom - plotTop || 1;

  const plotWidth = Math.max(1, canvas.width - (style.reservedRightMargin ?? 0));
  const points: Point[] = profile.map((p) => ({
    x: ((p.distance - minDistance) / distanceRange) * (plotWidth - 1),
    y: plotBottom - ((p.elevation - minElevation) / elevationRange) * plotHeight,
  }));

  const [fillR, fillG, fillB] = parseColor(style.fillColor ?? DEFAULT_FILL_COLOR);
  const fillOpacity = style.fillOpacity ?? DEFAULT_FILL_OPACITY;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const xStart = Math.round(Math.min(a.x, b.x));
    const xEnd = Math.round(Math.max(a.x, b.x));
    for (let x = xStart; x <= xEnd; x++) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      const y = a.y + t * (b.y - a.y);
      for (let fy = Math.round(y); fy < plotBottom; fy++) {
        canvas.blend(x, fy, fillR, fillG, fillB, fillOpacity);
      }
    }
  }

  strokePolyline(canvas, points, {
    color: style.lineColor ?? DEFAULT_LINE_COLOR,
    width: 2,
    opacity: 1,
  });
}
