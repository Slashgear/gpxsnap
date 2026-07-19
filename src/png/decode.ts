const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// A plain object + type alias instead of `enum` — TypeScript enums have
// runtime semantics that Node's/Deno's type-stripping can't erase, so this
// project avoids them everywhere in favor of "erasable syntax" only.
export const ColorType = {
  Grayscale: 0,
  Rgb: 2,
  Palette: 3,
  GrayscaleAlpha: 4,
  Rgba: 6,
} as const;
export type ColorType = (typeof ColorType)[keyof typeof ColorType];

export interface DecodedImage {
  width: number;
  height: number;
  /** Raw RGBA8 pixels, row-major, 4 bytes per pixel. */
  pixels: Uint8ClampedArray;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunk[] {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG: bad signature");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let offset = SIGNATURE.length;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);
    chunks.push({ type, data });
    offset = dataStart + length + 4; // skip CRC
    if (type === "IEND") break;
  }
  return chunks;
}

interface Ihdr {
  width: number;
  height: number;
  bitDepth: number;
  colorType: ColorType;
  interlace: number;
}

function parseIhdr(data: Uint8Array): Ihdr {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    width: view.getUint32(0),
    height: view.getUint32(4),
    bitDepth: data[8]!,
    colorType: data[9]! as ColorType,
    interlace: data[12]!,
  };
}

function channelsForColorType(colorType: ColorType): number {
  switch (colorType) {
    case ColorType.Grayscale:
      return 1;
    case ColorType.Rgb:
      return 3;
    case ColorType.Palette:
      return 1;
    case ColorType.GrayscaleAlpha:
      return 2;
    case ColorType.Rgba:
      return 4;
  }
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

/** Reverses the five PNG scanline filters, in place, over the raw (post-inflate) IDAT bytes. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[src]!;
    src += 1;
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const filtByte = raw[src + x]!;
      const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
      const b = y > 0 ? out[prevRowStart + x]! : 0;
      const c = y > 0 && x >= bpp ? out[prevRowStart + x - bpp]! : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = filtByte;
          break;
        case 1:
          value = filtByte + a;
          break;
        case 2:
          value = filtByte + b;
          break;
        case 3:
          value = filtByte + ((a + b) >> 1);
          break;
        case 4:
          value = filtByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      out[rowStart + x] = value & 0xff;
    }
    src += stride;
  }
  return out;
}

function toRgba(
  raw: Uint8Array,
  width: number,
  height: number,
  colorType: ColorType,
  palette: Uint8Array | null,
  paletteAlpha: Uint8Array | null,
): Uint8ClampedArray {
  const channels = channelsForColorType(colorType);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const o = i * 4;
    switch (colorType) {
      case ColorType.Grayscale: {
        const g = raw[p]!;
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = 255;
        break;
      }
      case ColorType.GrayscaleAlpha: {
        const g = raw[p]!;
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = raw[p + 1]!;
        break;
      }
      case ColorType.Rgb: {
        out[o] = raw[p]!;
        out[o + 1] = raw[p + 1]!;
        out[o + 2] = raw[p + 2]!;
        out[o + 3] = 255;
        break;
      }
      case ColorType.Rgba: {
        out[o] = raw[p]!;
        out[o + 1] = raw[p + 1]!;
        out[o + 2] = raw[p + 2]!;
        out[o + 3] = raw[p + 3]!;
        break;
      }
      case ColorType.Palette: {
        if (!palette) throw new Error("palette (PLTE) chunk missing for color type 3");
        const idx = raw[p]!;
        out[o] = palette[idx * 3]!;
        out[o + 1] = palette[idx * 3 + 1]!;
        out[o + 2] = palette[idx * 3 + 2]!;
        out[o + 3] = paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx]! : 255;
        break;
      }
    }
  }
  return out;
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decodes a non-interlaced, 8-bit-depth PNG (color type 0, 2, 3, 4, or 6) into raw RGBA8 pixels.
 * This covers every shape a slippy-map XYZ tile server emits.
 */
export async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  const chunks = readChunks(bytes);
  const ihdrChunk = chunks.find((c) => c.type === "IHDR");
  if (!ihdrChunk) throw new Error("PNG missing IHDR chunk");
  const ihdr = parseIhdr(ihdrChunk.data);

  if (ihdr.bitDepth !== 8) {
    throw new Error(`unsupported PNG bit depth ${ihdr.bitDepth}, only 8-bit is supported`);
  }
  if (ihdr.interlace !== 0) {
    throw new Error("interlaced PNGs are not supported");
  }

  const plteChunk = chunks.find((c) => c.type === "PLTE");
  const trnsChunk = chunks.find((c) => c.type === "tRNS");

  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  let idatLength = 0;
  for (const c of idatChunks) idatLength += c.data.length;
  const idat = new Uint8Array(idatLength);
  let idatOffset = 0;
  for (const c of idatChunks) {
    idat.set(c.data, idatOffset);
    idatOffset += c.data.length;
  }

  const inflated = await inflate(idat);
  const channels = channelsForColorType(ihdr.colorType);
  const raw = unfilter(inflated, ihdr.width, ihdr.height, channels);
  const pixels = toRgba(
    raw,
    ihdr.width,
    ihdr.height,
    ihdr.colorType,
    plteChunk ? plteChunk.data : null,
    trnsChunk ? trnsChunk.data : null,
  );

  return { width: ihdr.width, height: ihdr.height, pixels };
}
