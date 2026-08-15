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

test("renderRoute accepts a simplify tolerance without throwing and still fits the requested canvas", async () => {
  const denseLine: [number, number][] = [];
  for (let i = 0; i <= 100; i++) {
    denseLine.push([2.35 + i * 0.0002, 48.85 + i * 0.00002]);
  }

  const png = await renderRoute({
    coordinates: denseLine,
    width: 300,
    height: 200,
    simplify: 5000, // deliberately aggressive: collapses this near-straight line hard
    fetchImpl: mockFetch,
  });

  const decoded = await decodePng(png);
  expect(decoded.width).toBe(300);
  expect(decoded.height).toBe(200);
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

test("renderRoute pixelRatio scales output dimensions, framing the same area", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    pixelRatio: 2,
    fetchImpl: mockFetch,
  });
  const decoded = await decodePng(png);
  expect(decoded.width).toBe(400);
  expect(decoded.height).toBe(300);
});

test("renderRoute pixelRatio falls back to upscaling a non-retina tile (no {r} in tileUrl)", async () => {
  // The fixture tile is a plain 256x256 PNG — no @2x asset behind it — so this
  // only succeeds if the pipeline upscales rather than assuming a retina tile arrived.
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    pixelRatio: 2,
    tileUrl: "https://example.invalid/{z}/{x}/{y}.png",
    fetchImpl: mockFetch,
  });
  const decoded = await decodePng(png);
  expect(decoded.width).toBe(400);
  expect(decoded.height).toBe(300);
});

test("renderRoute pixelRatio requests a retina tile suffix when the tileUrl template has {r}", async () => {
  const requestedUrls: string[] = [];
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    pixelRatio: 2,
    tileUrl: "https://example.invalid/{z}/{x}/{y}{r}.png",
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return mockFetch();
    },
  });

  expect(requestedUrls.length).toBeGreaterThan(0);
  for (const url of requestedUrls) expect(url).toContain("@2x.png");

  const decoded = await decodePng(png);
  expect(decoded.width).toBe(400);
  expect(decoded.height).toBe(300);
});

test("renderRoute rejects a non-positive pixelRatio", () => {
  expect(
    renderRoute({
      coordinates: BASE_COORDINATES,
      width: 200,
      height: 150,
      pixelRatio: 0,
      fetchImpl: mockFetch,
    }),
  ).rejects.toThrow();
});

test("renderRoute format: webp produces bytes Bun sniffs as webp", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    format: "webp",
    fetchImpl: mockFetch,
  });
  const meta = await new Bun.Image(png).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(200);
  expect(meta.height).toBe(150);
});

test("renderRoute format: jpeg produces bytes Bun sniffs as jpeg", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    format: "jpeg",
    fetchImpl: mockFetch,
  });
  const meta = await new Bun.Image(png).metadata();
  expect(meta.format).toBe("jpeg");
});

test("renderRoute format: png (default) is untouched by the Bun.Image bridge", async () => {
  const png = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 200,
    height: 150,
    fetchImpl: mockFetch,
  });
  expect(png[0]).toBe(0x89); // PNG signature — same golden-render path as before
  expect(png[1]).toBe(0x50);
});

test("renderRoute format: jpeg quality changes output size", async () => {
  const low = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 400,
    height: 300,
    format: "jpeg",
    quality: 5,
    fetchImpl: mockFetch,
  });
  const high = await renderRoute({
    coordinates: BASE_COORDINATES,
    width: 400,
    height: 300,
    format: "jpeg",
    quality: 95,
    fetchImpl: mockFetch,
  });
  expect(high.length).toBeGreaterThan(low.length);
});

test("renderRoute distanceMarkers changes the output, distanceMarkers: false does not", async () => {
  const denseLine: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    denseLine.push([2.3 + i * 0.001, 48.85 + i * 0.0001]);
  }

  const plain = await renderRoute({
    coordinates: denseLine,
    width: 400,
    height: 300,
    fetchImpl: mockFetch,
  });
  const withMarkers = await renderRoute({
    coordinates: denseLine,
    width: 400,
    height: 300,
    distanceMarkers: { interval: 2, unit: "km" },
    fetchImpl: mockFetch,
  });
  const explicitlyOff = await renderRoute({
    coordinates: denseLine,
    width: 400,
    height: 300,
    distanceMarkers: false,
    fetchImpl: mockFetch,
  });

  expect(Array.from(withMarkers)).not.toEqual(Array.from(plain));
  expect(Array.from(explicitlyOff)).toEqual(Array.from(plain));
});

test("renderRoute line.gradient changes the output vs. a flat line.color", async () => {
  const denseLine: [number, number][] = [];
  for (let i = 0; i <= 100; i++) {
    denseLine.push([2.3 + i * 0.002, 48.85 + i * 0.0002]);
  }

  const flat = await renderRoute({
    coordinates: denseLine,
    width: 400,
    height: 300,
    line: { color: "#E74C3C" },
    fetchImpl: mockFetch,
  });
  const gradient = await renderRoute({
    coordinates: denseLine,
    width: 400,
    height: 300,
    line: { gradient: "rainbow" },
    fetchImpl: mockFetch,
  });

  expect(Array.from(gradient)).not.toEqual(Array.from(flat));
});
