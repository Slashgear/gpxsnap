export const TILE_SIZE = 256;

export interface LonLat {
  lon: number;
  lat: number;
}

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function boundsOf(coordinates: readonly (readonly [number, number])[]): Bounds {
  if (coordinates.length === 0)
    throw new Error("cannot compute bounds of an empty coordinate list");
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/** Global pixel X at the given zoom, in standard Web Mercator slippy-map space (0 at lon -180). */
export function lonToPixelX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

/** Global pixel Y at the given zoom, in standard Web Mercator slippy-map space (0 at lat +85.0511...). */
export function latToPixelY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * TILE_SIZE * 2 ** zoom
  );
}

export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  return {
    x: Math.floor(lonToPixelX(lon, zoom) / TILE_SIZE),
    y: Math.floor(latToPixelY(lat, zoom) / TILE_SIZE),
  };
}

export interface FitBoundsOptions {
  width: number;
  height: number;
  padding: number;
  minZoom?: number;
  maxZoom?: number;
}

/** Picks the highest zoom at which `bounds`, plus padding, still fits inside width x height — Leaflet's fitBounds math. */
export function fitZoom(bounds: Bounds, options: FitBoundsOptions): number {
  const minZoom = options.minZoom ?? 0;
  const maxZoom = options.maxZoom ?? 19;
  const availableWidth = Math.max(1, options.width - 2 * options.padding);
  const availableHeight = Math.max(1, options.height - 2 * options.padding);

  for (let zoom = maxZoom; zoom > minZoom; zoom--) {
    const pixelWidth = lonToPixelX(bounds.maxLon, zoom) - lonToPixelX(bounds.minLon, zoom);
    const pixelHeight = latToPixelY(bounds.minLat, zoom) - latToPixelY(bounds.maxLat, zoom);
    if (pixelWidth <= availableWidth && pixelHeight <= availableHeight) return zoom;
  }
  return minZoom;
}

/** The pixel origin (top-left of the canvas) in global slippy-map pixel space, for a bbox centered viewport. */
export function canvasOrigin(
  bounds: Bounds,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const centerX = (lonToPixelX(bounds.minLon, zoom) + lonToPixelX(bounds.maxLon, zoom)) / 2;
  const centerY = (latToPixelY(bounds.minLat, zoom) + latToPixelY(bounds.maxLat, zoom)) / 2;
  return { x: centerX - width / 2, y: centerY - height / 2 };
}

export function projectToCanvas(
  lon: number,
  lat: number,
  zoom: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  return { x: lonToPixelX(lon, zoom) - origin.x, y: latToPixelY(lat, zoom) - origin.y };
}

export interface TileRequest {
  x: number;
  y: number;
  z: number;
}

/** Wraps tile X into [0, 2^zoom) — the tile grid repeats around the antimeridian even though routes crossing it are out of scope. */
function wrapTileX(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

/** Every tile that overlaps a canvas of `width`x`height` placed at global pixel `origin`. */
export function tilesForViewport(
  origin: { x: number; y: number },
  zoom: number,
  width: number,
  height: number,
): TileRequest[] {
  const minTileX = Math.floor(origin.x / TILE_SIZE);
  const maxTileX = Math.floor((origin.x + width - 1) / TILE_SIZE);
  const minTileY = Math.floor(origin.y / TILE_SIZE);
  const maxTileY = Math.floor((origin.y + height - 1) / TILE_SIZE);
  const maxTileIndex = 2 ** zoom - 1;

  const tiles: TileRequest[] = [];
  for (let ty = Math.max(0, minTileY); ty <= Math.min(maxTileIndex, maxTileY); ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      tiles.push({ x: wrapTileX(tx, zoom), y: ty, z: zoom });
    }
  }
  return tiles;
}

export function tileUrl(template: string, tile: TileRequest): string {
  return template
    .replace("{z}", String(tile.z))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y));
}

/** Limits how many fetches run concurrently, without pulling in a queue library. */
export class Semaphore {
  private available: number;
  private readonly queue: (() => void)[] = [];

  constructor(concurrency: number) {
    this.available = concurrency;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.available <= 0) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.available--;
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.available++;
    }
  }
}

/** A minimal fetch-shaped function — deliberately narrower than `typeof fetch` so plain mocks satisfy it in tests without matching Bun/DOM's full fetch signature. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<Response>;

export interface FetchTileOptions {
  tileUrlTemplate: string;
  concurrency?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
}

export async function fetchTiles(
  tiles: TileRequest[],
  options: FetchTileOptions,
): Promise<Map<string, Uint8Array>> {
  const semaphore = new Semaphore(options.concurrency ?? 8);
  const doFetch = options.fetchImpl ?? fetch;
  const results = new Map<string, Uint8Array>();

  await Promise.all(
    tiles.map((tile) =>
      semaphore.run(async () => {
        const url = tileUrl(options.tileUrlTemplate, tile);
        const headers: Record<string, string> = {};
        if (options.userAgent) headers["User-Agent"] = options.userAgent;
        const response = await doFetch(url, { headers });
        if (!response.ok) {
          throw new Error(
            `failed to fetch tile ${tile.z}/${tile.x}/${tile.y}: ${response.status} ${response.statusText}`,
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        results.set(`${tile.z}/${tile.x}/${tile.y}`, bytes);
      }),
    ),
  );

  return results;
}
