import { expect, test } from "bun:test";
import { decodePng } from "../src/png/decode.ts";
import { crc32 } from "../src/png/crc32.ts";

/** Hand-builds a PNG from already-filtered scanlines (each row: filter byte + packed samples). */
async function buildPng(
  ihdr: { width: number; height: number; bitDepth: number; colorType: number },
  rows: number[][],
  plte?: number[],
): Promise<Uint8Array> {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, ihdr.width);
  hv.setUint32(4, ihdr.height);
  header[8] = ihdr.bitDepth;
  header[9] = ihdr.colorType;
  const raw = new Uint8Array(rows.flat());
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...(plte ? [chunk("PLTE", new Uint8Array(plte))] : []),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const rgb = (pixels: Uint8ClampedArray) => {
  const out: number[][] = [];
  for (let i = 0; i < pixels.length; i += 4) out.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
  return out;
};

test("decodes a 4-bit palette PNG (as served by e.g. CARTO tiles)", async () => {
  // 3x2, indices row 0: 0 1 2, row 1: 2 1 0 — odd width checks the per-row byte padding.
  const png = await buildPng(
    { width: 3, height: 2, bitDepth: 4, colorType: 3 },
    [
      [0, 0x01, 0x20],
      [0, 0x21, 0x00],
    ],
    [255, 0, 0, 0, 255, 0, 0, 0, 255],
  );
  const image = await decodePng(png);
  expect(rgb(image.pixels)).toEqual([
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [0, 0, 255],
    [0, 255, 0],
    [255, 0, 0],
  ]);
});

test("decodes a 1-bit grayscale PNG, scaling levels to 0-255", async () => {
  const png = await buildPng({ width: 9, height: 1, bitDepth: 1, colorType: 0 }, [
    [0, 0b10100000, 0b10000000],
  ]);
  const image = await decodePng(png);
  expect(rgb(image.pixels).map((p) => p[0])).toEqual([255, 0, 255, 0, 0, 0, 0, 0, 255]);
});

test("unfilters sub-byte rows with a 1-byte left distance", async () => {
  // 2-bit palette, 4 pixels = 1 byte per row; row 1 uses the Up filter (2).
  const png = await buildPng(
    { width: 4, height: 2, bitDepth: 2, colorType: 3 },
    [
      [0, 0b00011011],
      [2, 0],
    ],
    [0, 0, 0, 85, 85, 85, 170, 170, 170, 255, 255, 255],
  );
  const image = await decodePng(png);
  expect(rgb(image.pixels).map((p) => p[0])).toEqual([0, 85, 170, 255, 0, 85, 170, 255]);
});

test("still rejects 16-bit PNGs with a clear message", async () => {
  const png = await buildPng({ width: 1, height: 1, bitDepth: 16, colorType: 2 }, [
    [0, 0, 0, 0, 0, 0, 0],
  ]);
  await expect(decodePng(png)).rejects.toThrow(/unsupported PNG bit depth 16/);
});
