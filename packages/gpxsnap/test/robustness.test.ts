import { describe, expect, test } from "bun:test";
import { createMemoryTileCache, renderRoute } from "../src/index.ts";
import { decodePng } from "../src/png/decode.ts";
import { encodePng } from "../src/png/encode.ts";
import { fetchTiles } from "../src/tiles.ts";
import type { FetchLike } from "../src/tiles.ts";

const FIXTURE_TILE = "test/fixtures/tile_13_4149_2818.png";
const tileBytes = new Uint8Array(await Bun.file(FIXTURE_TILE).arrayBuffer());

const COORDINATES: [number, number][] = [
  [2.3491, 48.853],
  [2.2986, 48.8867],
];

const okFetch: FetchLike = async () => new Response(tileBytes, { status: 200 });

/** Never resolves on its own; rejects when its signal aborts, like real fetch. */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

const TILE = { x: 4149, y: 2818, z: 13 };
const FAST = { tileUrlTemplate: "https://example.invalid/{z}/{x}/{y}.png", retryDelayMs: 0 };

describe("width/height validation", () => {
  for (const [name, value] of [
    ["NaN", Number.NaN],
    ["zero", 0],
    ["negative", -100],
    ["fractional", 100.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["huge", 100_000],
  ] as const) {
    test(`rejects a ${name} width before fetching anything`, async () => {
      let calls = 0;
      const fetchImpl: FetchLike = async () => {
        calls++;
        return new Response(tileBytes);
      };
      await expect(
        renderRoute({ coordinates: COORDINATES, width: value, height: 200, fetchImpl }),
      ).rejects.toThrow(/width must be an integer/);
      expect(calls).toBe(0);
    });
  }

  test("rejects a height too", async () => {
    await expect(
      renderRoute({ coordinates: COORDINATES, width: 200, height: 0, fetchImpl: okFetch }),
    ).rejects.toThrow(/height must be an integer/);
  });

  test("rejects a pixelRatio that blows the physical canvas past the limit", async () => {
    await expect(
      renderRoute({
        coordinates: COORDINATES,
        width: 4096,
        height: 100,
        pixelRatio: 3,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(/physical pixels/);
  });

  test("rejects a negative padding", async () => {
    await expect(
      renderRoute({
        coordinates: COORDINATES,
        width: 200,
        height: 200,
        padding: -1,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(/padding/);
  });
});

describe("maxTiles", () => {
  test("refuses a render needing more tiles than maxTiles, before any request", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return new Response(tileBytes);
    };
    await expect(
      renderRoute({ coordinates: COORDINATES, width: 1024, height: 1024, maxTiles: 4, fetchImpl }),
    ).rejects.toThrow(/needs \d+ tiles, more than maxTiles \(4\)/);
    expect(calls).toBe(0);
  });

  test("the default limit still allows a typical social-card render", async () => {
    const png = await renderRoute({
      coordinates: COORDINATES,
      width: 1200,
      height: 630,
      attribution: false,
      fetchImpl: okFetch,
    });
    expect((await decodePng(png)).width).toBe(1200);
  });
});

describe("fetchTiles timeout and retry", () => {
  test("times out a hanging request", async () => {
    await expect(
      fetchTiles([TILE], { ...FAST, fetchImpl: hangingFetch, timeoutMs: 20, retries: 0 }),
    ).rejects.toThrow(/13\/4149\/2818: timed out after 20ms/);
  });

  test("times out even when fetchImpl ignores the abort signal", async () => {
    const deafFetch: FetchLike = () => new Promise(() => {});
    await expect(
      fetchTiles([TILE], { ...FAST, fetchImpl: deafFetch, timeoutMs: 20, retries: 0 }),
    ).rejects.toThrow(/timed out/);
  });

  test("retries a 503 then succeeds", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () =>
      ++calls < 3 ? new Response("busy", { status: 503 }) : new Response(tileBytes);
    const result = await fetchTiles([TILE], { ...FAST, fetchImpl, retries: 2 });
    expect(calls).toBe(3);
    expect(result.get("13/4149/2818")).toEqual(tileBytes);
  });

  test("retries a network error", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      if (++calls === 1) throw new TypeError("connection reset");
      return new Response(tileBytes);
    };
    await fetchTiles([TILE], { ...FAST, fetchImpl });
    expect(calls).toBe(2);
  });

  test("gives up after the configured number of retries", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return new Response("busy", { status: 500, statusText: "Server Error" });
    };
    await expect(fetchTiles([TILE], { ...FAST, fetchImpl, retries: 2 })).rejects.toThrow(
      /13\/4149\/2818: 500 Server Error/,
    );
    expect(calls).toBe(3);
  });

  test("does not retry a 404", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return new Response("nope", { status: 404, statusText: "Not Found" });
    };
    await expect(fetchTiles([TILE], { ...FAST, fetchImpl, retries: 3 })).rejects.toThrow(/404/);
    expect(calls).toBe(1);
  });

  test("onTileError: skip leaves failed tiles out instead of throwing", async () => {
    const fetchImpl: FetchLike = async (url) =>
      url.includes("/4150/") ? new Response("", { status: 404 }) : new Response(tileBytes);
    const result = await fetchTiles([TILE, { x: 4150, y: 2818, z: 13 }], {
      ...FAST,
      fetchImpl,
      onTileError: "skip",
    });
    expect([...result.keys()]).toEqual(["13/4149/2818"]);
  });

  test("passes an AbortSignal and the User-Agent to fetchImpl", async () => {
    let seen: { headers?: Record<string, string>; signal?: AbortSignal } | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = init;
      return new Response(tileBytes);
    };
    await fetchTiles([TILE], { ...FAST, fetchImpl, userAgent: "test-agent" });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.headers?.["User-Agent"]).toBe("test-agent");
  });
});

describe("tile cache", () => {
  test("serves repeated tiles from the cache instead of the network", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return new Response(tileBytes);
    };
    const tileCache = createMemoryTileCache();
    const options = {
      coordinates: COORDINATES,
      width: 300,
      height: 200,
      fetchImpl,
      tileCache,
    };
    await renderRoute(options);
    const firstRunCalls = calls;
    expect(firstRunCalls).toBeGreaterThan(0);
    await renderRoute(options);
    expect(calls).toBe(firstRunCalls);
  });

  test("createMemoryTileCache evicts the least recently used entry", () => {
    const cache = createMemoryTileCache(2);
    const bytes = new Uint8Array([1]);
    cache.set("a", bytes);
    cache.set("b", bytes);
    cache.get("a"); // "b" is now the oldest
    cache.set("c", bytes);
    expect(cache.get("a")).toBe(bytes);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(bytes);
  });
});

describe("tile decoding safeguards", () => {
  test("rejects a tile whose IHDR size isn't a tile size", async () => {
    const odd = await encodePng(new Uint8ClampedArray(300 * 300 * 4), 300, 300);
    await expect(decodePng(odd, { expectedSizes: [256, 512] })).rejects.toThrow(
      /unexpected PNG dimensions 300x300/,
    );
  });

  test("rejects a huge IHDR before allocating its pixels", async () => {
    // Patch a real tile's IHDR to claim 60000x60000: decoding must fail fast on
    // the header rather than try to allocate ~14 GB.
    const forged = tileBytes.slice();
    const view = new DataView(forged.buffer);
    view.setUint32(16, 60_000);
    view.setUint32(20, 60_000);
    await expect(decodePng(forged)).rejects.toThrow(/exceed the \d+-pixel limit/);
    await expect(decodePng(forged, { expectedSizes: [256] })).rejects.toThrow(
      /unexpected PNG dimensions/,
    );
  });

  test("rejects truncated image data instead of decoding garbage", async () => {
    const forged = tileBytes.slice();
    new DataView(forged.buffer).setUint32(20, 1024); // claims 256x1024
    await expect(decodePng(forged)).rejects.toThrow(/truncated/);
  });

  test("renderRoute fails clearly on a wrong-size tile, or skips it with onTileError: skip", async () => {
    const odd = await encodePng(new Uint8ClampedArray(300 * 300 * 4), 300, 300);
    const fetchImpl: FetchLike = async () => new Response(odd);
    const base = { coordinates: COORDINATES, width: 200, height: 200, fetchImpl };
    await expect(renderRoute(base)).rejects.toThrow(/failed to decode tile .*300x300/);
    const png = await renderRoute({ ...base, onTileError: "skip" });
    expect((await decodePng(png)).width).toBe(200);
  });

  test("accepts @2x tiles at pixelRatio 2", async () => {
    const retina = await encodePng(new Uint8ClampedArray(512 * 512 * 4).fill(255), 512, 512);
    const png = await renderRoute({
      coordinates: COORDINATES,
      width: 200,
      height: 200,
      pixelRatio: 2,
      tileUrl: "https://example.invalid/{z}/{x}/{y}{r}.png",
      fetchImpl: async () => new Response(retina),
    });
    expect((await decodePng(png)).width).toBe(400);
  });
});
