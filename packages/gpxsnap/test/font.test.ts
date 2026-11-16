import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { drawText, hasGlyph, measureText } from "../src/font.ts";

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

test("drawText never throws, drawing a visible box for a character with no glyph", () => {
  const canvas = new Canvas(10, 10);
  expect(() => drawText(canvas, "\u4e2d", 0, 0, { color: "#ffffff" })).not.toThrow();
  expect(isBlank(canvas)).toBe(false);
  expect(measureText("\u4e2d")).toEqual(measureText("A"));
});

test("drawText covers French accented letters, lower and upper case", () => {
  for (const ch of "àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆñ") expect(hasGlyph(ch)).toBe(true);
  const canvas = new Canvas(400, 10);
  drawText(canvas, "Sortie l'après-midi à Égletons", 0, 0, { color: "#ffffff" });
  expect(isBlank(canvas)).toBe(false);
});

test("accented glyphs differ from their base letter", () => {
  const render = (s: string) => {
    const canvas = new Canvas(6, 7);
    drawText(canvas, s, 0, 0, { color: "#ffffff" });
    return Array.from(canvas.pixels).join(",");
  };
  expect(render("è")).not.toBe(render("e"));
  expect(render("è")).not.toBe(render("é"));
  expect(render("É")).not.toBe(render("E"));
});

test("decomposed (NFD) input renders exactly like its precomposed form", () => {
  const render = (s: string) => {
    const canvas = new Canvas(40, 7);
    drawText(canvas, s, 0, 0, { color: "#ffffff" });
    return Array.from(canvas.pixels).join(",");
  };
  expect(render("e\u0300te\u0301")).toBe(render("èté"));
  expect(measureText("e\u0300")).toEqual(measureText("è"));
});

test("letters without a glyph fall back to their unaccented form", () => {
  const render = (s: string) => {
    const canvas = new Canvas(6, 7);
    drawText(canvas, s, 0, 0, { color: "#ffffff" });
    return Array.from(canvas.pixels).join(",");
  };
  expect(render("ł")).not.toBe(render("\u4e2d")); // not the box
  expect(render("Ő")).toBe(render("O"));
  expect(render("\u2019")).toBe(render("'"));
  expect(render("\u2013")).toBe(render("-"));
});

test("drawText covers the full supported alphabet without throwing", () => {
  const canvas = new Canvas(2000, 20);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,.©0123456789+-'()!?:@#&_=*;<>[]°\"";
  expect(() => drawText(canvas, alphabet, 0, 0)).not.toThrow();
});

test("drawText renders every digit without throwing and produces visible pixels", () => {
  const canvas = new Canvas(200, 20);
  drawText(canvas, "0123456789", 2, 2, { color: "#ffffff" });
  expect(isBlank(canvas)).toBe(false);
});

test("drawText renders route-title-style punctuation without throwing", () => {
  const canvas = new Canvas(200, 20);
  expect(() => drawText(canvas, "Antoine's ride (loop)!", 2, 2)).not.toThrow();
});

test("drawText renders a pipe, as tile-provider attributions often use one", () => {
  const canvas = new Canvas(400, 20);
  drawText(canvas, "© OpenStreetMap | © OpenTopoMap", 2, 2, { color: "#ffffff" });
  expect(isBlank(canvas)).toBe(false);
});
