import type { RenderRouteOptions } from "./index.ts";
import { renderPipeline } from "./render-pipeline.ts";
import type { RenderTrack } from "./render-pipeline.ts";
import { simplifyCoordinates } from "./simplify.ts";
import type { BadgeStyle } from "./badge.ts";
import { computeStatistics, formatStatistics } from "./statistics.ts";
import { buildElevationProfile } from "./elevation-chart.ts";
import type { ElevationProfileStyle } from "./elevation-chart.ts";

const NAME_TAG = /<name>([\s\S]*?)<\/name>/;

function extractAttr(attrsOrTag: string, name: string): string | null {
  const match = attrsOrTag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!);
}

function extractNameFrom(content: string): string | undefined {
  const match = content.match(NAME_TAG);
  return match ? decodeXmlEntities(match[1]!.trim()) : undefined;
}

interface RawElement {
  /** Raw attribute text between the tag name and the closing `>`/`/>`. */
  attrs: string;
  /** Inner content between opening and closing tags; undefined if self-closing. */
  inner: string | undefined;
}

const WORD_CHAR = /[A-Za-z0-9_]/;

/**
 * Scans `content` for top-level `<tagName ...>...</tagName>` (or
 * self-closing `<tagName .../>`) elements using plain forward `indexOf`
 * search rather than a `[\s\S]*?`-style regex.
 *
 * A lazy-wildcard regex re-scans the remaining input from every candidate
 * tag-open position, which is quadratic when a closing tag (or even a bare
 * `>`) never appears — e.g. `"<trk>".repeat(200_000)` previously took
 * multiple seconds. `indexOf` calls here always start from a
 * monotonically-advancing cursor, so total work stays linear in
 * `content.length` regardless of malformed input.
 */
function* scanElements(content: string, tagName: string): Generator<RawElement> {
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let pos = 0;

  while (pos < content.length) {
    const start = content.indexOf(openTag, pos);
    if (start === -1) return;

    const afterName = start + openTag.length;
    const boundaryChar = content[afterName];
    if (boundaryChar !== undefined && WORD_CHAR.test(boundaryChar)) {
      // e.g. found "<trk" inside "<trkpt" while scanning for "trk" — not a real match.
      pos = start + 1;
      continue;
    }

    const tagEnd = content.indexOf(">", afterName);
    if (tagEnd === -1) return; // no `>` anywhere from here on — nothing further can close either.

    const selfClosing = content[tagEnd - 1] === "/";
    const attrs = content.slice(afterName, selfClosing ? tagEnd - 1 : tagEnd);

    if (selfClosing) {
      yield { attrs, inner: undefined };
      pos = tagEnd + 1;
      continue;
    }

    const closeStart = content.indexOf(closeTag, tagEnd + 1);
    if (closeStart === -1) return; // no closing tag anywhere from here on either.

    yield { attrs, inner: content.slice(tagEnd + 1, closeStart) };
    pos = closeStart + closeTag.length;
  }
}

/** Matches every top-level `<tagName ...>...</tagName>` (or self-closing) element within `content`. */
function matchAllElements(content: string, tagName: string): RawElement[] {
  return Array.from(scanElements(content, tagName));
}

function matchFirstElement(content: string, tagName: string): RawElement | null {
  for (const el of scanElements(content, tagName)) return el;
  return null;
}

function parseLonLat(attrs: string, tagLabel: string): { lon: number; lat: number } {
  const latStr = extractAttr(attrs, "lat");
  const lonStr = extractAttr(attrs, "lon");
  if (latStr === null || lonStr === null) {
    throw new Error(`<${tagLabel}> element is missing a lat or lon attribute`);
  }
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`<${tagLabel}> has a non-numeric lat or lon attribute`);
  }
  return { lon, lat };
}

export interface GpxPoint {
  lon: number;
  lat: number;
  elevation?: number;
}

export interface GpxTrack {
  name?: string;
  /** Line color from an embedded GPX Style extension (`gpx_style:color`), normalized to `#RRGGBB`. */
  color?: string;
  points: GpxPoint[];
}

export interface GpxWaypoint {
  lon: number;
  lat: number;
  name?: string;
}

export interface GpxDocument {
  /** The file-level name, from `<metadata><name>` — distinct from each track's own name. */
  name?: string;
  tracks: GpxTrack[];
  waypoints: GpxWaypoint[];
}

function parsePoint(el: RawElement, tagLabel: string): GpxPoint {
  const { lon, lat } = parseLonLat(el.attrs, tagLabel);
  let elevation: number | undefined;
  if (el.inner) {
    const eleMatch = el.inner.match(/<ele>([\s\S]*?)<\/ele>/);
    if (eleMatch) {
      const ele = Number(eleMatch[1]!.trim());
      if (Number.isFinite(ele)) elevation = ele;
    }
  }
  return { lon, lat, elevation };
}

/** Extracts a `gpx_style:color`-style extension color (namespace-prefix-agnostic), normalized to `#RRGGBB`. */
function extractTrackColor(blockContent: string): string | undefined {
  const extensionsMatch = blockContent.match(/<extensions>([\s\S]*?)<\/extensions>/);
  if (!extensionsMatch) return undefined;

  const colorMatch = extensionsMatch[1]!.match(
    /<(?:\w+:)?color>\s*#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*<\/(?:\w+:)?color>/,
  );
  if (!colorMatch) return undefined;

  let hex = colorMatch[1]!;
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

/**
 * Parses a GPX document into its tracks, waypoints, and names — a targeted
 * extraction, not a general XML parser (matching this project's other GPX
 * handling): only the elements a route preview needs.
 *
 * Prefers `<trk>` (recorded tracks); if a file has none at all, falls back
 * to `<rte>` (a planned route with no recording) so route-planning exports
 * still render. Each track/route keeps its own name, embedded
 * `gpx_style:color` if present, and per-point elevation from `<ele>`.
 */
export function parseGpxDocument(gpx: string): GpxDocument {
  const metadata = matchFirstElement(gpx, "metadata");
  const documentName = metadata?.inner ? extractNameFrom(metadata.inner) : undefined;

  const trkBlocks = matchAllElements(gpx, "trk");
  const usingRoutes = trkBlocks.length === 0;
  const blocks = usingRoutes ? matchAllElements(gpx, "rte") : trkBlocks;
  const pointTag = usingRoutes ? "rtept" : "trkpt";

  const tracks: GpxTrack[] = blocks.map((block) => {
    const content = block.inner ?? "";
    return {
      name: extractNameFrom(content),
      color: extractTrackColor(content),
      points: matchAllElements(content, pointTag).map((el) => parsePoint(el, pointTag)),
    };
  });

  const waypoints: GpxWaypoint[] = matchAllElements(gpx, "wpt").map((el) => {
    const { lon, lat } = parseLonLat(el.attrs, "wpt");
    return { lon, lat, name: el.inner ? extractNameFrom(el.inner) : undefined };
  });

  return { name: documentName, tracks, waypoints };
}

/**
 * Extracts [lon, lat] pairs from every track point in a GPX document, in
 * order, flattening across multiple tracks/segments.
 */
export function parseGpxTrackPoints(gpx: string): [number, number][] {
  const document = parseGpxDocument(gpx);
  const points: [number, number][] = document.tracks.flatMap((track) =>
    track.points.map((p): [number, number] => [p.lon, p.lat]),
  );

  if (points.length === 0) {
    throw new Error("no <trkpt> or <rtept> elements found in GPX data");
  }

  return points;
}

/**
 * The track's or file's name, if any: the first track's own name, falling
 * back to the file-level `<metadata><name>`. Used to auto-fill `title` in
 * `renderGpx`.
 */
export function extractGpxName(gpx: string): string | undefined {
  const document = parseGpxDocument(gpx);
  return document.tracks[0]?.name ?? document.name;
}

export type RenderGpxOptions = Omit<RenderRouteOptions, "coordinates"> & {
  /**
   * Stamp distance (and, when at least half the points carry elevation,
   * smoothed elevation gain/loss) as a badge in the top-right corner.
   * GPX-only — `renderRoute` has no elevation data to compute this from.
   */
  stats?: boolean | BadgeStyle;
  /**
   * Draw a mini elevation-profile chart along the bottom of the image (a
   * translucent strip, map still visible underneath). Needs `<ele>` data;
   * silently omitted if a track has fewer than 2 points with elevation.
   */
  elevationProfile?: boolean | ElevationProfileStyle;
};

function simplifyTrack(track: GpxTrack, toleranceMeters: number): GpxTrack {
  const tuples = track.points.map((p): [number, number, number | undefined] => [
    p.lon,
    p.lat,
    p.elevation,
  ]);
  const simplified = simplifyCoordinates(tuples, toleranceMeters);
  return { ...track, points: simplified.map(([lon, lat, elevation]) => ({ lon, lat, elevation })) };
}

/**
 * Renders every track in a GPX file (each its own polyline: an explicit
 * `line.color` applies to all of them uniformly, otherwise each keeps its
 * own embedded `gpx_style:color` or falls back to a cycled default),
 * plus a small dot for each `<wpt>` waypoint. Falls back to `<rte>` when
 * there's no recorded `<trk>` at all (see `parseGpxDocument`).
 */
export async function renderGpx(
  gpxContents: string,
  options: RenderGpxOptions,
): Promise<Uint8Array> {
  const document = parseGpxDocument(gpxContents);
  if (document.tracks.every((t) => t.points.length === 0)) {
    throw new Error("no <trkpt> or <rtept> elements found in GPX data");
  }

  const tracks =
    options.simplify && options.simplify > 0
      ? document.tracks.map((t) => simplifyTrack(t, options.simplify!))
      : document.tracks;

  const title = options.title !== undefined ? options.title : (tracks[0]?.name ?? document.name);

  const statsText = options.stats ? formatStatistics(computeStatistics(tracks)) : undefined;
  const statsStyle = typeof options.stats === "object" ? options.stats : undefined;

  const elevationProfilePoints = options.elevationProfile
    ? buildElevationProfile(tracks)
    : undefined;
  const elevationProfileStyle =
    typeof options.elevationProfile === "object" ? options.elevationProfile : undefined;

  const renderTracks: RenderTrack[] = tracks.map((track) => ({
    points: track.points.map((p): [number, number] => [p.lon, p.lat]),
    color: track.color,
  }));
  const waypoints: [number, number][] = document.waypoints.map((w) => [w.lon, w.lat]);

  return renderPipeline(renderTracks, waypoints, {
    ...options,
    title,
    statsText,
    statsStyle,
    elevationProfilePoints,
    elevationProfileStyle,
  });
}
