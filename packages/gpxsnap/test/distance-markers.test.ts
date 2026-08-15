import { expect, test } from "bun:test";
import {
  buildDistanceMarkers,
  drawDistanceMarkers,
  intervalToMeters,
} from "../src/distance-markers.ts";
import { Canvas } from "../src/canvas.ts";

// Roughly a straight line running east along the equator, where 1 degree of
// longitude is close to 111.32 km — easy to reason about in whole km.
function equatorLine(totalDegrees: number, steps: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    points.push([(totalDegrees * i) / steps, 0]);
  }
  return points;
}

test("buildDistanceMarkers places one marker per interval, none past the route's end", () => {
  const points = equatorLine(1, 100); // ~111 km long
  const projected = points.map((_, i) => ({ x: i * 10, y: 0 }));

  const markers = buildDistanceMarkers(points, projected, 25_000); // every 25 km

  expect(markers.length).toBe(4); // 25, 50, 75, 100 km — 111 km never reaches a 5th
  expect(markers[0]!.distanceMeters).toBe(25_000);
  expect(markers[3]!.distanceMeters).toBe(100_000);
});

test("buildDistanceMarkers returns nothing for a route shorter than one interval", () => {
  const points = equatorLine(0.01, 5); // ~1.1 km
  const projected = points.map((_, i) => ({ x: i, y: 0 }));

  expect(buildDistanceMarkers(points, projected, 5_000)).toEqual([]);
});

test("buildDistanceMarkers handles an interval smaller than a single segment", () => {
  // Two points ~111 km apart, one giant segment — markers must still land
  // every 25 km along it, not just at most one per segment.
  const points: [number, number][] = [
    [0, 0],
    [1, 0],
  ];
  const projected = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ];

  const markers = buildDistanceMarkers(points, projected, 25_000);
  expect(markers.length).toBe(4);

  // Each marker's canvas x should scale linearly with its distance-along-route
  // fraction — same ratio (x / distanceMeters) for every marker on one segment.
  const ratio = markers[0]!.position.x / markers[0]!.distanceMeters;
  for (const marker of markers) {
    expect(marker.position.x).toBeCloseTo(ratio * marker.distanceMeters, 5);
  }
});

test("buildDistanceMarkers rejects a non-positive interval", () => {
  const points = equatorLine(1, 10);
  const projected = points.map((_, i) => ({ x: i, y: 0 }));
  expect(buildDistanceMarkers(points, projected, 0)).toEqual([]);
  expect(buildDistanceMarkers(points, projected, -100)).toEqual([]);
});

test("intervalToMeters converts km and miles", () => {
  expect(intervalToMeters(5, "km")).toBe(5000);
  expect(intervalToMeters(1, "mi")).toBeCloseTo(1609.344, 3);
});

test("drawDistanceMarkers does not throw and draws something for a marker with labels on", () => {
  const canvas = new Canvas(200, 200);
  drawDistanceMarkers(
    canvas,
    [{ position: { x: 100, y: 100 }, normal: { x: 0, y: 1 }, distanceMeters: 5000 }],
    { showLabels: true },
  );

  let paintedSomething = false;
  for (let i = 3; i < canvas.pixels.length; i += 4) {
    if (canvas.pixels[i]! > 0) {
      paintedSomething = true;
      break;
    }
  }
  expect(paintedSomething).toBe(true);
});

test("drawDistanceMarkers is a no-op for an empty marker list", () => {
  const canvas = new Canvas(50, 50);
  drawDistanceMarkers(canvas, []);
  expect(canvas.pixels.every((v) => v === 0)).toBe(true);
});
