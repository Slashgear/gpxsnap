import { expect, test } from "bun:test";
import { simplifyCoordinates, type LonLat } from "../src/simplify.ts";

test("collapses a straight line down to its endpoints", () => {
  const line: LonLat[] = [];
  for (let i = 0; i <= 20; i++) {
    line.push([2.0 + i * 0.001, 48.0 + i * 0.0001]);
  }
  const simplified = simplifyCoordinates(line, 50);
  expect(simplified).toEqual([line[0]!, line[line.length - 1]!]);
});

test("keeps a point that clearly deviates from the line", () => {
  const line: LonLat[] = [];
  for (let i = 0; i <= 20; i++) {
    line.push([2.0 + i * 0.001, 48.0 + i * 0.0001]);
  }
  const withOutlier = line.map((p) => [...p]) as LonLat[];
  withOutlier[10] = [withOutlier[10]![0], withOutlier[10]![1] + 0.01]; // ~1.1km north deviation

  const simplified = simplifyCoordinates(withOutlier, 50);
  expect(simplified).toContainEqual(withOutlier[10]);
  expect(simplified.length).toBeGreaterThan(2);
  expect(simplified.length).toBeLessThan(withOutlier.length);
});

test("tolerance <= 0 returns the input unchanged", () => {
  const line: LonLat[] = [
    [2.0, 48.0],
    [2.1, 48.05],
    [2.2, 48.1],
  ];
  expect(simplifyCoordinates(line, 0)).toEqual(line);
  expect(simplifyCoordinates(line, -5)).toEqual(line);
});

test("fewer than 3 points is returned unchanged regardless of tolerance", () => {
  expect(simplifyCoordinates([], 50)).toEqual([]);
  expect(simplifyCoordinates([[1, 1]], 50)).toEqual([[1, 1]]);
  expect(
    simplifyCoordinates(
      [
        [1, 1],
        [2, 2],
      ],
      50,
    ),
  ).toEqual([
    [1, 1],
    [2, 2],
  ]);
});

test("always keeps the first and last point", () => {
  const line: LonLat[] = [];
  for (let i = 0; i <= 50; i++) {
    line.push([2.0 + i * 0.0001, 48.0 + i * 0.00001]);
  }
  const simplified = simplifyCoordinates(line, 1000);
  expect(simplified[0]).toEqual(line[0]!);
  expect(simplified[simplified.length - 1]).toEqual(line[line.length - 1]!);
});

test("a huge tolerance collapses any route to just its endpoints", () => {
  const zigzag: LonLat[] = [
    [2.0, 48.0],
    [2.01, 48.02],
    [2.0, 48.04],
    [2.01, 48.06],
    [2.0, 48.08],
  ];
  expect(simplifyCoordinates(zigzag, 1_000_000)).toEqual([zigzag[0]!, zigzag[zigzag.length - 1]!]);
});

test("real fixture: meaningfully reduces a dense recorded track without dropping its endpoints", async () => {
  const { parseGpxTrackPoints } = await import("../src/gpx.ts");
  const gpx = await Bun.file("test/fixtures/sample-ride.gpx").text();
  const original = parseGpxTrackPoints(gpx);

  const simplified = simplifyCoordinates(original, 10); // 10m tolerance

  expect(simplified.length).toBeLessThan(original.length);
  expect(simplified.length).toBeGreaterThan(10); // still a recognizable route, not over-simplified
  expect(simplified[0]).toEqual(original[0]!);
  expect(simplified[simplified.length - 1]).toEqual(original[original.length - 1]!);
});
