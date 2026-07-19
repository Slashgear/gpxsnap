import type { Canvas } from "./canvas.ts";

export interface Point {
  x: number;
  y: number;
}

export interface StrokeStyle {
  color?: string;
  width?: number;
  opacity?: number;
}

const DEFAULT_COLOR = "#E74C3C";
const DEFAULT_WIDTH = 3;
const DEFAULT_OPACITY = 1;

/** Parses a "#rgb" or "#rrggbb" hex color into 8-bit RGB components. */
export function parseColor(color: string): [number, number, number] {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (hex.length === 3) {
    const r = hex[0]!;
    const g = hex[1]!;
    const b = hex[2]!;
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  throw new Error(`unsupported color format: ${color}`);
}

/** Antialiased coverage of a point at distance `dist` from a stroke edge at `radius`, over a ~1px transition band. */
function edgeCoverage(dist: number, radius: number): number {
  const coverage = radius - dist + 0.5;
  return coverage <= 0 ? 0 : coverage >= 1 ? 1 : coverage;
}

/**
 * Draws one antialiased capsule (a line segment with round caps on both ends) from `a` to `b`.
 * Consecutive segments sharing an endpoint naturally form a round join, since each
 * segment's own round cap covers the joint — no separate join geometry is needed.
 */
function strokeSegment(
  canvas: Canvas,
  a: Point,
  b: Point,
  radius: number,
  rgb: [number, number, number],
  opacity: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(a.x, b.x) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(a.y, b.y) + radius + 1));

  const [r, g, bl] = rgb;

  for (let py = minY; py <= maxY; py++) {
    const cy = py + 0.5;
    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5;
      let t = lengthSq === 0 ? 0 : ((cx - a.x) * dx + (cy - a.y) * dy) / lengthSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const dist = Math.hypot(cx - projX, cy - projY);
      const coverage = edgeCoverage(dist, radius);
      if (coverage <= 0) continue;
      canvas.blend(px, py, r!, g!, bl!, coverage * opacity);
    }
  }
}

/** Draws a single antialiased filled circle — a zero-length capsule is exactly that. Used for start/end markers. */
export function drawDot(
  canvas: Canvas,
  center: Point,
  radius: number,
  color: string,
  opacity = 1,
): void {
  strokeSegment(canvas, center, center, radius, parseColor(color), opacity);
}

/** Strokes a full polyline as a sequence of round-capped capsule segments. */
export function strokePolyline(
  canvas: Canvas,
  points: readonly Point[],
  style: StrokeStyle = {},
): void {
  if (points.length === 0) return;

  const width = style.width ?? DEFAULT_WIDTH;
  const opacity = style.opacity ?? DEFAULT_OPACITY;
  const rgb = parseColor(style.color ?? DEFAULT_COLOR);
  const radius = width / 2;

  if (points.length === 1) {
    strokeSegment(canvas, points[0]!, points[0]!, radius, rgb, opacity);
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    strokeSegment(canvas, points[i]!, points[i + 1]!, radius, rgb, opacity);
  }
}
