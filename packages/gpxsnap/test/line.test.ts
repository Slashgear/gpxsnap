import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { parseColor, strokePolyline } from "../src/line.ts";

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("parseColor handles both 3- and 6-digit hex", () => {
  expect(parseColor("#000000")).toEqual([0, 0, 0]);
  expect(parseColor("#ffffff")).toEqual([255, 255, 255]);
  expect(parseColor("#f00")).toEqual([255, 0, 0]);
  expect(parseColor("#E74C3C")).toEqual([231, 76, 60]);
});

test("parseColor rejects malformed input", () => {
  expect(() => parseColor("#12345")).toThrow();
  expect(() => parseColor("not-a-color")).toThrow();
});

test("a thick horizontal segment is fully opaque along its core and transparent outside its radius", () => {
  const canvas = new Canvas(20, 10);
  strokePolyline(
    canvas,
    [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    ],
    { color: "#000000", width: 4, opacity: 1 },
  );

  expect(pixelAt(canvas, 10, 5)).toEqual([0, 0, 0, 255]); // dead center of the stroke
  expect(pixelAt(canvas, 10, 6)).toEqual([0, 0, 0, 255]); // still within radius 2
  expect(pixelAt(canvas, 10, 7)).toEqual([0, 0, 0, 0]); // just outside the stroke edge
  expect(pixelAt(canvas, 10, 0)).toEqual([0, 0, 0, 0]); // far above, untouched
});

test("stroke edges are antialiased with fractional coverage", () => {
  const canvas = new Canvas(20, 10);
  strokePolyline(
    canvas,
    [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    ],
    { color: "#000000", width: 3, opacity: 1 },
  );

  const [, , , alpha] = pixelAt(canvas, 10, 6);
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThan(255);
});

test("a single point still renders a round dot (degenerate polyline)", () => {
  const canvas = new Canvas(10, 10);
  strokePolyline(canvas, [{ x: 5, y: 5 }], { color: "#000000", width: 4, opacity: 1 });
  expect(pixelAt(canvas, 5, 5)).toEqual([0, 0, 0, 255]);
});

test("an empty polyline draws nothing", () => {
  const canvas = new Canvas(10, 10);
  strokePolyline(canvas, [], { color: "#000000", width: 4 });
  expect(Array.from(canvas.pixels).every((v) => v === 0)).toBe(true);
});

test("opacity scales the stroke's alpha", () => {
  const canvas = new Canvas(10, 10);
  strokePolyline(
    canvas,
    [
      { x: 2, y: 5 },
      { x: 8, y: 5 },
    ],
    { color: "#000000", width: 4, opacity: 0.5 },
  );
  const [, , , alpha] = pixelAt(canvas, 5, 5);
  expect(alpha).toBeGreaterThanOrEqual(127);
  expect(alpha).toBeLessThanOrEqual(128);
});

test("round joins fill the outer corner where two segments meet at an angle", () => {
  const canvas = new Canvas(20, 20);
  // A horizontal segment turning into a vertical one at (10, 5).
  strokePolyline(
    canvas,
    [
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ],
    { color: "#000000", width: 4, opacity: 1 },
  );

  // Just outside both segments' rectangles, but within the round cap at the joint.
  expect(pixelAt(canvas, 11, 3)[3]).toBeGreaterThan(0);
  // Well beyond the joint's radius: a sharp/miter join would leave this covered too, a round join does not.
  expect(pixelAt(canvas, 13, 1)).toEqual([0, 0, 0, 0]);
  // The joint vertex itself is always fully covered.
  expect(pixelAt(canvas, 10, 5)).toEqual([0, 0, 0, 255]);
});
