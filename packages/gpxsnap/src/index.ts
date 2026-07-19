import { Canvas } from "./canvas.ts";
import { encodePng } from "./png/encode.ts";
import { decodePng } from "./png/decode.ts";
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
import { strokePolyline } from "./line.ts";
import type { StrokeStyle } from "./line.ts";
import { stampAttribution } from "./attribution.ts";
import { drawStartEndMarkers } from "./markers.ts";
import type { MarkersStyle } from "./markers.ts";

export type LineStyle = StrokeStyle;
export type { MarkerStyle, MarkersStyle } from "./markers.ts";

export interface RenderRouteOptions {
  /** Track coordinates as [lon, lat] pairs, e.g. straight from a GPX <trkpt> extraction. */
  coordinates: readonly (readonly [number, number])[];
  width: number;
  height: number;
  /** Minimum margin, in pixels, kept between the fitted route bbox and the canvas edge. */
  padding?: number;
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
  /** Max concurrent tile fetches. */
  concurrency?: number;
  /** Sent as the tile request's User-Agent — OSM's tile usage policy requires one that identifies your app. */
  userAgent?: string;
  fetchImpl?: FetchLike;
}

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_USER_AGENT = "gpxsnap (https://github.com/Slashgear/gpxsnap)";

/**
 * Renders a route over slippy-map tiles to a PNG: bounds fitting, tile
 * fetch/decode/composite, route line stroking, start/end markers, and the
 * required tile-attribution stamp.
 */
export async function renderRoute(options: RenderRouteOptions): Promise<Uint8Array> {
  const { coordinates, width, height } = options;
  const padding = options.padding ?? 40;

  const bounds = boundsOf(coordinates);
  const zoom = fitZoom(bounds, { width, height, padding });
  const origin = canvasOrigin(bounds, zoom, width, height);
  const tiles = tilesForViewport(origin, zoom, width, height);

  const fetched = await fetchTiles(tiles, {
    tileUrlTemplate: options.tileUrl ?? DEFAULT_TILE_URL,
    concurrency: options.concurrency,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    fetchImpl: options.fetchImpl,
  });

  const canvas = new Canvas(width, height);
  for (const tile of tiles) {
    const bytes = fetched.get(`${tile.z}/${tile.x}/${tile.y}`);
    if (!bytes) continue;
    const decoded = await decodePng(bytes);
    const destX = Math.round(tile.x * TILE_SIZE - origin.x);
    const destY = Math.round(tile.y * TILE_SIZE - origin.y);
    canvas.blit(decoded, destX, destY);
  }

  const routePoints = coordinates.map(([lon, lat]) => projectToCanvas(lon, lat, zoom, origin));
  strokePolyline(canvas, routePoints, options.line);

  const markers = options.markers ?? true;
  if (markers) {
    drawStartEndMarkers(canvas, routePoints, typeof markers === "object" ? markers : {});
  }

  const attribution = options.attribution ?? true;
  if (attribution) {
    stampAttribution(canvas, { text: typeof attribution === "string" ? attribution : undefined });
  }

  return encodePng(canvas.pixels, canvas.width, canvas.height);
}

export type { DecodedImage } from "./png/decode.ts";
