import { Canvas, upscaleNearestNeighbor } from "./canvas.ts";
import { decodePng } from "./png/decode.ts";
import { encodePng } from "./png/encode.ts";
import {
  boundsOf,
  canvasOrigin,
  fetchTiles,
  fitZoom,
  projectToCanvas,
  tilesForViewport,
  TILE_SIZE,
} from "./tiles.ts";
import type { FetchLike } from "./tiles.ts";
import { strokePolyline, drawDot } from "./line.ts";
import type { StrokeStyle } from "./line.ts";
import { drawStartEndMarkers } from "./markers.ts";
import type { MarkersStyle } from "./markers.ts";
import { drawBadge, measureBadgeSize } from "./badge.ts";
import type { BadgeStyle } from "./badge.ts";
import { stampAttribution, DEFAULT_ATTRIBUTION_TEXT } from "./attribution.ts";
import { drawElevationProfile } from "./elevation-chart.ts";
import type { ElevationProfilePoint, ElevationProfileStyle } from "./elevation-chart.ts";

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
}

export interface RenderPipelineOptions {
  width: number;
  height: number;
  padding?: number;
  line?: StrokeStyle;
  markers?: boolean | MarkersStyle;
  tileUrl?: string;
  attribution?: boolean | string;
  concurrency?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
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
  title?: string | false;
  /** Pre-formatted stats text (see statistics.ts), stamped as a badge in the top-right corner. */
  statsText?: string;
  statsStyle?: BadgeStyle;
  /** Cumulative-distance/elevation pairs (see elevation-chart.ts), drawn as a mini profile chart along the bottom strip. */
  elevationProfilePoints?: readonly ElevationProfilePoint[];
  elevationProfileStyle?: ElevationProfileStyle;
}

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_USER_AGENT = "gpxsnap (https://github.com/Slashgear/gpxsnap)";

/** Cycled per track when a track has no explicit/embedded color of its own. Index 0 matches line.ts's own single-track default. */
const DEFAULT_TRACK_COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#9B59B6", "#F39C12", "#1ABC9C"];

const WAYPOINT_COLOR = "#3498DB";
const WAYPOINT_RADIUS = 4;
const WAYPOINT_OPACITY = 0.9;

export async function renderPipeline(
  tracks: readonly RenderTrack[],
  waypoints: readonly LonLat[],
  options: RenderPipelineOptions,
): Promise<Uint8Array> {
  const { width, height } = options;
  const padding = options.padding ?? 40;
  const pixelRatio = options.pixelRatio ?? 1;
  if (!(pixelRatio > 0)) throw new Error("pixelRatio must be a positive number");

  // Framing (zoom/bounds/tiles) is computed in logical pixel space, unaffected by
  // pixelRatio, so the same geographic area is shown regardless of output resolution.
  const allCoordinates: LonLat[] = [...tracks.flatMap((t) => t.points), ...waypoints];
  const bounds = boundsOf(allCoordinates);
  const zoom = fitZoom(bounds, { width, height, padding });
  const origin = canvasOrigin(bounds, zoom, width, height);
  const tiles = tilesForViewport(origin, zoom, width, height);

  const fetched = await fetchTiles(tiles, {
    tileUrlTemplate: options.tileUrl ?? DEFAULT_TILE_URL,
    pixelRatio,
    concurrency: options.concurrency,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    fetchImpl: options.fetchImpl,
  });

  const canvas = new Canvas(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
  const physicalTileSize = TILE_SIZE * pixelRatio;
  for (const tile of tiles) {
    const bytes = fetched.get(`${tile.z}/${tile.x}/${tile.y}`);
    if (!bytes) continue;
    const decoded = await decodePng(bytes);
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

  tracks.forEach((track, i) => {
    const color =
      options.line?.color ?? track.color ?? DEFAULT_TRACK_COLORS[i % DEFAULT_TRACK_COLORS.length];
    strokePolyline(canvas, projectedTracks[i]!, { ...options.line, color }, pixelRatio);
  });

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

  const attribution = options.attribution ?? true;

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

  if (attribution) {
    stampAttribution(
      canvas,
      { text: typeof attribution === "string" ? attribution : undefined },
      pixelRatio,
    );
  }

  return encodePng(canvas.pixels, canvas.width, canvas.height);
}
