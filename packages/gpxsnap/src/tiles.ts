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

/** `@2x`/`@3x`-style suffix for the `{r}` template token, matching Leaflet's retina URL convention. Empty below pixelRatio 2 (tile providers only publish integer retina variants). */
function retinaSuffix(pixelRatio: number): string {
  const rounded = Math.round(pixelRatio);
  return rounded >= 2 ? `@${rounded}x` : "";
}

export function tileUrl(template: string, tile: TileRequest, pixelRatio = 1): string {
  return template
    .replace("{z}", String(tile.z))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y))
    .replace("{r}", retinaSuffix(pixelRatio));
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
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

/**
 * A pluggable store for fetched tile bytes, keyed by the final tile URL.
 * Both methods may be sync or async, so anything from a `Map` to a disk or
 * Redis cache fits. OSM's tile usage policy asks clients to cache tiles
 * rather than re-download them on every render.
 */
export interface TileCache {
  get(url: string): Uint8Array | undefined | Promise<Uint8Array | undefined>;
  set(url: string, bytes: Uint8Array): void | Promise<void>;
}

/** A simple in-memory LRU `TileCache`, bounded to `maxEntries` tiles (default 512). */
export function createMemoryTileCache(maxEntries = 512): TileCache {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("maxEntries must be a positive integer");
  }
  const entries = new Map<string, Uint8Array>();
  return {
    get(url) {
      const bytes = entries.get(url);
      if (bytes) {
        // Re-insert to mark as most recently used.
        entries.delete(url);
        entries.set(url, bytes);
      }
      return bytes;
    },
    set(url, bytes) {
      entries.delete(url);
      entries.set(url, bytes);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export interface FetchTileOptions {
  tileUrlTemplate: string;
  /** Substituted into the template's `{r}` token as `@2x`/`@3x` (empty at 1). Has no effect on a template without `{r}`. */
  pixelRatio?: number;
  concurrency?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
  /** Per-attempt timeout in milliseconds. Defaults to 10 000. */
  timeoutMs?: number;
  /** Extra attempts after a network error, timeout, 429 or 5xx (never after another 4xx). Defaults to 2. */
  retries?: number;
  /** Base delay before a retry, doubled on each further attempt. Defaults to 250. */
  retryDelayMs?: number;
  /** `"throw"` (default) fails the whole call on the first tile that can't be fetched; `"skip"` leaves it out of the result. */
  onTileError?: "throw" | "skip";
  tileCache?: TileCache;
}

export const DEFAULT_TILE_TIMEOUT_MS = 10_000;
export const DEFAULT_TILE_RETRIES = 2;
export const DEFAULT_TILE_RETRY_DELAY_MS = 250;

/** An HTTP failure that retrying won't fix (a 4xx other than 429). */
class PermanentTileError extends Error {}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function fetchOnce(
  doFetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  label: string,
): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await Promise.race([
      doFetch(url, { headers, signal: controller.signal }),
      // A fetchImpl that ignores `signal` must still not hang the render.
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`timed out after ${timeoutMs}ms`)),
        );
      }),
    ]);
    if (!response.ok) {
      const message = `failed to fetch tile ${label}: ${response.status} ${response.statusText}`;
      if (isRetryableStatus(response.status)) throw new Error(message);
      throw new PermanentTileError(message);
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof PermanentTileError) throw error;
    if (timedOut) throw new Error(`failed to fetch tile ${label}: timed out after ${timeoutMs}ms`);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      reason.startsWith("failed to fetch tile")
        ? reason
        : `failed to fetch tile ${label}: ${reason}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTiles(
  tiles: TileRequest[],
  options: FetchTileOptions,
): Promise<Map<string, Uint8Array>> {
  const semaphore = new Semaphore(options.concurrency ?? 8);
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TILE_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_TILE_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_TILE_RETRY_DELAY_MS;
  const onTileError = options.onTileError ?? "throw";
  const cache = options.tileCache;
  if (!(timeoutMs > 0)) throw new Error("timeoutMs must be a positive number");
  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error("retries must be a non-negative integer");
  }

  const headers: Record<string, string> = {};
  if (options.userAgent) headers["User-Agent"] = options.userAgent;
  const results = new Map<string, Uint8Array>();

  await Promise.all(
    tiles.map((tile) =>
      semaphore.run(async () => {
        const key = `${tile.z}/${tile.x}/${tile.y}`;
        const url = tileUrl(options.tileUrlTemplate, tile, options.pixelRatio);
        const cached = cache ? await cache.get(url) : undefined;
        if (cached) {
          results.set(key, cached);
          return;
        }

        let bytes: Uint8Array | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries && !bytes; attempt++) {
          if (attempt > 0) await delay(retryDelayMs * 2 ** (attempt - 1));
          try {
            bytes = await fetchOnce(doFetch, url, headers, timeoutMs, key);
          } catch (error) {
            lastError = error;
            if (error instanceof PermanentTileError) break;
          }
        }
        if (!bytes) {
          if (onTileError === "throw") throw lastError;
          return;
        }
        results.set(key, bytes);
        if (cache) await cache.set(url, bytes);
      }),
    ),
  );

  return results;
}
