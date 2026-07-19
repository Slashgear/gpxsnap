import type { Canvas } from "./canvas.ts";
import { drawDot, type Point } from "./line.ts";

export interface MarkerStyle {
  radius?: number;
  color?: string;
  ringColor?: string;
  ringWidth?: number;
  opacity?: number;
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

function drawMarker(canvas: Canvas, point: Point, style: MarkerStyle, defaultColor: string): void {
  const radius = style.radius ?? DEFAULT_RADIUS;
  const ringWidth = style.ringWidth ?? DEFAULT_RING_WIDTH;
  const opacity = style.opacity ?? 1;

  if (ringWidth > 0) {
    drawDot(canvas, point, radius + ringWidth, style.ringColor ?? DEFAULT_RING_COLOR, opacity);
  }
  drawDot(canvas, point, radius, style.color ?? defaultColor, opacity);
}

/**
 * Draws a start marker at the first point and an end marker at the last.
 * For a single-point route there's only one marker — drawing both stacked on
 * the same spot would just show the end style painted over the start style.
 */
export function drawStartEndMarkers(
  canvas: Canvas,
  points: readonly Point[],
  style: MarkersStyle = {},
): void {
  if (points.length === 0) return;
  drawMarker(canvas, points[0]!, style.start ?? {}, DEFAULT_START_COLOR);
  if (points.length > 1) {
    drawMarker(canvas, points[points.length - 1]!, style.end ?? {}, DEFAULT_END_COLOR);
  }
}
