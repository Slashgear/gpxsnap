import type { Canvas } from "./canvas.ts";
import { drawMarkerShape, type MarkerShape, type Point } from "./line.ts";

export type { MarkerShape } from "./line.ts";

export interface MarkerStyle {
  radius?: number;
  color?: string;
  ringColor?: string;
  ringWidth?: number;
  opacity?: number;
  /** Defaults to `"circle"` — the ring (if any) is drawn in the same shape, slightly larger. */
  shape?: MarkerShape;
}

export interface MarkersStyle {
  start?: MarkerStyle;
  end?: MarkerStyle;
}

const DEFAULT_RADIUS = 6;
const DEFAULT_RING_COLOR = "#ffffff";
const DEFAULT_RING_WIDTH = 2;
const DEFAULT_START_COLOR = "#2ECC71";
const DEFAULT_END_COLOR = "#E74C3C";

function drawMarker(
  canvas: Canvas,
  point: Point,
  style: MarkerStyle,
  defaultColor: string,
  pixelRatio: number,
): void {
  const radius = (style.radius ?? DEFAULT_RADIUS) * pixelRatio;
  const ringWidth = (style.ringWidth ?? DEFAULT_RING_WIDTH) * pixelRatio;
  const opacity = style.opacity ?? 1;
  const shape = style.shape ?? "circle";

  if (ringWidth > 0) {
    drawMarkerShape(
      canvas,
      point,
      radius + ringWidth,
      shape,
      style.ringColor ?? DEFAULT_RING_COLOR,
      opacity,
    );
  }
  drawMarkerShape(canvas, point, radius, shape, style.color ?? defaultColor, opacity);
}

/**
 * Draws a start marker at the first point and an end marker at the last.
 * For a single-point route there's only one marker — drawing both stacked on
 * the same spot would just show the end style painted over the start style.
 * `pixelRatio` scales marker/ring size only — `points` are expected to
 * already be in physical (scaled) canvas coordinates.
 */
export function drawStartEndMarkers(
  canvas: Canvas,
  points: readonly Point[],
  style: MarkersStyle = {},
  pixelRatio = 1,
): void {
  if (points.length === 0) return;
  drawMarker(canvas, points[0]!, style.start ?? {}, DEFAULT_START_COLOR, pixelRatio);
  if (points.length > 1) {
    drawMarker(canvas, points[points.length - 1]!, style.end ?? {}, DEFAULT_END_COLOR, pixelRatio);
  }
}
