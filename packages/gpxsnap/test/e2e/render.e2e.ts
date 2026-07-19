// Portable across runtimes on purpose: no bun:test, no Bun/Deno-specific
// globals, just node:fs (which Bun and Deno both implement) and Web-standard
// APIs. This is what proves gpxsnap's raw .ts source is actually consumable
// directly by Bun, Node (>=22.18, native type-stripping), and Deno — not
// just "typechecks", but "a real runtime can import and run it".
import { readFileSync } from "node:fs";
import { renderRoute } from "../../src/index.ts";
import { decodePng } from "../../src/png/decode.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runtimeLabel(): string {
  const g = globalThis as { Bun?: { version: string }; Deno?: { version: { deno: string } } };
  if (g.Bun) return `Bun ${g.Bun.version}`;
  if (g.Deno) return `Deno ${g.Deno.version.deno}`;
  return `Node ${process.version}`;
}

async function mockFetch(): Promise<Response> {
  const fixtureUrl = new URL("../fixtures/tile_13_4149_2818.png", import.meta.url);
  const bytes = readFileSync(fixtureUrl);
  return new Response(bytes, { status: 200 });
}

const coordinates: [number, number][] = [
  [2.3491, 48.853],
  [2.3376, 48.8592],
  [2.2986, 48.8867],
];

const png = await renderRoute({
  coordinates,
  width: 300,
  height: 200,
  padding: 20,
  tileUrl: "https://example.invalid/{z}/{x}/{y}.png",
  fetchImpl: mockFetch,
});

assert(png.length > 0, "renderRoute produced an empty buffer");
assert(png[0] === 0x89 && png[1] === 0x50, "output is not a PNG (bad signature)");

const decoded = await decodePng(png);
assert(
  decoded.width === 300 && decoded.height === 200,
  `unexpected dimensions ${decoded.width}x${decoded.height}`,
);

console.log(
  `OK (${runtimeLabel()}): rendered ${png.length} bytes, decoded back to ${decoded.width}x${decoded.height}`,
);
