import type { FetchLike } from "./tiles.ts";
import type { StrokeStyle } from "./line.ts";
import type { MarkersStyle } from "./markers.ts";
import type { DistanceMarkersStyle } from "./distance-markers.ts";
import { simplifyCoordinates } from "./simplify.ts";
import { renderPipeline } from "./render-pipeline.ts";

export type LineStyle = StrokeStyle;
export type { MarkerStyle, MarkersStyle } from "./markers.ts";
export type { DistanceMarkersStyle } from "./distance-markers.ts";

export interface RenderRouteOptions {
  /** Track coordinates as [lon, lat] pairs, e.g. straight from a GPX <trkpt> extraction. */
  coordinates: readonly (readonly [number, number])[];
  width: number;
  height: number;
  /** Minimum margin, in pixels, kept between the fitted route bbox and the canvas edge. */
  padding?: number;
  /**
   * Simplify the route (Ramer-Douglas-Peucker) before rendering — a point is
   * dropped if it deviates less than this many meters from the line through
   * its neighbors. Omit or 0 to render every point as recorded.
   */
  simplify?: number;
  /**
   * Stamped as a badge in the top-left corner. `renderGpx` fills this in
   * automatically from the GPX file's track/metadata name unless you set it
   * explicitly (pass `false` to suppress even an auto-detected name).
   * Goes through the same bitmap font as everything else — see the README
   * for the supported character set.
   */
  title?: string | false;
  line?: LineStyle;
  /** Start/end route markers. Defaults to on; pass false to omit them. */
  markers?: boolean | MarkersStyle;
  /** XYZ tile URL template, e.g. "https://tile.openstreetmap.org/{z}/{x}/{y}.png". */
  tileUrl?: string;
  /**
   * Stamp tile attribution on the output. Defaults to on with OSM's required
   * text; pass a string to use different wording for a non-OSM tile source,
   * or false only if you're self-hosting tiles under your own terms.
   */
  attribution?: boolean | string;
  /**
   * Output resolution multiplier (e.g. `2` for a retina/HiDPI export). The
   * geographic framing is unchanged — only the canvas and every drawn
   * element (line, markers, badges, elevation profile) render at
   * `width * pixelRatio` x `height * pixelRatio` physical pixels. Also
   * requests retina map tiles when `tileUrl` has an `{r}` token (substituted
   * with `@2x`/`@3x`); without one, tiles are upscaled instead — sharp
   * overlays, blockier basemap. Defaults to `1`.
   */
  pixelRatio?: number;
  /**
   * Output image format. Defaults to `"png"`, produced by this package's own
   * dependency-free encoder — works on Bun, Node, and Deno alike, like the
   * rest of the package. `"webp"`/`"jpeg"` re-encode that PNG through Bun's
   * native `Bun.Image` (no npm dependency, built into the Bun binary): only
   * available when running on Bun — requesting either on Node/Deno throws
   * immediately, before any tile fetching.
   */
  format?: "png" | "webp" | "jpeg";
  /** 1–100. Only meaningful with `format: "webp" | "jpeg"`; ignored otherwise. */
  quality?: number;
  /**
   * Tick marks every `interval` (default `5`) `unit` (default `"km"`) of
   * real-world route distance, perpendicular to the route at that point.
   * Placed per track — no marker spans the gap between disconnected
   * tracks in a `renderGpx` render. `false`/omitted to skip; no labels are
   * drawn unless `showLabels` is set.
   */
  distanceMarkers?: boolean | DistanceMarkersStyle;
  /** Max concurrent tile fetches. */
  concurrency?: number;
  /** Sent as the tile request's User-Agent — OSM's tile usage policy requires one that identifies your app. */
  userAgent?: string;
  fetchImpl?: FetchLike;
}

/**
 * Renders a route over slippy-map tiles to a PNG: bounds fitting, tile
 * fetch/decode/composite, route line stroking, start/end markers, and the
 * required tile-attribution stamp.
 */
export async function renderRoute(options: RenderRouteOptions): Promise<Uint8Array> {
  const coordinates =
    options.simplify && options.simplify > 0
      ? simplifyCoordinates(options.coordinates, options.simplify)
      : options.coordinates;

  return renderPipeline([{ points: coordinates }], [], options);
}

export type { DecodedImage } from "./png/decode.ts";
