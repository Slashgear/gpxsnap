import { crc32 } from "./crc32.ts";

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4; // always encode as RGBA8 (color type 6)

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return chunk;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Picks the lowest-entropy filter per scanline, per the PNG spec's minimum-sum-of-absolute-differences heuristic. */
function filterScanlines(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * BYTES_PER_PIXEL;
  const bpp = BYTES_PER_PIXEL;
  const out = new Uint8Array((stride + 1) * height);
  const candidates: Uint8Array[] = [
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
  ];

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;

    const [none, sub, up, avg, pth] = candidates;
    for (let x = 0; x < stride; x++) {
      const cur = pixels[rowStart + x]!;
      const a = x >= bpp ? pixels[rowStart + x - bpp]! : 0;
      const b = y > 0 ? pixels[prevRowStart + x]! : 0;
      const c = y > 0 && x >= bpp ? pixels[prevRowStart + x - bpp]! : 0;
      none![x] = cur;
      sub![x] = (cur - a) & 0xff;
      up![x] = (cur - b) & 0xff;
      avg![x] = (cur - ((a + b) >> 1)) & 0xff;
      pth![x] = (cur - paeth(a, b, c)) & 0xff;
    }

    let bestIdx = 0;
    let bestScore = Infinity;
    for (let f = 0; f < candidates.length; f++) {
      let score = 0;
      const row = candidates[f]!;
      for (let x = 0; x < stride; x++) {
        const v = row[x]!;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestIdx = f;
      }
    }

    const destStart = y * (stride + 1);
    out[destStart] = bestIdx;
    out.set(candidates[bestIdx]!, destStart + 1);
  }

  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encodes raw RGBA8 pixels as a non-interlaced, 8-bit, color-type-6 PNG. */
export async function encodePng(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const rgba =
    pixels instanceof Uint8Array
      ? pixels
      : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const filtered = filterScanlines(rgba, width, height);
  const idatData = await deflate(filtered);

  const parts = [
    SIGNATURE,
    writeChunk("IHDR", ihdrData),
    writeChunk("IDAT", idatData),
    writeChunk("IEND", new Uint8Array(0)),
  ];

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
