import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { stampAttribution } from "../src/attribution.ts";

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("stampAttribution paints a background bar anchored to the bottom-right corner", () => {
  const canvas = new Canvas(200, 100);
  stampAttribution(canvas);

  // Bottom-right corner should have picked up the translucent background.
  expect(pixelAt(canvas, 199, 99)[3]).toBeGreaterThan(0);
  // Top-left corner, far from the stamp, must remain untouched.
  expect(pixelAt(canvas, 0, 0)).toEqual([0, 0, 0, 0]);
});

test("stampAttribution accepts custom text for non-OSM tile sources", () => {
  const canvas = new Canvas(300, 100);
  expect(() => stampAttribution(canvas, { text: "© Example Tiles" })).not.toThrow();
});

test("stampAttribution does not throw when the stamp is wider than the canvas", () => {
  const canvas = new Canvas(20, 20);
  expect(() => stampAttribution(canvas)).not.toThrow();
});

test("stampAttribution rejects unsupported characters in custom text", () => {
  const canvas = new Canvas(200, 100);
  expect(() => stampAttribution(canvas, { text: "© Tiles #1" })).toThrow(/unsupported character/);
});
