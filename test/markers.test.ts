import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { drawStartEndMarkers } from "../src/markers.ts";

function isBlank(canvas: Canvas): boolean {
  return Array.from(canvas.pixels).every((v) => v === 0);
}

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("draws nothing for an empty point list", () => {
  const canvas = new Canvas(40, 40);
  drawStartEndMarkers(canvas, []);
  expect(isBlank(canvas)).toBe(true);
});

test("draws a single marker for a one-point route", () => {
  const canvas = new Canvas(40, 40);
  drawStartEndMarkers(canvas, [{ x: 20, y: 20 }]);
  expect(pixelAt(canvas, 20, 20)[3]).toBe(255);
  expect(isBlank(canvas)).toBe(false);
});

test("draws distinct start and end markers for a multi-point route", () => {
  const canvas = new Canvas(60, 20);
  drawStartEndMarkers(canvas, [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 50, y: 10 },
  ]);

  const start = pixelAt(canvas, 10, 10);
  const end = pixelAt(canvas, 50, 10);
  expect(start[3]).toBe(255);
  expect(end[3]).toBe(255);
  // Default start (green) and end (red) colors must differ.
  expect(start).not.toEqual(end);
});

test("custom marker styles are honored", () => {
  const canvas = new Canvas(40, 40);
  drawStartEndMarkers(canvas, [{ x: 20, y: 20 }], {
    start: { color: "#0000ff", ringWidth: 0, radius: 3 },
  });
  expect(pixelAt(canvas, 20, 20)).toEqual([0, 0, 255, 255]);
});
