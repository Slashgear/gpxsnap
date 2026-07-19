import { expect, test } from "bun:test";
import { Canvas } from "../src/canvas.ts";
import { buildElevationProfile, drawElevationProfile } from "../src/elevation-chart.ts";
import type { GpxPoint } from "../src/gpx.ts";

function point(lat: number, lon: number, elevation?: number): GpxPoint {
  return { lat, lon, elevation };
}

function pixelAt(canvas: Canvas, x: number, y: number): [number, number, number, number] {
  const i = (y * canvas.width + x) * 4;
  return [canvas.pixels[i]!, canvas.pixels[i + 1]!, canvas.pixels[i + 2]!, canvas.pixels[i + 3]!];
}

test("buildElevationProfile skips points without elevation and accumulates distance within a track", () => {
  const tracks = [{ points: [point(48.85, 2.3, 100), point(48.86, 2.3), point(48.87, 2.3, 120)] }];
  const profile = buildElevationProfile(tracks);

  expect(profile).toHaveLength(2);
  expect(profile[0]).toEqual({ distance: 0, elevation: 100 });
  // distance accumulates across both hops even though the middle point has no elevation
  expect(profile[1]!.elevation).toBe(120);
  expect(profile[1]!.distance).toBeGreaterThan(0);
});

test("buildElevationProfile does not add a phantom gap between disconnected tracks", () => {
  const trackA = { points: [point(48.85, 2.3, 100), point(48.86, 2.3, 110)] };
  const trackB = { points: [point(10, 10, 200), point(10.01, 10, 210)] };

  const profile = buildElevationProfile([trackA, trackB]);
  expect(profile).toHaveLength(4);

  // the jump from track A's last point to track B's first point must not add distance
  const distanceWithinA = profile[1]!.distance - profile[0]!.distance;
  const distanceAtTrackBStart = profile[2]!.distance;
  expect(distanceAtTrackBStart).toBeCloseTo(distanceWithinA, 6);
});

test("drawElevationProfile does nothing with fewer than 2 points", () => {
  const canvas = new Canvas(50, 50);
  const before = Array.from(canvas.pixels);
  drawElevationProfile(canvas, [{ distance: 0, elevation: 100 }]);
  expect(Array.from(canvas.pixels)).toEqual(before);
});

test("drawElevationProfile paints an opaque background strip along the bottom", () => {
  const canvas = new Canvas(100, 100);
  drawElevationProfile(
    canvas,
    [
      { distance: 0, elevation: 0 },
      { distance: 50, elevation: 100 },
      { distance: 100, elevation: 0 },
    ],
    { height: 40, backgroundColor: "#0000ff", backgroundOpacity: 1 },
  );

  // Corner of the strip, away from the profile line/fill.
  expect(pixelAt(canvas, 2, 61)).toEqual([0, 0, 255, 255]);
  // Just above the strip must stay untouched.
  expect(pixelAt(canvas, 2, 50)).toEqual([0, 0, 0, 0]);
});

test("drawElevationProfile keeps the plotted line out of a reservedRightMargin", () => {
  const profile = [
    { distance: 0, elevation: 0 },
    { distance: 100, elevation: 100 },
  ];

  function hasLineAt(canvas: Canvas, x: number, stripHeight: number): boolean {
    for (let y = canvas.height - stripHeight; y < canvas.height; y++) {
      const [r, g, , a] = pixelAt(canvas, x, y);
      if (a > 0 && r > 100 && g < 100) return true;
    }
    return false;
  }

  const noMargin = new Canvas(200, 100);
  drawElevationProfile(noMargin, profile, {
    height: 40,
    lineColor: "#ff0000",
    backgroundOpacity: 0,
  });
  const withMargin = new Canvas(200, 100);
  drawElevationProfile(withMargin, profile, {
    height: 40,
    lineColor: "#ff0000",
    backgroundOpacity: 0,
    reservedRightMargin: 50,
  });

  // Near the right edge, well inside the reserved zone: the unreserved chart
  // draws its line there (it spans the full width), the reserved one doesn't.
  expect(hasLineAt(noMargin, 190, 40)).toBe(true);
  expect(hasLineAt(withMargin, 190, 40)).toBe(false);
});

test("renderGpx keeps the elevation profile line clear of the attribution badge's corner", async () => {
  const { renderGpx } = await import("../src/gpx.ts");
  const gpx = await Bun.file("test/fixtures/sample.gpx").text();
  async function mockFetch(): Promise<Response> {
    const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
    return new Response(bytes, { status: 200 });
  }

  const withAttribution = await renderGpx(gpx, {
    width: 300,
    height: 200,
    elevationProfile: true,
    fetchImpl: mockFetch,
  });
  const withoutAttribution = await renderGpx(gpx, {
    width: 300,
    height: 200,
    elevationProfile: true,
    attribution: false,
    fetchImpl: mockFetch,
  });

  // Without attribution to reserve room for, the profile's margin — and thus
  // its output — differs from the attributed render.
  expect(Array.from(withAttribution)).not.toEqual(Array.from(withoutAttribution));
});

test("renderGpx draws an elevation profile only when elevationProfile is truthy", async () => {
  const { renderGpx } = await import("../src/gpx.ts");
  const gpx = await Bun.file("test/fixtures/sample.gpx").text();
  async function mockFetch(): Promise<Response> {
    const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
    return new Response(bytes, { status: 200 });
  }

  const withProfile = await renderGpx(gpx, {
    width: 300,
    height: 200,
    elevationProfile: true,
    fetchImpl: mockFetch,
  });
  const withoutProfile = await renderGpx(gpx, { width: 300, height: 200, fetchImpl: mockFetch });

  expect(Array.from(withProfile)).not.toEqual(Array.from(withoutProfile));
});
