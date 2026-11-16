import { describe, expect, test } from "bun:test";
import { BASEMAPS, renderRoute } from "../src/index.ts";
import type { RenderRouteOptions } from "../src/index.ts";
import { decodePng } from "../src/png/decode.ts";
import { encodePng } from "../src/png/encode.ts";
import type { FetchLike } from "../src/tiles.ts";
import { parseCliArgs, CliUsageError } from "../src/cli.ts";

const COORDINATES: [number, number][] = [
  [2.3491, 48.853],
  [2.2986, 48.8867],
];

async function solidTile(rgba: [number, number, number, number], size = 256) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
  return encodePng(pixels, size, size);
}

const WHITE = await solidTile([255, 255, 255, 255]);
const RED = await solidTile([200, 40, 40, 255]);
const GRAY = await solidTile([128, 128, 128, 255]);
const CLEAR = await solidTile([0, 0, 0, 0]);

/** Serves `base` for base-layer URLs and `overlay` for overlay ones (by URL prefix), recording every URL. */
function routedFetch(base: Uint8Array, overlay: Uint8Array | number) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    if (url.startsWith("https://overlay.test/")) {
      return typeof overlay === "number"
        ? new Response("nope", { status: overlay })
        : new Response(overlay);
    }
    return new Response(base);
  };
  return { urls, fetchImpl };
}

const BASE = {
  coordinates: COORDINATES,
  width: 300,
  height: 200,
  tileUrl: "https://base.test/{z}/{x}/{y}.png",
  markers: false,
  attribution: false,
  tileRetries: 0,
} as const;

async function cornerPixel(options: Partial<RenderRouteOptions> & { fetchImpl: FetchLike }) {
  const image = await decodePng(await renderRoute({ ...BASE, ...options }));
  return Array.from(image.pixels.subarray(0, 4));
}

describe("overlay", () => {
  test("multiply darkens the base map by the overlay's gray level", async () => {
    const { fetchImpl } = routedFetch(WHITE, GRAY);
    const px = await cornerPixel({
      fetchImpl,
      overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", blend: "multiply" },
    });
    expect(px).toEqual([128, 128, 128, 255]);
  });

  test("opacity scales the effect", async () => {
    const { fetchImpl } = routedFetch(WHITE, GRAY);
    const px = await cornerPixel({
      fetchImpl,
      overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", blend: "multiply", opacity: 0.5 },
    });
    // 255 * (1 - 0.5 * (1 - 128/255)) ≈ 191
    expect(px[0]).toBeGreaterThanOrEqual(190);
    expect(px[0]).toBeLessThanOrEqual(192);
  });

  test("normal blend draws an opaque overlay and leaves transparent pixels alone", async () => {
    const opaque = routedFetch(WHITE, RED);
    expect(
      await cornerPixel({
        fetchImpl: opaque.fetchImpl,
        overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png" },
      }),
    ).toEqual([200, 40, 40, 255]);
    const clear = routedFetch(WHITE, CLEAR);
    expect(
      await cornerPixel({
        fetchImpl: clear.fetchImpl,
        overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png" },
      }),
    ).toEqual([255, 255, 255, 255]);
  });

  test("is best-effort: a missing overlay tile leaves the base map as is", async () => {
    const { fetchImpl } = routedFetch(WHITE, 404);
    const px = await cornerPixel({
      fetchImpl,
      overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", blend: "multiply" },
    });
    expect(px).toEqual([255, 255, 255, 255]);
  });

  test("above its maxZoom, fetches each covering lower-zoom tile once and stretches it", async () => {
    const { urls, fetchImpl } = routedFetch(WHITE, GRAY);
    const px = await cornerPixel({
      fetchImpl,
      overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", blend: "multiply", maxZoom: 10 },
    });
    const overlayUrls = urls.filter((u) => u.startsWith("https://overlay.test/"));
    const baseZoom = Number(urls.find((u) => u.startsWith("https://base.test/"))!.split("/")[3]);
    expect(baseZoom).toBeGreaterThan(10);
    expect(overlayUrls.length).toBeGreaterThan(0);
    expect(overlayUrls.every((u) => u.startsWith("https://overlay.test/10/"))).toBe(true);
    expect(new Set(overlayUrls).size).toBe(overlayUrls.length);
    expect(px).toEqual([128, 128, 128, 255]);
  });

  test("rejects an out-of-range opacity before fetching", async () => {
    const { urls, fetchImpl } = routedFetch(WHITE, GRAY);
    await expect(
      renderRoute({
        ...BASE,
        fetchImpl,
        overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", opacity: 2 },
      }),
    ).rejects.toThrow(/overlay.opacity must be between 0 and 1/);
    expect(urls).toEqual([]);
  });
});

describe("tileFade", () => {
  test("pulls colors toward gray and white", async () => {
    const { fetchImpl } = routedFetch(RED, 404);
    const [r, g, b] = await cornerPixel({ fetchImpl, tileFade: 1 });
    expect(r).toBeLessThan(200);
    expect(g).toBeGreaterThan(40);
    expect(r! - g!).toBeLessThan((200 - 40) / 2);
    expect(b).toBe(g!);
  });

  test("0 leaves tiles untouched, and out-of-range values throw", async () => {
    const { fetchImpl } = routedFetch(RED, 404);
    expect(await cornerPixel({ fetchImpl, tileFade: 0 })).toEqual([200, 40, 40, 255]);
    await expect(renderRoute({ ...BASE, fetchImpl, tileFade: -0.1 })).rejects.toThrow(
      /tileFade must be between 0 and 1/,
    );
  });
});

describe("basemap presets", () => {
  test("a preset fills in the tile URL, overlay and attribution", async () => {
    const { urls, fetchImpl } = routedFetch(WHITE, GRAY);
    const { tileUrl: _ignored, ...rest } = BASE;
    await renderRoute({ ...rest, basemap: "ign-plan-relief", fetchImpl });
    expect(urls.some((u) => u.includes("LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2"))).toBe(true);
    expect(urls.some((u) => u.includes("LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW"))).toBe(true);
  });

  test("explicit options win over the preset, and overlay: false drops its overlay", async () => {
    const { urls, fetchImpl } = routedFetch(WHITE, GRAY);
    await renderRoute({ ...BASE, basemap: "esri-topo-relief", overlay: false, fetchImpl });
    expect(urls.every((u) => u.startsWith("https://base.test/"))).toBe(true);
  });

  test("a preset's maxZoom caps the framing zoom", async () => {
    const { urls, fetchImpl } = routedFetch(WHITE, GRAY);
    const tiny: [number, number][] = [
      [2.3491, 48.853],
      [2.3492, 48.8531],
    ];
    await renderRoute({
      ...BASE,
      coordinates: tiny,
      basemap: "esri-light-gray",
      tileUrl: "https://base.test/{z}/{x}/{y}.png",
      fetchImpl,
    });
    expect(
      urls.every((u) => u.startsWith(`https://base.test/${BASEMAPS["esri-light-gray"].maxZoom}/`)),
    ).toBe(true);
  });

  test("every preset's attribution renders in the bitmap font", async () => {
    const { fetchImpl } = routedFetch(WHITE, GRAY);
    for (const preset of Object.values(BASEMAPS)) {
      await renderRoute({ ...BASE, attribution: preset.attribution, fetchImpl });
    }
  });

  test("an unknown preset name throws", async () => {
    const { fetchImpl } = routedFetch(WHITE, GRAY);
    await expect(renderRoute({ ...BASE, basemap: "nope" as "osm", fetchImpl })).rejects.toThrow(
      /unknown basemap "nope"/,
    );
  });
});

test("decodes JPEG tiles through Bun.Image", async () => {
  const jpeg = await new Bun.Image(RED).jpeg({ quality: 95 }).bytes();
  const { fetchImpl } = routedFetch(jpeg, 404);
  const [r, g, b] = await cornerPixel({ fetchImpl });
  expect(Math.abs(r! - 200)).toBeLessThan(6);
  expect(Math.abs(g! - 40)).toBeLessThan(6);
  expect(Math.abs(b! - 40)).toBeLessThan(6);
});

describe("CLI", () => {
  test("maps --basemap, --tile-fade, --max-zoom and the overlay flags", () => {
    const { options } = parseCliArgs([
      "ride.gpx",
      "--basemap",
      "esri-topo",
      "--tile-fade",
      "0.4",
      "--max-zoom",
      "15",
      "--overlay-url",
      "https://overlay.test/{z}/{x}/{y}.png",
      "--overlay-blend",
      "multiply",
      "--overlay-opacity",
      "0.6",
    ])!;
    expect(options).toMatchObject({
      basemap: "esri-topo",
      tileFade: 0.4,
      maxZoom: 15,
      overlay: { tileUrl: "https://overlay.test/{z}/{x}/{y}.png", blend: "multiply", opacity: 0.6 },
    });
  });

  test("--no-overlay drops a preset's overlay", () => {
    expect(
      parseCliArgs(["ride.gpx", "--basemap", "ign-plan-relief", "--no-overlay"])!.options.overlay,
    ).toBe(false);
  });

  test("rejects an unknown basemap and overlay flags without a URL", () => {
    expect(() => parseCliArgs(["ride.gpx", "--basemap", "carto"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["ride.gpx", "--overlay-blend", "multiply"])).toThrow(
      /need --overlay-url/,
    );
  });
});
