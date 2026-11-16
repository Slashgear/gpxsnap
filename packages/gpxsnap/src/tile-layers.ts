import type { PixelImage } from "./canvas.ts";
import { decodePng } from "./png/decode.ts";
import type { DecodedImage } from "./png/decode.ts";
import { isBunImageAvailable, transcodeToPngWithBunImage } from "./bun-image-bridge.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * The slice of the browser's image APIs used to decode non-PNG tiles. Typed
 * here rather than through the DOM lib, which this package doesn't load.
 */
interface BrowserImageApis {
  createImageBitmap(blob: Blob): Promise<{ width: number; height: number; close(): void }>;
  OffscreenCanvas: new (
    width: number,
    height: number,
  ) => {
    getContext(type: "2d"): {
      drawImage(image: unknown, x: number, y: number): void;
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
    } | null;
  };
}

function browserImageApis(): BrowserImageApis | undefined {
  const g = globalThis as Partial<BrowserImageApis>;
  return typeof g.createImageBitmap === "function" && typeof g.OffscreenCanvas === "function"
    ? (g as BrowserImageApis)
    : undefined;
}

/** Decodes any image format the browser can read, through `createImageBitmap` and an `OffscreenCanvas`. */
async function decodeWithBrowser(
  apis: BrowserImageApis,
  bytes: Uint8Array,
  expectedSizes: readonly number[],
): Promise<DecodedImage> {
  const bitmap = await apis.createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  try {
    const { width, height } = bitmap;
    if (!(width === height && expectedSizes.includes(width))) {
      throw new Error(
        `unexpected tile dimensions ${width}x${height}, expected a square tile of ${expectedSizes.join(" or ")} px`,
      );
    }
    const context = new apis.OffscreenCanvas(width, height).getContext("2d");
    if (!context) throw new Error("no 2D canvas context available to decode the tile");
    context.drawImage(bitmap, 0, 0);
    return { width, height, pixels: context.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

/**
 * Decodes a fetched tile. PNG goes through the package's own decoder on
 * every runtime. Anything else (e.g. Esri's JPEG tiles) needs a native
 * decoder: Bun's built-in `Bun.Image`, or the browser's own image decoding.
 * Node and Deno have neither, so they only read PNG tiles.
 */
export async function decodeTile(
  bytes: Uint8Array,
  expectedSizes: readonly number[],
): Promise<DecodedImage> {
  if (isPng(bytes)) return decodePng(bytes, { expectedSizes });
  if (isBunImageAvailable()) {
    return decodePng(await transcodeToPngWithBunImage(bytes), { expectedSizes });
  }
  const browser = browserImageApis();
  if (browser) return decodeWithBrowser(browser, bytes, expectedSizes);
  throw new Error("tile is not a PNG (e.g. JPEG); decoding non-PNG tiles needs Bun or a browser");
}

/**
 * Softens a tile's colors in place: `amount` (0-1) pulls each pixel halfway
 * toward its own gray level and a third of the way toward white, for a
 * muted, pastel basemap that lets the route stand out.
 */
export function fadeTile(image: PixelImage, amount: number): void {
  if (amount <= 0) return;
  const desaturate = amount * 0.5;
  const lighten = amount * 0.35;
  const px = image.pixels;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.3 * px[i]! + 0.59 * px[i + 1]! + 0.11 * px[i + 2]!;
    for (let c = 0; c < 3; c++) {
      const v = px[i + c]! + (gray - px[i + c]!) * desaturate;
      px[i + c] = v + (255 - v) * lighten;
    }
  }
}

/**
 * Bilinearly resamples the square region (`sx`, `sy`, `size`) of `src` to an
 * `outSize` x `outSize` image. Used to stretch an overlay tile from a lower
 * zoom (or a non-retina one) over a base tile.
 */
export function resampleRegion(
  src: PixelImage,
  sx: number,
  sy: number,
  size: number,
  outSize: number,
): PixelImage {
  if (sx === 0 && sy === 0 && size === src.width && outSize === src.width) return src;
  const out = new Uint8ClampedArray(outSize * outSize * 4);
  const step = size / outSize;
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  for (let y = 0; y < outSize; y++) {
    const fy = Math.min(maxY, Math.max(0, sy + (y + 0.5) * step - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(maxY, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < outSize; x++) {
      const fx = Math.min(maxX, Math.max(0, sx + (x + 0.5) * step - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(maxX, x0 + 1);
      const tx = fx - x0;
      const i00 = (y0 * src.width + x0) * 4;
      const i01 = (y0 * src.width + x1) * 4;
      const i10 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;
      const o = (y * outSize + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.pixels[i00 + c]! + (src.pixels[i01 + c]! - src.pixels[i00 + c]!) * tx;
        const bottom = src.pixels[i10 + c]! + (src.pixels[i11 + c]! - src.pixels[i10 + c]!) * tx;
        out[o + c] = top + (bottom - top) * ty;
      }
    }
  }
  return { width: outSize, height: outSize, pixels: out };
}

/** Composites `overlay` onto `base` in place; both must be the same size. */
export function compositeOverlay(
  base: PixelImage,
  overlay: PixelImage,
  opacity: number,
  blend: "normal" | "multiply",
): void {
  const b = base.pixels;
  const o = overlay.pixels;
  for (let i = 0; i < b.length; i += 4) {
    const a = (o[i + 3]! / 255) * opacity;
    if (a <= 0) continue;
    if (blend === "multiply") {
      // Darken by the overlay's brightness: white is neutral, black is full shadow.
      const shade = (0.3 * o[i]! + 0.59 * o[i + 1]! + 0.11 * o[i + 2]!) / 255;
      const factor = 1 - a * (1 - shade);
      b[i] = b[i]! * factor;
      b[i + 1] = b[i + 1]! * factor;
      b[i + 2] = b[i + 2]! * factor;
    } else {
      b[i] = b[i]! + (o[i]! - b[i]!) * a;
      b[i + 1] = b[i + 1]! + (o[i + 1]! - b[i + 1]!) * a;
      b[i + 2] = b[i + 2]! + (o[i + 2]! - b[i + 2]!) * a;
      b[i + 3] = b[i + 3]! + (255 - b[i + 3]!) * a;
    }
  }
}
