import { describe, expect, test } from "bun:test";
import { decodePng } from "../src/png/decode.ts";
import { encodePng } from "../src/png/encode.ts";

const FIXTURE = "test/fixtures/tile_13_4149_2818.png"; // real OSM tile, color type 3 (palette)

test("decodes a real palette (color type 3) OSM tile", async () => {
  const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
  const image = await decodePng(bytes);

  expect(image.width).toBe(256);
  expect(image.height).toBe(256);
  expect(image.pixels.length).toBe(256 * 256 * 4);

  // Every decoded pixel from a standard OSM tile should be fully opaque.
  for (let i = 3; i < image.pixels.length; i += 4) {
    expect(image.pixels[i]).toBe(255);
  }
});

test("decode is deterministic across runs", async () => {
  const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
  const a = await decodePng(bytes);
  const b = await decodePng(bytes);
  expect(a.pixels).toEqual(b.pixels);
});

describe("round-trip through the project's own encoder", () => {
  test("re-encoded PNG decodes back to identical pixels", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
    const original = await decodePng(bytes);

    const reencoded = await encodePng(original.pixels, original.width, original.height);
    const roundTripped = await decodePng(reencoded);

    expect(roundTripped.width).toBe(original.width);
    expect(roundTripped.height).toBe(original.height);
    expect(roundTripped.pixels).toEqual(original.pixels);
  });

  test("re-encoded PNG carries a valid PNG signature and IHDR/IDAT/IEND chunks", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
    const original = await decodePng(bytes);
    const reencoded = await encodePng(original.pixels, original.width, original.height);

    expect(Array.from(reencoded.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const chunkTypeAt = (offset: number) =>
      String.fromCharCode(
        reencoded[offset]!,
        reencoded[offset + 1]!,
        reencoded[offset + 2]!,
        reencoded[offset + 3]!,
      );
    expect(chunkTypeAt(12)).toBe("IHDR");

    const text = Array.from(reencoded)
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(text.includes("IDAT")).toBe(true);
    expect(text.slice(-8, -4)).toBe("IEND");
  });
});

test("encodes a small synthetic image and decodes it back exactly", async () => {
  const width = 4;
  const height = 3;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = (i * 17) % 256;
    pixels[i * 4 + 1] = (i * 53) % 256;
    pixels[i * 4 + 2] = (i * 97) % 256;
    pixels[i * 4 + 3] = 255;
  }

  const png = await encodePng(pixels, width, height);
  const decoded = await decodePng(png);

  expect(decoded.width).toBe(width);
  expect(decoded.height).toBe(height);
  expect(Array.from(decoded.pixels)).toEqual(Array.from(pixels));
});
