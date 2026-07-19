import { renderRoute } from "./index.ts";
import type { RenderRouteOptions } from "./index.ts";

const TRKPT_TAG = /<trkpt\b[^>]*>/g;

function extractAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/**
 * Extracts [lon, lat] pairs from every <trkpt> in a GPX document, in order,
 * flattening across multiple <trkseg>/<trk> elements. This is a targeted
 * extraction, not a general XML parser: it only looks at <trkpt> opening
 * tags and their lat/lon attributes, which is all a route preview needs.
 */
export function parseGpxTrackPoints(gpx: string): [number, number][] {
  const points: [number, number][] = [];

  for (const match of gpx.matchAll(TRKPT_TAG)) {
    const tag = match[0];
    const latStr = extractAttr(tag, "lat");
    const lonStr = extractAttr(tag, "lon");
    if (latStr === null || lonStr === null) {
      throw new Error(`<trkpt> element is missing a lat or lon attribute: ${tag}`);
    }

    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`<trkpt> has a non-numeric lat or lon attribute: ${tag}`);
    }

    points.push([lon, lat]);
  }

  if (points.length === 0) {
    throw new Error("no <trkpt> elements found in GPX data");
  }

  return points;
}

export type RenderGpxOptions = Omit<RenderRouteOptions, "coordinates">;

/** Convenience wrapper: extract track points from a GPX file's contents and render them. */
export async function renderGpx(
  gpxContents: string,
  options: RenderGpxOptions,
): Promise<Uint8Array> {
  const coordinates = parseGpxTrackPoints(gpxContents);
  return renderRoute({ ...options, coordinates });
}
