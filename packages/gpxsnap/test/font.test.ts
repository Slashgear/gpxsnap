import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { drawText, measureText } from "../src/font.ts";

function isBlank(canvas: Canvas): boolean {
  return Array.from(canvas.pixels).every((v) => v === 0);
}

test("measureText scales width and height with the glyph advance", () => {
  expect(measureText("")).toEqual({ width: 0, height: 7 });
  expect(measureText("A")).toEqual({ width: 5, height: 7 });
  expect(measureText("AB")).toEqual({ width: 11, height: 7 }); // two 5px glyphs + 1px gap
  expect(measureText("AB", 2)).toEqual({ width: 22, height: 14 });
});

test("drawText renders visible pixels for a supported string", () => {
  const canvas = new Canvas(40, 10);
  drawText(canvas, "Hi", 2, 1, { color: "#ffffff" });
  expect(isBlank(canvas)).toBe(false);
});

test("drawText renders nothing for an all-space string", () => {
  const canvas = new Canvas(40, 10);
  drawText(canvas, "   ", 2, 1, { color: "#ffffff" });
  expect(isBlank(canvas)).toBe(true);
});

test("drawText throws a clear error on an unsupported character", () => {
  const canvas = new Canvas(40, 10);
  expect(() => drawText(canvas, "Hello 42!", 0, 0)).toThrow(/unsupported character/);
});

test("drawText covers the full supported alphabet without throwing", () => {
  const canvas = new Canvas(2000, 20);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,.©";
  expect(() => drawText(canvas, alphabet, 0, 0)).not.toThrow();
});
