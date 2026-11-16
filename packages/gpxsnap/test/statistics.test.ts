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

function timed(lat: number, lon: number, time: string, elevation?: number): GpxPoint {
  return { lat, lon, elevation, time };
}

// 0.01 deg of latitude at the equator: ~1111.95 m.
const STEP_METERS = 1111.95;

test("computeStatistics reports raw min/max elevation and mean absolute grade", () => {
  const tracks = [
    {
      points: [100, 110, 130, 150, 140, 120, 100].map((ele, i) => point(i * 0.01, 0, ele)),
    },
    { points: [point(1, 1, 80), point(1.01, 1, 90)] },
  ];
  const stats = computeStatistics(tracks);

  expect(stats.minElevationMeters).toBe(80);
  expect(stats.maxElevationMeters).toBe(150);
  const expectedGrade =
    ((stats.elevationGainMeters! + stats.elevationLossMeters!) / stats.distanceMeters) * 100;
  expect(stats.averageGradePercent).toBeCloseTo(expectedGrade, 9);
  expect(stats.averageGradePercent!).toBeGreaterThan(0);
});

test("computeStatistics leaves time fields undefined without <time> data", () => {
  const stats = computeStatistics([{ points: [point(0, 0), point(0.01, 0)] }]);
  expect(stats.durationSeconds).toBeUndefined();
  expect(stats.movingTimeSeconds).toBeUndefined();
  expect(stats.averageSpeedMetersPerSecond).toBeUndefined();
});

test("computeStatistics excludes a stop from moving time but not from duration", () => {
  const tracks = [
    {
      points: [
        timed(0, 0, "2026-01-01T10:00:00Z"),
        timed(0.01, 0, "2026-01-01T10:05:00Z"), // ~1112 m in 300 s: moving
        timed(0.01, 0, "2026-01-01T10:15:00Z"), // stationary 600 s: stop
        timed(0.02, 0, "2026-01-01T10:20:00Z"), // ~1112 m in 300 s: moving
      ],
    },
  ];
  const stats = computeStatistics(tracks);

  expect(stats.durationSeconds).toBe(1200);
  expect(stats.movingTimeSeconds).toBe(600);
  expect(stats.averageSpeedMetersPerSecond).toBeCloseTo((2 * STEP_METERS) / 600, 1);
});

test("computeStatistics sums duration per track, ignoring the gap between tracks", () => {
  const trackA = {
    points: [timed(0, 0, "2026-01-01T10:00:00Z"), timed(0.01, 0, "2026-01-01T10:10:00Z")],
  };
  const trackB = {
    points: [timed(0, 1, "2026-01-01T14:00:00Z"), timed(0.01, 1, "2026-01-01T14:05:00Z")],
  };
  expect(computeStatistics([trackA, trackB]).durationSeconds).toBe(900);
});

test("computeStatistics skips missing and non-increasing timestamps", () => {
  const tracks = [
    {
      points: [
        timed(0, 0, "2026-01-01T10:00:00Z"),
        point(0.005, 0), // no time: skipped
        timed(0.01, 0, "2026-01-01T10:05:00Z"),
        timed(0.02, 0, "2026-01-01T10:04:00Z"), // goes backwards: ignored
      ],
    },
  ];
  const stats = computeStatistics(tracks);
  expect(stats.durationSeconds).toBe(300);
  expect(stats.movingTimeSeconds).toBe(300);
});

test("formatStatistics renders the requested fields in order", () => {
  const stats = {
    distanceMeters: 42300,
    elevationGainMeters: 512.4,
    elevationLossMeters: 498.6,
    minElevationMeters: 210.2,
    maxElevationMeters: 845.7,
    averageGradePercent: 2.389,
    durationSeconds: 3 * 3600 + 7 * 60 + 20,
    movingTimeSeconds: 2 * 3600 + 41 * 60,
    averageSpeedMetersPerSecond: 1000 / 312, // 5:12 /km
  };
  expect(
    formatStatistics(stats, [
      "distance",
      "elevationRange",
      "grade",
      "duration",
      "movingTime",
      "speed",
      "pace",
    ]),
  ).toBe("42.3 km  min 210 m  max 846 m  avg 2.4%  3h07  moving 2h41  11.5 km/h  5:12 /km");
});

test("formatStatistics shows sub-hour durations in minutes and drops unavailable fields", () => {
  expect(
    formatStatistics({ distanceMeters: 5000, durationSeconds: 42 * 60 }, [
      "distance",
      "elevation",
      "duration",
      "speed",
    ]),
  ).toBe("5.0 km  42min");
});
