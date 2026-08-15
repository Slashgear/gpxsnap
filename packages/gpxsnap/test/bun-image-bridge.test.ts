import { expect, test } from "bun:test";
import { encodeWithBunImage, isBunImageAvailable } from "../src/bun-image-bridge.ts";
import { encodePng } from "../src/png/encode.ts";

test("isBunImageAvailable is true under bun test", () => {
  expect(isBunImageAvailable()).toBe(true);
});

test("encodeWithBunImage re-encodes PNG bytes to webp/jpeg", async () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const png = await encodePng(pixels, 4, 4);

  const webp = await encodeWithBunImage(png, "webp");
  expect((await new Bun.Image(webp).metadata()).format).toBe("webp");

  const jpeg = await encodeWithBunImage(png, "jpeg");
  expect((await new Bun.Image(jpeg).metadata()).format).toBe("jpeg");
});
