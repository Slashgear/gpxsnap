import type { Canvas } from "./canvas.ts";
import type { Point } from "./line.ts";
import { strokePolyline } from "./line.ts";
import { drawText, measureText } from "./font.ts";
import { haversineMeters } from "./statistics.ts";

const METERS_PER_MILE = 1609.344;

export interface DistanceMarker {
  position: Point;
  /** Unit vector perpendicular to the route direction at this point — orients the tick and label. */
  normal: Point;
  distanceMeters: number;
}

/**
 * Places a marker every `intervalMeters` of real-world distance walked
 * along `points` (great-circle distance between consecutive points), each
 * positioned by interpolating the matching `projected` canvas points at the
 * same fraction along their segment. `points` and `projected` must be the
 * same length and order — call once per track, not across disconnected
 * tracks, matching how `elevation-chart.ts`'s cumulative distance never
 * jumps a gap between tracks.
 */
export function buildDistanceMarkers(
  points: readonly (readonly [number, number])[],
  projected: readonly Point[],
  intervalMeters: number,
): DistanceMarker[] {
  if (!(intervalMeters > 0) || points.length < 2) return [];

  const markers: DistanceMarker[] = [];
  let cumulative = 0;
  let nextThreshold = intervalMeters;

  for (let i = 0; i < points.length - 1; i++) {
    const [lonA, latA] = points[i]!;
    const [lonB, latB] = points[i + 1]!;
    const segmentMeters = haversineMeters({ lon: lonA, lat: latA }, { lon: lonB, lat: latB });
    if (segmentMeters === 0) continue;

    const a = projected[i]!;
    const b = projected[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };

    while (cumulative + segmentMeters >= nextThreshold) {
      const t = (nextThreshold - cumulative) / segmentMeters;
      markers.push({
        position: { x: a.x + dx * t, y: a.y + dy * t },
        normal,
        distanceMeters: nextThreshold,
      });
      nextThreshold += intervalMeters;
    }
    cumulative += segmentMeters;
  }

  return markers;
}

export interface DistanceMarkersStyle {
  /** Spacing between markers, in `unit`. Default `5`. */
  interval?: number;
  /** Default `"km"`. Only affects the interval's meaning and label text — markers are always computed from real-world (great-circle) distance. */
  unit?: "km" | "mi";
  /** Default `false` — a plain tick with no text. */
  showLabels?: boolean;
  color?: string;
  /** Full tick length in pixels. Default `10`. */
  tickLength?: number;
  tickWidth?: number;
  labelScale?: number;
}

const DEFAULT_COLOR = "#000000";
const DEFAULT_TICK_LENGTH = 10;
const DEFAULT_TICK_WIDTH = 2;
const DEFAULT_LABEL_SCALE = 1;
const LABEL_GAP = 2;

function formatDistance(meters: number, unit: "km" | "mi"): string {
  const value = unit === "mi" ? meters / METERS_PER_MILE : meters / 1000;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${unit}`;
}

/** Draws each marker as a short tick crossing the route, perpendicular to its direction there, with an optional distance label. */
export function drawDistanceMarkers(
  canvas: Canvas,
  markers: readonly DistanceMarker[],
  style: DistanceMarkersStyle = {},
  pixelRatio = 1,
): void {
  if (markers.length === 0) return;

  const unit = style.unit ?? "km";
  const color = style.color ?? DEFAULT_COLOR;
  const tickLength = (style.tickLength ?? DEFAULT_TICK_LENGTH) * pixelRatio;
  const tickWidth = style.tickWidth ?? DEFAULT_TICK_WIDTH;
  const labelScale = (style.labelScale ?? DEFAULT_LABEL_SCALE) * pixelRatio;

  for (const marker of markers) {
    const half = tickLength / 2;
    const start: Point = {
      x: marker.position.x - marker.normal.x * half,
      y: marker.position.y - marker.normal.y * half,
    };
    const end: Point = {
      x: marker.position.x + marker.normal.x * half,
      y: marker.position.y + marker.normal.y * half,
    };
    // strokePolyline scales `width` by pixelRatio itself — pass the raw value.
    strokePolyline(canvas, [start, end], { color, width: tickWidth }, pixelRatio);

    if (style.showLabels) {
      const label = formatDistance(marker.distanceMeters, unit);
      const { width: textWidth, height: textHeight } = measureText(label, labelScale);
      const labelGap = LABEL_GAP * pixelRatio + half;
      const x = Math.round(marker.position.x + marker.normal.x * labelGap - textWidth / 2);
      const y = Math.round(marker.position.y + marker.normal.y * labelGap - textHeight / 2);
      drawText(canvas, label, x, y, { scale: labelScale, color, opacity: 1 });
    }
  }
}

/** `interval` (in `unit`) converted to meters, for `buildDistanceMarkers`. */
export function intervalToMeters(interval: number, unit: "km" | "mi"): number {
  return unit === "mi" ? interval * METERS_PER_MILE : interval * 1000;
}
