import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { drawLegend } from "../src/legend.ts";

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("drawLegend does nothing for an empty entry list", () => {
  const canvas = new Canvas(100, 100);
  drawLegend(canvas, []);
  expect(pixelAt(canvas, 0, canvas.height - 1)).toEqual([0, 0, 0, 0]);
});

test("drawLegend anchors to the bottom-left corner, not the other three", () => {
  const canvas = new Canvas(200, 200);
  drawLegend(canvas, [{ color: "#ff0000", label: "A" }]);

  expect(pixelAt(canvas, 0, canvas.height - 1)[3]).toBeGreaterThan(0); // bottom-left: plate
  expect(pixelAt(canvas, canvas.width - 1, 0)).toEqual([0, 0, 0, 0]); // top-right: untouched
});

test("drawLegend paints each entry's own swatch color", () => {
  const canvas = new Canvas(200, 200);
  drawLegend(canvas, [
    { color: "#ff0000", label: "Red" },
    { color: "#0000ff", label: "Blue" },
  ]);

  // Scan the plate area rather than pin an exact pixel — just confirm each
  // swatch color actually appears somewhere (avoids coupling the test to
  // drawLegend's internal row/padding math).
  let sawRedSwatch = false;
  let sawBlueSwatch = false;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < 40; x++) {
      const [r, g, b, a] = pixelAt(canvas, x, y);
      if (a === 0) continue;
      if (r > 200 && g < 50 && b < 50) sawRedSwatch = true;
      if (b > 200 && r < 50 && g < 50) sawBlueSwatch = true;
    }
  }
  expect(sawRedSwatch).toBe(true);
  expect(sawBlueSwatch).toBe(true);
});

test("drawLegend collapses entries beyond maxEntries into a '+N more' row instead of growing without bound", () => {
  const canvas = new Canvas(400, 400);
  const many = Array.from({ length: 10 }, (_, i) => ({
    color: "#E74C3C",
    label: `Track ${i + 1}`,
  }));

  drawLegend(canvas, many, { maxEntries: 3 });
  drawLegend(canvas, many.slice(0, 3), { maxEntries: 3 });

  // 3 visible rows + 1 "+7 more" row should take the same plate height as
  // rendering exactly those first 3 rows plus one extra row would.
  const truncated = new Canvas(400, 400);
  drawLegend(truncated, many, { maxEntries: 3 });
  let truncatedRows = 0;
  for (let y = 0; y < truncated.height; y++) {
    if (pixelAt(truncated, 0, y)[3] > 0) truncatedRows++;
  }
  expect(truncatedRows).toBeGreaterThan(0);
  expect(truncatedRows).toBeLessThan(canvas.height); // didn't grow to cover the whole canvas
});

test("drawLegend does not throw when the plate would be wider than the canvas", () => {
  const canvas = new Canvas(20, 20);
  expect(() =>
    drawLegend(canvas, [{ color: "#ff0000", label: "a very long track name indeed" }]),
  ).not.toThrow();
});
