import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("blit copies a fully in-bounds source at the destination offset", () => {
  const canvas = new Canvas(8, 8);
  const src = {
    width: 2,
    height: 2,
    pixels: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]),
  };
  canvas.blit(src, 3, 4);

  expect(pixelAt(canvas, 3, 4)).toEqual([255, 0, 0, 255]);
  expect(pixelAt(canvas, 4, 4)).toEqual([0, 255, 0, 255]);
  expect(pixelAt(canvas, 3, 5)).toEqual([0, 0, 255, 255]);
  expect(pixelAt(canvas, 4, 5)).toEqual([255, 255, 0, 255]);
  expect(pixelAt(canvas, 0, 0)).toEqual([0, 0, 0, 0]);
});

test("blit crops a source that overhangs the canvas edges", () => {
  const canvas = new Canvas(4, 4);
  const src = { width: 4, height: 4, pixels: new Uint8ClampedArray(4 * 4 * 4).fill(200) };
  // Place fully-opaque marker alpha so we can tell what landed.
  for (let i = 3; i < src.pixels.length; i += 4) src.pixels[i] = 255;

  expect(() => canvas.blit(src, -2, -2)).not.toThrow();
  // Only the bottom-right 2x2 of the 4x4 source lands on-canvas at (-2,-2).
  expect(pixelAt(canvas, 0, 0)).toEqual([200, 200, 200, 255]);
  expect(pixelAt(canvas, 1, 1)).toEqual([200, 200, 200, 255]);
  expect(pixelAt(canvas, 2, 2)).toEqual([0, 0, 0, 0]);
  expect(pixelAt(canvas, 3, 3)).toEqual([0, 0, 0, 0]);
});

test("blit is a no-op when the source falls entirely outside the canvas", () => {
  const canvas = new Canvas(4, 4);
  const src = { width: 2, height: 2, pixels: new Uint8ClampedArray(2 * 2 * 4).fill(255) };
  canvas.blit(src, 100, 100);
  expect(Array.from(canvas.pixels).every((v) => v === 0)).toBe(true);
});

test("blend alpha-composites over existing pixels", () => {
  const canvas = new Canvas(2, 2);
  canvas.blend(0, 0, 255, 0, 0, 1); // opaque red
  expect(pixelAt(canvas, 0, 0)).toEqual([255, 0, 0, 255]);

  canvas.blend(0, 0, 0, 0, 255, 0.5); // 50% blue over red
  const [r, g, b, a] = pixelAt(canvas, 0, 0);
  expect(r).toBeGreaterThan(100);
  expect(b).toBeGreaterThan(100);
  expect(g).toBe(0);
  expect(a).toBe(255);
});

test("blend ignores out-of-bounds coordinates", () => {
  const canvas = new Canvas(2, 2);
  expect(() => canvas.blend(-1, -1, 255, 255, 255, 1)).not.toThrow();
  expect(() => canvas.blend(5, 5, 255, 255, 255, 1)).not.toThrow();
});
