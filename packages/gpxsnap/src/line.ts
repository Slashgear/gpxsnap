import type { Canvas } from "./canvas.ts";

export interface Point {
  x: number;
  y: number;
}

export interface StrokeStyle {
  color?: string;
  width?: number;
  opacity?: number;
  /**
   * Overrides `color`: the stroke is colored by interpolating these stops
   * along the route's own length (by on-canvas pixel distance walked, not
   * real-world distance) instead of a single flat color. `"rainbow"` is a
   * built-in ROYGBIV preset; otherwise a list of 2+ hex colors.
   */
  gradient?: readonly string[] | "rainbow";
}

const DEFAULT_COLOR = "#E74C3C";
const DEFAULT_WIDTH = 3;
const DEFAULT_OPACITY = 1;
const RAINBOW_GRADIENT = [
  "#FF0000",
  "#FF7F00",
  "#FFFF00",
  "#00FF00",
  "#0000FF",
  "#4B0082",
  "#9400D3",
];

/** Resolves `style.gradient` to parsed RGB stops, or `undefined` if unset or too short to interpolate (falls back to `color`). */
function resolveGradientStops(
  gradient: StrokeStyle["gradient"],
): [number, number, number][] | undefined {
  if (!gradient) return undefined;
  const hexStops = gradient === "rainbow" ? RAINBOW_GRADIENT : gradient;
  if (hexStops.length < 2) return undefined;
  return hexStops.map(parseColor);
}

/** Linearly interpolates across evenly-spaced color stops at position `t` (clamped to [0, 1]). */
function lerpGradient(
  stops: readonly [number, number, number][],
  t: number,
): [number, number, number] {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * localT),
    Math.round(a[1] + (b[1] - a[1]) * localT),
    Math.round(a[2] + (b[2] - a[2]) * localT),
  ];
}

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

export type MarkerShape = "circle" | "square" | "diamond" | "triangle";

/** Antialiased fill from a signed distance (negative inside, 0 at the boundary, positive outside), over a ~1px transition band. */
function fillCoverage(signedDistance: number): number {
  const coverage = 0.5 - signedDistance;
  return coverage <= 0 ? 0 : coverage >= 1 ? 1 : coverage;
}

/** Signed distance from the origin to an axis-aligned square's edge (Chebyshev/L∞ distance minus the half-width). */
function squareSdf(dx: number, dy: number, halfWidth: number): number {
  return Math.max(Math.abs(dx), Math.abs(dy)) - halfWidth;
}

/** Signed distance from the origin to a diamond's edge (Manhattan/L1 distance minus the half-width). */
function diamondSdf(dx: number, dy: number, halfWidth: number): number {
  return Math.abs(dx) + Math.abs(dy) - halfWidth;
}

/**
 * Signed distance to an upward-pointing equilateral triangle inscribed in a
 * circle of the given radius, centered at the origin: the max of the
 * signed distance to each of the 3 edge lines (the exact SDF of a convex
 * polygon is the max over its half-planes; this is only a slight
 * over-estimate right at the corners, invisible at 1px of antialiasing).
 */
function triangleSdf(dx: number, dy: number, radius: number): number {
  const vertices: Point[] = [
    { x: 0, y: -radius },
    { x: -radius * 0.8660254, y: radius * 0.5 },
    { x: radius * 0.8660254, y: radius * 0.5 },
  ];
  let maxDist = -Infinity;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % 3]!;
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const edgeLength = Math.hypot(edgeX, edgeY);
    // Cross product of (edge) and (point - a): positive when the point is to
    // the left of a->b. Vertices above are wound clockwise in this (y-down)
    // canvas space, so "inside" is where every cross product is negative —
    // negate and divide by edge length to get an outside-positive distance.
    const cross = edgeX * (dy - a.y) - edgeY * (dx - a.x);
    const dist = cross / edgeLength;
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist;
}

/**
 * Draws a filled, antialiased marker shape centered at `center` — `"circle"`
 * delegates to {@link drawDot}; the others are signed-distance-field fills
 * sized to roughly the same visual weight as a circle of the same radius.
 */
export function drawMarkerShape(
  canvas: Canvas,
  center: Point,
  radius: number,
  shape: MarkerShape,
  color: string,
  opacity = 1,
): void {
  if (shape === "circle") {
    drawDot(canvas, center, radius, color, opacity);
    return;
  }

  const [r, g, b] = parseColor(color);
  const minX = Math.max(0, Math.floor(center.x - radius - 1));
  const maxX = Math.min(canvas.width - 1, Math.ceil(center.x + radius + 1));
  const minY = Math.max(0, Math.floor(center.y - radius - 1));
  const maxY = Math.min(canvas.height - 1, Math.ceil(center.y + radius + 1));

  for (let py = minY; py <= maxY; py++) {
    const cy = py + 0.5 - center.y;
    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5 - center.x;
      const sdf =
        shape === "square"
          ? squareSdf(cx, cy, radius)
          : shape === "diamond"
            ? diamondSdf(cx, cy, radius)
            : triangleSdf(cx, cy, radius);
      const coverage = fillCoverage(sdf);
      if (coverage <= 0) continue;
      canvas.blend(px, py, r!, g!, b!, coverage * opacity);
    }
  }
}

/**
 * Strokes a full polyline as a sequence of round-capped capsule segments.
 * `pixelRatio` scales the stroke width only — `points` are expected to
 * already be in physical (scaled) canvas coordinates.
 */
export function strokePolyline(
  canvas: Canvas,
  points: readonly Point[],
  style: StrokeStyle = {},
  pixelRatio = 1,
): void {
  if (points.length === 0) return;

  const width = (style.width ?? DEFAULT_WIDTH) * pixelRatio;
  const opacity = style.opacity ?? DEFAULT_OPACITY;
  const radius = width / 2;
  const gradientStops = resolveGradientStops(style.gradient);

  if (points.length === 1) {
    const rgb = gradientStops ? gradientStops[0]! : parseColor(style.color ?? DEFAULT_COLOR);
    strokeSegment(canvas, points[0]!, points[0]!, radius, rgb, opacity);
    return;
  }

  if (!gradientStops) {
    const rgb = parseColor(style.color ?? DEFAULT_COLOR);
    for (let i = 0; i < points.length - 1; i++) {
      strokeSegment(canvas, points[i]!, points[i + 1]!, radius, rgb, opacity);
    }
    return;
  }

  // Cumulative on-canvas pixel distance walked up to each point — the axis
  // each segment's gradient position is interpolated along.
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1]! +
        Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
    );
  }
  const totalLength = cumulative[cumulative.length - 1]! || 1;

  for (let i = 0; i < points.length - 1; i++) {
    const midFraction = (cumulative[i]! + cumulative[i + 1]!) / 2 / totalLength;
    const rgb = lerpGradient(gradientStops, midFraction);
    strokeSegment(canvas, points[i]!, points[i + 1]!, radius, rgb, opacity);
  }
}
