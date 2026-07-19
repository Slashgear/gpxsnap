import { expect, test } from "bun:test";
import { renderRoute } from "../src/index.ts";
import { decodePng } from "../src/png/decode.ts";

const FIXTURE_TILE = "test/fixtures/tile_13_4149_2818.png";
const GOLDEN_RENDER = "test/fixtures/golden_render.png";

// Every tile request resolves to the same checked-in fixture, regardless of
// z/x/y — this keeps the pipeline fully deterministic without touching the
// network, at the cost of the composited image not looking like a real map.
async function mockFetch(): Promise<Response> {
  const bytes = await Bun.file(FIXTURE_TILE).arrayBuffer();
  return new Response(bytes, { status: 200 });
}

const BASE_COORDINATES: [number, number][] = [
  [2.3491, 48.853],
  [2.3376, 48.8592],
  [2.2986, 48.8867],
];

test("renderRoute produces a stable, byte-for-byte reproducible PNG (golden render)", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 400,
    height: 300,
    padding: 20,
    tileUrl: "https://example.invalid/{z}/{x}/{y}.png",
    fetchImpl: mockFetch,
    userAgent: "gpxsnap-tests",
  });

  const golden = new Uint8Array(await Bun.file(GOLDEN_RENDER).arrayBuffer());
  expect(Array.from(png)).toEqual(Array.from(golden));
});

test("renderRoute output decodes to the requested canvas dimensions", async () => {
  const png = await renderRoute({
    coordinates: [
      [2.3522, 48.8566],
      [2.295, 48.8738],
    ],
    width: 320,
    height: 200,
    fetchImpl: mockFetch,
  });

  const decoded = await decodePng(png);
  expect(decoded.width).toBe(320);
  expect(decoded.height).toBe(200);
});

test("renderRoute handles a single-point route end-to-end without throwing", async () => {
  const png = await renderRoute({
    coordinates: [[2.3522, 48.8566]],
    width: 200,
    height: 200,
    fetchImpl: mockFetch,
  });

  const decoded = await decodePng(png);
  expect(decoded.width).toBe(200);
  expect(decoded.height).toBe(200);
});

test("renderRoute honors attribution: false and markers: false", async () => {
  const withExtras = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    fetchImpl: mockFetch,
  });
  const withoutExtras = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    attribution: false,
    markers: false,
    fetchImpl: mockFetch,
  });

  expect(withExtras.length).toBeGreaterThan(0);
  expect(withoutExtras).not.toEqual(withExtras);
});

test("renderRoute accepts a custom attribution string", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    attribution: "© Example Tiles",
    fetchImpl: mockFetch,
  });
  const decoded = await decodePng(png);
  expect(decoded.width).toBe(200);
});
