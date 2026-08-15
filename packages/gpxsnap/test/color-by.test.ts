import { expect, test } from "bun:test";
import { normalizeElevations, normalizeSpeeds } from "../src/color-by.ts";

test("normalizeElevations maps min to 0 and max to 1", () => {
  const result = normalizeElevations([100, 200, 300]);
  expect(result).toEqual([0, 0.5, 1]);
});

test("normalizeElevations fills gaps from the nearest defined neighbor", () => {
  const result = normalizeElevations([100, undefined, undefined, 300]);
  expect(result).toEqual([0, 0, 0, 1]); // forward-filled from 100 until the next defined value
});

test("normalizeElevations backward-fills a leading gap", () => {
  const result = normalizeElevations([undefined, 100, 300]);
  expect(result).toEqual([0, 0, 1]);
});

test("normalizeElevations returns undefined with fewer than 2 defined points", () => {
  expect(normalizeElevations([100, undefined, undefined])).toBeUndefined();
  expect(normalizeElevations([])).toBeUndefined();
});

test("normalizeElevations maps a flat series entirely to 0, not NaN", () => {
  expect(normalizeElevations([50, 50, 50])).toEqual([0, 0, 0]);
});

test("normalizeSpeeds is faster over a longer distance in the same time", () => {
  const points: [number, number][] = [
    [0, 0],
    [0.001, 0], // short hop
    [0.01, 0], // long hop, same time delta
  ];
  const times = ["2024-01-01T00:00:00Z", "2024-01-01T00:00:10Z", "2024-01-01T00:00:20Z"];

  const result = normalizeSpeeds(points, times)!;
  expect(result).toBeDefined();
  expect(result[2]!).toBeGreaterThan(result[1]!); // the long hop is faster
});

test("normalizeSpeeds copies the second point's speed onto the first", () => {
  const points: [number, number][] = [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
  ];
  const times = ["2024-01-01T00:00:00Z", "2024-01-01T00:00:10Z", "2024-01-01T00:00:20Z"];

  const result = normalizeSpeeds(points, times)!;
  expect(result[0]).toBe(result[1]);
});

test("normalizeSpeeds returns undefined when times are missing entirely", () => {
  const points: [number, number][] = [
    [0, 0],
    [0.01, 0],
  ];
  expect(normalizeSpeeds(points, [undefined, undefined])).toBeUndefined();
});

test("normalizeSpeeds returns undefined for fewer than 2 points", () => {
  expect(normalizeSpeeds([[0, 0]], ["2024-01-01T00:00:00Z"])).toBeUndefined();
});

test("normalizeSpeeds ignores a non-positive time delta (e.g. out-of-order timestamps) rather than producing a negative speed", () => {
  const points: [number, number][] = [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
    [0.03, 0],
  ];
  // The 2nd timestamp goes backwards relative to the 1st — that one segment's
  // delta is unusable, but the other two are enough to still produce a result.
  const times = [
    "2024-01-01T00:00:10Z",
    "2024-01-01T00:00:00Z",
    "2024-01-01T00:00:20Z",
    "2024-01-01T00:00:30Z",
  ];
  const result = normalizeSpeeds(points, times);
  expect(result).toBeDefined();
  expect(result!.every((v) => v >= 0 && v <= 1)).toBe(true);
});
