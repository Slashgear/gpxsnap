/** A plain RGBA8 pixel buffer — the in-memory target tiles are composited onto and the route line is stroked into. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;

  constructor(
    width: number,
    height: number,
    fill: [number, number, number, number] = [0, 0, 0, 0],
  ) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    if (fill[0] || fill[1] || fill[2] || fill[3]) {
      for (let i = 0; i < this.pixels.length; i += 4) {
        this.pixels[i] = fill[0];
        this.pixels[i + 1] = fill[1];
        this.pixels[i + 2] = fill[2];
        this.pixels[i + 3] = fill[3];
      }
    }
  }

  /** Copies `src`'s pixels onto this canvas at (destX, destY), cropping whatever falls outside the canvas bounds. */
  blit(
    src: { width: number; height: number; pixels: Uint8ClampedArray | Uint8Array },
    destX: number,
    destY: number,
  ): void {
    const srcX0 = Math.max(0, -destX);
    const srcY0 = Math.max(0, -destY);
    const srcX1 = Math.min(src.width, this.width - destX);
    const srcY1 = Math.min(src.height, this.height - destY);
    if (srcX0 >= srcX1 || srcY0 >= srcY1) return;

    for (let sy = srcY0; sy < srcY1; sy++) {
      const dy = destY + sy;
      const srcRowStart = (sy * src.width + srcX0) * 4;
      const destRowStart = (dy * this.width + (destX + srcX0)) * 4;
      const rowLength = (srcX1 - srcX0) * 4;
      this.pixels.set(src.pixels.subarray(srcRowStart, srcRowStart + rowLength), destRowStart);
    }
  }

  /** Blends a single pixel with the given RGBA color using standard alpha-over compositing. */
  blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    if (a >= 1) {
      this.pixels[i] = r;
      this.pixels[i + 1] = g;
      this.pixels[i + 2] = b;
      this.pixels[i + 3] = 255;
      return;
    }
    const dstA = this.pixels[i + 3]! / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) return;
    this.pixels[i] = (r * a + this.pixels[i]! * dstA * (1 - a)) / outA;
    this.pixels[i + 1] = (g * a + this.pixels[i + 1]! * dstA * (1 - a)) / outA;
    this.pixels[i + 2] = (b * a + this.pixels[i + 2]! * dstA * (1 - a)) / outA;
    this.pixels[i + 3] = outA * 255;
  }
}
