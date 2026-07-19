import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { drawBadge } from "../src/badge.ts";

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

for (const corner of CORNERS) {
  test(`drawBadge anchors to the ${corner} corner`, () => {
    const canvas = new Canvas(100, 60);
    drawBadge(canvas, "Hi", corner);

    const nearCorner =
      corner === "top-left"
        ? [0, 0]
        : corner === "top-right"
          ? [canvas.width - 1, 0]
          : corner === "bottom-left"
            ? [0, canvas.height - 1]
            : [canvas.width - 1, canvas.height - 1];
    const farCorner =
      corner === "top-left"
        ? [canvas.width - 1, canvas.height - 1]
        : corner === "top-right"
          ? [0, canvas.height - 1]
          : corner === "bottom-left"
            ? [canvas.width - 1, 0]
            : [0, 0];

    expect(pixelAt(canvas, nearCorner[0]!, nearCorner[1]!)[3]).toBeGreaterThan(0);
    expect(pixelAt(canvas, farCorner[0]!, farCorner[1]!)).toEqual([0, 0, 0, 0]);
  });
}

test("drawBadge does not throw when the badge is wider than the canvas", () => {
  const canvas = new Canvas(20, 20);
  expect(() => drawBadge(canvas, "a very long badge string", "top-left")).not.toThrow();
});

test("drawBadge respects custom text and background colors", () => {
  const canvas = new Canvas(60, 30);
  drawBadge(canvas, "X", "top-left", {
    textColor: "#00ff00",
    backgroundColor: "#0000ff",
    backgroundOpacity: 1,
  });
  // (0,0) sits within the default padding, before any glyph ink — pure background.
  expect(pixelAt(canvas, 0, 0)).toEqual([0, 0, 255, 255]);
});
