/**
 * The one deliberate exception to this package's "no native codecs"
 * design: Bun ships `Bun.Image`, a native JPEG/PNG/WebP encoder built into
 * the runtime itself (libjpeg-turbo/spng/libwebp, zero npm dependency, no
 * addon build step). Kept isolated in its own module — the dependency-free
 * PNG pipeline in `png/encode.ts` is untouched and still the only renderer
 * on Node/Deno. It re-encodes an already-produced PNG to WebP/JPEG, and
 * transcodes non-PNG tiles (e.g. Esri's JPEG tiles) to PNG for the decoder.
 */

/** `typeof Bun` (not a bare `Bun` reference) so this is safe to evaluate on Node/Deno, which have no `Bun` global at all. */
export function isBunImageAvailable(): boolean {
  return typeof Bun !== "undefined" && typeof Bun.Image !== "undefined";
}

export function unsupportedFormatError(format: "webp" | "jpeg"): Error {
  return new Error(
    `format: "${format}" requires Bun's native Bun.Image API, not available on this runtime. ` +
      `Only "png" (the default) is supported outside Bun.`,
  );
}

/** Transcodes an image Bun can read (JPEG, WebP, PNG) to PNG bytes, for tile sources that don't serve PNG. Throws outside Bun. */
export async function transcodeToPngWithBunImage(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isBunImageAvailable()) throw new Error("Bun.Image is not available on this runtime");
  return await new Bun.Image(bytes).png().bytes();
}

/** Re-encodes already-rendered PNG bytes to WebP/JPEG via `Bun.Image`. Throws outside Bun. */
export async function encodeWithBunImage(
  pngBytes: Uint8Array,
  format: "webp" | "jpeg",
  quality?: number,
): Promise<Uint8Array> {
  if (!isBunImageAvailable()) throw unsupportedFormatError(format);
  const img = new Bun.Image(pngBytes);
  const pipeline = format === "webp" ? img.webp({ quality }) : img.jpeg({ quality });
  return await pipeline.bytes();
}
