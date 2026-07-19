import { expect, test } from "bun:test";
import { computeStatistics, formatStatistics } from "../src/statistics.ts";
import type { GpxPoint } from "../src/gpx.ts";

function point(lat: number, lon: number, elevation?: number): GpxPoint {
  return { lat, lon, elevation };
}

test("computeStatistics sums haversine distance within a single track", () => {
  const tracks = [{ points: [point(48.85, 2.3), point(48.86, 2.3)] }];
  const stats = computeStatistics(tracks);

  // Computed independently via the same haversine formula for 0.01 deg of
  // latitude at 48.85N: ~1111.95 m.
  expect(stats.distanceMeters).toBeCloseTo(1111.95, 1);
  expect(stats.elevationGainMeters).toBeUndefined();
  expect(stats.elevationLossMeters).toBeUndefined();
});

test("computeStatistics sums distance across tracks without adding an inter-track gap", () => {
  const trackA = { points: [point(48.85, 2.3), point(48.86, 2.3)] };
  const trackB = { points: [point(10, 10), point(10.01, 10)] };

  const combined = computeStatistics([trackA, trackB]);
  const separateSum =
    computeStatistics([trackA]).distanceMeters + computeStatistics([trackB]).distanceMeters;

  expect(combined.distanceMeters).toBeCloseTo(separateSum, 6);
});

test("computeStatistics returns undefined elevation fields when fewer than half the points have elevation", () => {
  const tracks = [
    {
      points: [
        point(0, 0, 100),
        point(0, 0.001), // no elevation
        point(0, 0.002), // no elevation
      ],
    },
  ];
  expect(computeStatistics(tracks).elevationGainMeters).toBeUndefined();
});

test("computeStatistics computes smoothed elevation gain/loss when at least half the points have elevation", () => {
  const elevations = [100, 105, 98, 110, 95, 120, 90, 130];
  const tracks = [{ points: elevations.map((ele, i) => point(48.85 + i * 0.0001, 2.3, ele)) }];

  const stats = computeStatistics(tracks);

  // Computed independently: 5-point centered moving average, then summed
  // positive/negative deltas.
  expect(stats.elevationGainMeters).toBeCloseTo(17.233, 2);
  expect(stats.elevationLossMeters).toBeCloseTo(4.9, 2);
});

test("computeStatistics treats exactly half the points having elevation as sufficient", () => {
  const tracks = [
    {
      points: [point(0, 0, 100), point(0, 0.001, 110), point(0, 0.002), point(0, 0.003)],
    },
  ];
  expect(computeStatistics(tracks).elevationGainMeters).not.toBeUndefined();
});

test("formatStatistics shows distance in km above 1000m, omitting elevation when unavailable", () => {
  expect(formatStatistics({ distanceMeters: 42300 })).toBe("42.3 km");
});

test("formatStatistics shows distance in meters below 1000m", () => {
  expect(formatStatistics({ distanceMeters: 850 })).toBe("850 m");
});

test("formatStatistics appends rounded elevation gain/loss when available", () => {
  expect(
    formatStatistics({
      distanceMeters: 12345,
      elevationGainMeters: 512.4,
      elevationLossMeters: 498.6,
    }),
  ).toBe("12.3 km  +512 m  -499 m");
});
