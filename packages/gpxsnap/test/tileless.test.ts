import { expect, test } from "bun:test";
import { renderRoute } from "../src/index.ts";
import { renderGpx } from "../src/gpx.ts";
import { decodePng } from "../src/png/decode.ts";

const COORDINATES: [number, number][] = [
  [2.3491, 48.853],
  [2.3376, 48.8592],
  [2.2986, 48.8867],
];

function failingFetch(): Promise<Response> {
  throw new Error("no tile request expected with tileUrl: false");
}

function pixelAt(
  image: { width: number; pixels: Uint8Array | Uint8ClampedArray },
  x: number,
  y: number,
) {
  const i = (y * image.width + x) * 4;
  return Array.from(image.pixels.subarray(i, i + 4));
}

test("tileUrl: false renders without any tile request, on a transparent background", async () => {
  const png = await renderRoute({
    coordinates: COORDINATES,
    width: 200,
    height: 150,
    tileUrl: false,
    fetchImpl: failingFetch,
  });
  const image = await decodePng(png);

  expect(image.width).toBe(200);
  expect(image.height).toBe(150);
  // Corners hold no route and no attribution (off by default without tiles).
  expect(pixelAt(image, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(pixelAt(image, 199, 149)).toEqual([0, 0, 0, 0]);
  // The route itself is still drawn.
  expect(Array.from(image.pixels).some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
});

test("background fills the canvas with a solid color", async () => {
  const png = await renderRoute({
    coordinates: COORDINATES,
    width: 120,
    height: 90,
    tileUrl: false,
    background: "#102030",
  });
  const image = await decodePng(png);
  expect(pixelAt(image, 0, 0)).toEqual([0x10, 0x20, 0x30, 255]);
  expect(pixelAt(image, 119, 89)).toEqual([0x10, 0x20, 0x30, 255]);
});

test("an explicit attribution is still stamped without tiles", async () => {
  const base = { coordinates: COORDINATES, width: 300, height: 200, tileUrl: false } as const;
  const without = await renderRoute(base);
  const withText = await renderRoute({ ...base, attribution: "My data" });
  expect(Array.from(withText)).not.toEqual(Array.from(without));
});

test("tileUrl: false ignores maxTiles, since nothing is fetched", async () => {
  const png = await renderRoute({
    coordinates: COORDINATES,
    width: 2000,
    height: 2000,
    tileUrl: false,
    maxTiles: 1,
  });
  expect((await decodePng(png)).width).toBe(2000);
});

test("an invalid background color throws before rendering", async () => {
  await expect(
    renderRoute({
      coordinates: COORDINATES,
      width: 100,
      height: 100,
      tileUrl: false,
      background: "#zzzzzz",
    }),
  ).rejects.toThrow(/unsupported color format/);
});

test("renderGpx supports tileless rendering with stats and a single-point track", async () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="48.85" lon="2.35"><ele>40</ele></trkpt></trkseg></trk></gpx>`;
  const png = await renderGpx(gpx, {
    width: 200,
    height: 120,
    tileUrl: false,
    background: "#ffffff",
    stats: true,
    fetchImpl: failingFetch,
  });
  const image = await decodePng(png);
  expect(pixelAt(image, 199, 119)).toEqual([255, 255, 255, 255]);
});

test('renderGpx renders a Strava GPX whose name has accents (e.g. "après-midi")', async () => {
  const gpx = await Bun.file("test/fixtures/sortie-apres-midi.gpx").text();
  const png = await renderGpx(gpx, {
    width: 300,
    height: 200,
    tileUrl: false,
    background: "#ffffff",
    fetchImpl: failingFetch,
  });
  const image = await decodePng(png);
  expect(image.width).toBe(300);
  // The title badge sits in the top-left corner: its text must have drawn dark pixels there.
  let dark = 0;
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 200; x++) if (pixelAt(image, x, y)[0]! < 100) dark++;
  }
  expect(dark).toBeGreaterThan(0);
});
