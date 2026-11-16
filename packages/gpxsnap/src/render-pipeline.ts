import { Canvas, upscaleNearestNeighbor } from "./canvas.ts";
import { decodePng } from "./png/decode.ts";
import { encodePng } from "./png/encode.ts";
import {
  encodeWithBunImage,
  isBunImageAvailable,
  unsupportedFormatError,
} from "./bun-image-bridge.ts";
import {
  boundsOf,
  canvasOrigin,
  fetchTiles,
  fitZoom,
  projectToCanvas,
  tilesForViewport,
  TILE_SIZE,
} from "./tiles.ts";
import type { FetchLike, TileCache } from "./tiles.ts";
import { strokePolyline, drawDot, parseColor } from "./line.ts";
import type { StrokeStyle } from "./line.ts";
import { drawStartEndMarkers } from "./markers.ts";
import type { MarkersStyle } from "./markers.ts";
import { drawBadge, measureBadgeSize } from "./badge.ts";
import type { BadgeStyle } from "./badge.ts";
import { stampAttribution, DEFAULT_ATTRIBUTION_TEXT } from "./attribution.ts";
import { drawElevationProfile } from "./elevation-chart.ts";
import type { ElevationProfilePoint, ElevationProfileStyle } from "./elevation-chart.ts";
import { drawLegend } from "./legend.ts";
import type { LegendStyle } from "./legend.ts";
import { buildDistanceMarkers, drawDistanceMarkers, intervalToMeters } from "./distance-markers.ts";
import type { DistanceMarkersStyle } from "./distance-markers.ts";
import { normalizeElevations, normalizeSpeeds } from "./color-by.ts";

/**
 * The shared implementation behind both `renderRoute` (one track) and
 * `renderGpx` (possibly many tracks + waypoints). Not part of the package's
 * public API — `src/index.ts` is the public entry point per package.json's
 * `exports` map, so anything exported there becomes public; this module
 * stays internal.
 */

export type LonLat = readonly [number, number];

export interface RenderTrack {
  points: readonly LonLat[];
  /** Falls back to this track's own color when `line.color` isn't set explicitly. */
  color?: string;
  /** Used as this track's row label in the `legend` overlay; falls back to "Track N" (1-indexed) when unset. */
  name?: string;
  /** Same length/order as `points`. Powers `line.colorBy: "elevation"`. */
  elevations?: readonly (number | undefined)[];
  /** Same length/order as `points`, ISO 8601. Powers `line.colorBy: "speed"`. */
  times?: readonly (string | undefined)[];
}

export interface RenderPipelineOptions {
  width: number;
  height: number;
  padding?: number;
  line?: StrokeStyle;
  markers?: boolean | MarkersStyle;
  /** `false` skips tile fetching entirely (see `RenderRouteOptions.tileUrl`). */
  tileUrl?: string | false;
  /** Canvas fill drawn under everything (hex color, or `"transparent"`, the default). */
  background?: string;
  attribution?: boolean | string;
  concurrency?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
  tileTimeoutMs?: number;
  tileRetries?: number;
  onTileError?: "throw" | "skip";
  tileCache?: TileCache;
  maxTiles?: number;
  /**
   * Output resolution multiplier — the geographic framing stays identical to
   * `pixelRatio: 1` (same zoom/bounds), but the canvas and every drawn
   * element (line, markers, badges, elevation profile) render at
   * `width * pixelRatio` x `height * pixelRatio` physical pixels, for crisp
   * display on high-DPI screens. Also requests retina tiles: substitutes
   * `{r}` in `tileUrl` with `@2x`/`@3x` when present in the template: a
   * template without `{r}` (e.g. the default OSM one, which has no retina
   * tiles) instead falls back to nearest-neighbor upscaling the standard
   * tile — sharp overlays, blockier basemap.
   */
  pixelRatio?: number;
  /**
   * Output image format. Defaults to `"png"`, produced by this package's own
   * dependency-free encoder on every runtime. `"webp"`/`"jpeg"` re-encode
   * that PNG through Bun's native `Bun.Image` — only available when running
   * on Bun; throws immediately (before any tile fetching) on Node/Deno.
   */
  format?: "png" | "webp" | "jpeg";
  /** 1–100. Only meaningful with `format: "webp" | "jpeg"`; ignored otherwise. */
  quality?: number;
  title?: string | false;
  /** Pre-formatted stats text (see statistics.ts), stamped as a badge in the top-right corner. */
  statsText?: string;
  statsStyle?: BadgeStyle;
  /** Cumulative-distance/elevation pairs (see elevation-chart.ts), drawn as a mini profile chart along the bottom strip. */
  elevationProfilePoints?: readonly ElevationProfilePoint[];
  elevationProfileStyle?: ElevationProfileStyle;
  /**
   * Color-swatch-and-name key for each track, stamped in the bottom-left
   * corner — only drawn when there's more than one track (a single track's
   * color needs no key). `false`/omitted to always skip it.
   */
  legend?: boolean | LegendStyle;
  /**
   * Tick marks every `interval` (default 5) `unit` (default `"km"`) of
   * real-world route distance, perpendicular to the route at that point.
   * Placed per track — no marker spans the gap between disconnected
   * tracks. `false`/omitted to skip; no labels are drawn unless
   * `showLabels` is set.
   */
  distanceMarkers?: boolean | DistanceMarkersStyle;
}

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_USER_AGENT = "gpxsnap (https://github.com/Slashgear/gpxsnap)";

/** Cycled per track when a track has no explicit/embedded color of its own. Index 0 matches line.ts's own single-track default. */
const DEFAULT_TRACK_COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#9B59B6", "#F39C12", "#1ABC9C"];

/** Largest accepted `width`/`height`, in logical pixels. */
export const MAX_DIMENSION = 4096;
/** Largest accepted physical canvas side (`width * pixelRatio`, `height * pixelRatio`). */
export const MAX_PHYSICAL_DIMENSION = 8192;
/** Default cap on tiles fetched for one render — enough for ~2300x2300 px, and keeps a typo from hammering the tile server. */
export const DEFAULT_MAX_TILES = 100;

function assertDimension(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new Error(`${name} must be an integer between 1 and ${MAX_DIMENSION}, got ${value}`);
  }
}

function resolveBackground(background: string | undefined): [number, number, number, number] {
  if (background === undefined || background === "transparent") return [0, 0, 0, 0];
  const [r, g, b] = parseColor(background);
  if (![r, g, b].every(Number.isFinite)) throw new Error(`unsupported color format: ${background}`);
  return [r, g, b, 255];
}

const WAYPOINT_COLOR = "#3498DB";
const WAYPOINT_RADIUS = 4;
const WAYPOINT_OPACITY = 0.9;

export async function renderPipeline(
  tracks: readonly RenderTrack[],
  waypoints: readonly LonLat[],
  options: RenderPipelineOptions,
): Promise<Uint8Array> {
  const { width, height } = options;
  assertDimension("width", width);
  assertDimension("height", height);
  const padding = options.padding ?? 40;
  if (!(padding >= 0) || !Number.isFinite(padding)) {
    throw new Error(`padding must be a non-negative number, got ${padding}`);
  }
  const pixelRatio = options.pixelRatio ?? 1;
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    throw new Error("pixelRatio must be a positive number");
  }
  if (
    Math.round(width * pixelRatio) > MAX_PHYSICAL_DIMENSION ||
    Math.round(height * pixelRatio) > MAX_PHYSICAL_DIMENSION
  ) {
    throw new Error(
      `width/height * pixelRatio must not exceed ${MAX_PHYSICAL_DIMENSION} physical pixels per side`,
    );
  }
  const maxTiles = options.maxTiles ?? DEFAULT_MAX_TILES;
  if (!Number.isInteger(maxTiles) || maxTiles < 1) {
    throw new Error("maxTiles must be a positive integer");
  }
  const onTileError = options.onTileError ?? "throw";
  const format = options.format ?? "png";
  if (format !== "png" && !isBunImageAvailable()) throw unsupportedFormatError(format);

  // Framing (zoom/bounds/tiles) is computed in logical pixel space, unaffected by
  // pixelRatio, so the same geographic area is shown regardless of output resolution.
  const allCoordinates: LonLat[] = [...tracks.flatMap((t) => t.points), ...waypoints];
  const bounds = boundsOf(allCoordinates);
  const zoom = fitZoom(bounds, { width, height, padding });
  const origin = canvasOrigin(bounds, zoom, width, height);
  const tileless = options.tileUrl === false;
  // Resolved before any request so a bad color fails fast.
  const backgroundFill = resolveBackground(options.background);
  const tiles = tileless ? [] : tilesForViewport(origin, zoom, width, height);
  if (tiles.length > maxTiles) {
    throw new Error(
      `this render needs ${tiles.length} tiles, more than maxTiles (${maxTiles}); use a smaller width/height or raise maxTiles`,
    );
  }

  const fetched = await fetchTiles(tiles, {
    tileUrlTemplate: options.tileUrl || DEFAULT_TILE_URL,
    pixelRatio,
    concurrency: options.concurrency,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.tileTimeoutMs,
    retries: options.tileRetries,
    onTileError,
    tileCache: options.tileCache,
  });

  // A tile arrives either at the standard size or, from a `{r}` template, at
  // its retina multiple. Anything else is a misbehaving server or a wrong URL.
  const retinaMultiple = Math.round(pixelRatio);
  const expectedTileSizes =
    retinaMultiple >= 2 ? [TILE_SIZE, TILE_SIZE * retinaMultiple] : [TILE_SIZE];

  const canvas = new Canvas(
    Math.round(width * pixelRatio),
    Math.round(height * pixelRatio),
    backgroundFill,
  );
  const physicalTileSize = TILE_SIZE * pixelRatio;
  for (const tile of tiles) {
    const bytes = fetched.get(`${tile.z}/${tile.x}/${tile.y}`);
    if (!bytes) continue;
    let decoded;
    try {
      decoded = await decodePng(bytes, { expectedSizes: expectedTileSizes });
    } catch (error) {
      if (onTileError === "skip") continue;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to decode tile ${tile.z}/${tile.x}/${tile.y}: ${reason}`, {
        cause: error,
      });
    }
    // A genuine retina tile asset already arrives at physicalTileSize; a plain
    // one (e.g. the default OSM source, which has no `{r}` retina tiles) gets
    // upscaled so it still covers its full slot on the scaled-up canvas.
    const image =
      decoded.width === physicalTileSize
        ? decoded
        : upscaleNearestNeighbor(decoded, physicalTileSize / decoded.width);
    const destX = Math.round((tile.x * TILE_SIZE - origin.x) * pixelRatio);
    const destY = Math.round((tile.y * TILE_SIZE - origin.y) * pixelRatio);
    canvas.blit(image, destX, destY);
  }

  const projectedTracks = tracks.map((track) =>
    track.points.map(([lon, lat]) => {
      const p = projectToCanvas(lon, lat, zoom, origin);
      return { x: p.x * pixelRatio, y: p.y * pixelRatio };
    }),
  );

  const resolvedTrackColors = tracks.map(
    (track, i) =>
      options.line?.color ?? track.color ?? DEFAULT_TRACK_COLORS[i % DEFAULT_TRACK_COLORS.length]!,
  );

  tracks.forEach((track, i) => {
    const colorBy = options.line?.colorBy ?? "length";
    const pointValues =
      colorBy === "elevation" && track.elevations
        ? normalizeElevations(track.elevations)
        : colorBy === "speed" && track.times
          ? normalizeSpeeds(track.points, track.times)
          : undefined;

    strokePolyline(
      canvas,
      projectedTracks[i]!,
      { ...options.line, color: resolvedTrackColors[i] },
      pixelRatio,
      pointValues,
    );
  });

  if (options.distanceMarkers) {
    const distanceMarkersStyle =
      typeof options.distanceMarkers === "object" ? options.distanceMarkers : {};
    const intervalMeters = intervalToMeters(
      distanceMarkersStyle.interval ?? 5,
      distanceMarkersStyle.unit ?? "km",
    );
    tracks.forEach((track, i) => {
      const trackMarkers = buildDistanceMarkers(track.points, projectedTracks[i]!, intervalMeters);
      drawDistanceMarkers(
        canvas,
        trackMarkers,
        { ...distanceMarkersStyle, color: distanceMarkersStyle.color ?? resolvedTrackColors[i] },
        pixelRatio,
      );
    });
  }

  for (const [lon, lat] of waypoints) {
    const p = projectToCanvas(lon, lat, zoom, origin);
    drawDot(
      canvas,
      { x: p.x * pixelRatio, y: p.y * pixelRatio },
      WAYPOINT_RADIUS * pixelRatio,
      WAYPOINT_COLOR,
      WAYPOINT_OPACITY,
    );
  }

  const markers = options.markers ?? true;
  if (markers) {
    const allProjected = projectedTracks.flat();
    drawStartEndMarkers(
      canvas,
      allProjected,
      typeof markers === "object" ? markers : {},
      pixelRatio,
    );
  }

  if (options.title) {
    drawBadge(canvas, options.title, "top-left", {}, pixelRatio);
  }

  if (options.statsText) {
    drawBadge(canvas, options.statsText, "top-right", options.statsStyle, pixelRatio);
  }

  // Without tiles there is no map data to credit, so attribution defaults off
  // (an explicit `attribution` value is still honored).
  const attribution = options.attribution ?? !tileless;

  if (options.elevationProfilePoints) {
    // Reserve room for the attribution badge (bottom-right, drawn after this)
    // so the plotted line doesn't run underneath it and get visually cut off.
    const reservedRightMargin = attribution
      ? measureBadgeSize(
          typeof attribution === "string" ? attribution : DEFAULT_ATTRIBUTION_TEXT,
          {},
          pixelRatio,
        ).width
      : 0;
    drawElevationProfile(
      canvas,
      options.elevationProfilePoints,
      {
        reservedRightMargin,
        ...options.elevationProfileStyle,
      },
      pixelRatio,
    );
  }

  if (options.legend && tracks.length > 1) {
    const legendEntries = tracks.map((track, i) => ({
      color:
        options.line?.color ??
        track.color ??
        DEFAULT_TRACK_COLORS[i % DEFAULT_TRACK_COLORS.length]!,
      label: track.name ?? `Track ${i + 1}`,
    }));
    drawLegend(
      canvas,
      legendEntries,
      typeof options.legend === "object" ? options.legend : {},
      pixelRatio,
    );
  }

  if (attribution) {
    stampAttribution(
      canvas,
      { text: typeof attribution === "string" ? attribution : undefined },
      pixelRatio,
    );
  }

  const png = await encodePng(canvas.pixels, canvas.width, canvas.height);
  return format === "png" ? png : encodeWithBunImage(png, format, options.quality);
}
