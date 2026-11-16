import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliUsageError, parseCliArgs, runCli, USAGE } from "../src/cli.ts";
import { decodePng } from "../src/png/decode.ts";

const SAMPLE_GPX = "test/fixtures/sample.gpx";
const tempDir = await mkdtemp(join(tmpdir(), "gpxsnap-cli-"));
afterAll(() => rm(tempDir, { recursive: true, force: true }));

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) },
    out,
    err,
  };
}

test("parseCliArgs applies defaults and derives the output path from the input", () => {
  expect(parseCliArgs(["routes/ride.gpx"])).toEqual({
    input: "routes/ride.gpx",
    output: "routes/ride.png",
    options: { width: 800, height: 600, format: "png" },
  });
});

test("parseCliArgs maps flags to render options", () => {
  const { output, options } = parseCliArgs([
    "ride.gpx",
    "-o",
    "out.png",
    "--width",
    "1200",
    "--height",
    "630",
    "--pixel-ratio",
    "2",
    "--padding",
    "10",
    "--simplify",
    "5",
    "--tile-url",
    "https://tiles.example/{z}/{x}/{y}.png",
    "--attribution",
    "Tiles example",
    "--line-color",
    "#00ff00",
    "--line-width",
    "6",
    "--color-by",
    "elevation",
    "--title",
    "Morning ride",
    "--stats-fields",
    "distance,movingTime,pace",
    "--elevation-profile",
    "--legend",
    "--no-markers",
  ])!;
  expect(output).toBe("out.png");
  expect(options).toEqual({
    width: 1200,
    height: 630,
    format: "png",
    pixelRatio: 2,
    padding: 10,
    simplify: 5,
    tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
    attribution: "Tiles example",
    line: { color: "#00ff00", width: 6, colorBy: "elevation" },
    title: "Morning ride",
    stats: true,
    statsFields: ["distance", "movingTime", "pace"],
    elevationProfile: true,
    legend: true,
    markers: false,
  });
});

test("parseCliArgs maps --no-tiles, --no-title and --no-attribution", () => {
  const { options } = parseCliArgs([
    "a.gpx",
    "--no-tiles",
    "--background",
    "#ffffff",
    "--no-title",
    "--no-attribution",
  ])!;
  expect(options.tileUrl).toBe(false);
  expect(options.background).toBe("#ffffff");
  expect(options.title).toBe(false);
  expect(options.attribution).toBe(false);
});

test("parseCliArgs infers the format from --output, and the extension from --format", () => {
  expect(parseCliArgs(["a.gpx", "-o", "x.JPG"])!.options.format).toBe("jpeg");
  expect(parseCliArgs(["a.gpx", "--format", "webp"])!.output).toBe("a.webp");
  expect(parseCliArgs(["a.gpx", "--format", "jpeg"])!.output).toBe("a.jpg");
});

test("parseCliArgs returns null for --help", () => {
  expect(parseCliArgs(["--help"])).toBeNull();
});

test("parseCliArgs rejects bad input with a usage error", () => {
  const bad: string[][] = [
    [],
    ["a.gpx", "b.gpx"],
    ["a.gpx", "--width", "wide"],
    ["a.gpx", "--format", "gif"],
    ["a.gpx", "--color-by", "heart-rate"],
    ["a.gpx", "--stats-fields", "distance,calories"],
    ["a.gpx", "--no-tiles", "--tile-url", "https://x/{z}/{x}/{y}.png"],
    ["a.gpx", "--no-title", "--title", "x"],
    ["a.gpx", "--unknown"],
  ];
  for (const argv of bad) expect(() => parseCliArgs(argv)).toThrow(CliUsageError);
});

test("runCli renders a GPX file to disk without network access", async () => {
  const output = join(tempDir, "out.png");
  const { io, out, err } = captureIo();
  const code = await runCli(
    [SAMPLE_GPX, "-o", output, "--width", "320", "--height", "200", "--no-tiles", "--stats"],
    io,
  );

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(out).toEqual([`${output}\n`]);
  const image = await decodePng(new Uint8Array(await Bun.file(output).arrayBuffer()));
  expect([image.width, image.height]).toEqual([320, 200]);
});

test("runCli prints usage and exits 0 for --help", async () => {
  const { io, out } = captureIo();
  expect(await runCli(["--help"], io)).toBe(0);
  expect(out).toEqual([USAGE]);
});

test("runCli exits 2 with usage on bad arguments", async () => {
  const { io, err } = captureIo();
  expect(await runCli(["--width", "10"], io)).toBe(2);
  expect(err.join("")).toContain("missing input GPX file");
  expect(err.join("")).toContain("Usage: gpxsnap");
});

test("runCli exits 1 when the input can't be read", async () => {
  const { io, err } = captureIo();
  expect(await runCli([join(tempDir, "missing.gpx"), "--no-tiles"], io)).toBe(1);
  expect(err.join("")).toMatch(/^gpxsnap: /);
});
