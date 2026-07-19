import { expect, test } from "bun:test";
import {
  boundsOf,
  canvasOrigin,
  fitZoom,
  lonLatToTile,
  projectToCanvas,
  TILE_SIZE,
  tilesForViewport,
} from "../src/tiles.ts";

// Paris (Notre-Dame), the reference anchor point used throughout the project's fixtures.
const PARIS: [number, number] = [2.3522, 48.8566];

test("lonLatToTile matches hand-verified slippy-map coordinates for Paris", () => {
  expect(lonLatToTile(PARIS[0], PARIS[1], 13)).toEqual({ x: 4149, y: 2818 });
  expect(lonLatToTile(PARIS[0], PARIS[1], 5)).toEqual({ x: 16, y: 11 });
  expect(lonLatToTile(PARIS[0], PARIS[1], 0)).toEqual({ x: 0, y: 0 });
});

test("boundsOf computes the bbox of a coordinate list", () => {
  const bounds = boundsOf([
    [2.3522, 48.8566],
    [2.295, 48.8738],
    [2.2986, 48.8867],
  ]);
  expect(bounds).toEqual({ minLon: 2.295, minLat: 48.8566, maxLon: 2.3522, maxLat: 48.8867 });
});

test("boundsOf rejects an empty coordinate list", () => {
  expect(() => boundsOf([])).toThrow();
});

test("fitZoom picks a lower zoom as the bbox grows", () => {
  const small = { minLon: 2.35, minLat: 48.85, maxLon: 2.36, maxLat: 48.86 };
  const large = { minLon: -5, minLat: 40, maxLon: 10, maxLat: 52 }; // roughly all of France
  const options = { width: 1200, height: 600, padding: 40 };

  const zoomSmall = fitZoom(small, options);
  const zoomLarge = fitZoom(large, options);
  expect(zoomSmall).toBeGreaterThan(zoomLarge);
});

test("fitZoom result actually fits the available canvas area", () => {
  const bounds = { minLon: 2.29, minLat: 48.85, maxLon: 2.36, maxLat: 48.89 };
  const width = 1200;
  const height = 600;
  const padding = 40;
  const zoom = fitZoom(bounds, { width, height, padding });

  const origin = canvasOrigin(bounds, zoom, width, height);
  const topLeft = projectToCanvas(bounds.minLon, bounds.maxLat, zoom, origin);
  const bottomRight = projectToCanvas(bounds.maxLon, bounds.minLat, zoom, origin);

  expect(topLeft.x).toBeGreaterThanOrEqual(-1); // allow sub-pixel rounding slack
  expect(topLeft.y).toBeGreaterThanOrEqual(-1);
  expect(bottomRight.x).toBeLessThanOrEqual(width + 1);
  expect(bottomRight.y).toBeLessThanOrEqual(height + 1);
});

test("tilesForViewport returns exactly the tiles overlapping the canvas", () => {
  // A 256x256 canvas exactly aligned to one tile boundary should need exactly one tile.
  const origin = { x: 4149 * TILE_SIZE, y: 2818 * TILE_SIZE };
  const tiles = tilesForViewport(origin, 13, TILE_SIZE, TILE_SIZE);
  expect(tiles).toEqual([{ x: 4149, y: 2818, z: 13 }]);
});

test("tilesForViewport covers a 2x2 grid when straddling tile boundaries", () => {
  const origin = { x: 4149 * TILE_SIZE + 200, y: 2818 * TILE_SIZE + 200 };
  const tiles = tilesForViewport(origin, 13, TILE_SIZE, TILE_SIZE);
  const keys = tiles.map((t) => `${t.x},${t.y}`).sort();
  expect(keys).toEqual(["4149,2818", "4149,2819", "4150,2818", "4150,2819"]);
});

test("tilesForViewport wraps tile X around the antimeridian", () => {
  const zoom = 3; // 8 tiles wide
  const origin = { x: -TILE_SIZE / 2, y: 0 };
  const tiles = tilesForViewport(origin, zoom, TILE_SIZE, TILE_SIZE);
  const xs = tiles.map((t) => t.x).sort((a, b) => a - b);
  expect(xs).toEqual([0, 7]);
});

test("bbox edge case: a single-point bbox (zero area) fits at the deepest zoom, not a crash", () => {
  const point = boundsOf([[2.3522, 48.8566]]);
  expect(point).toEqual({ minLon: 2.3522, minLat: 48.8566, maxLon: 2.3522, maxLat: 48.8566 });

  const zoom = fitZoom(point, { width: 800, height: 600, padding: 40 });
  expect(zoom).toBe(19); // default maxZoom — a zero-size bbox always "fits"

  // The pipeline downstream of fitZoom must still produce a sane, finite tile grid.
  const origin = canvasOrigin(point, zoom, 800, 600);
  expect(Number.isFinite(origin.x)).toBe(true);
  expect(Number.isFinite(origin.y)).toBe(true);
  const tiles = tilesForViewport(origin, zoom, 800, 600);
  expect(tiles.length).toBeGreaterThan(0);
});

test("bbox edge case: duplicate consecutive coordinates collapse to a zero-size bbox without throwing", () => {
  const bounds = boundsOf([
    [2.3522, 48.8566],
    [2.3522, 48.8566],
    [2.3522, 48.8566],
  ]);
  expect(bounds).toEqual({ minLon: 2.3522, minLat: 48.8566, maxLon: 2.3522, maxLat: 48.8566 });
  expect(() => fitZoom(bounds, { width: 400, height: 300, padding: 20 })).not.toThrow();
});

test("bbox edge case: padding larger than the canvas clamps instead of going negative", () => {
  const bounds = { minLon: 2.29, minLat: 48.85, maxLon: 2.36, maxLat: 48.89 };
  const zoom = fitZoom(bounds, { width: 100, height: 100, padding: 1000 });
  expect(zoom).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(zoom)).toBe(true);
});

test("bbox edge case: fitZoom clamps to minZoom for a bbox spanning the whole world", () => {
  const bounds = { minLon: -180, minLat: -85, maxLon: 180, maxLat: 85 };
  const zoom = fitZoom(bounds, { width: 400, height: 300, padding: 20 });
  expect(zoom).toBe(0);
});
