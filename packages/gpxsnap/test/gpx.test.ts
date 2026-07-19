import { expect, test } from "bun:test";
import { parseGpxTrackPoints, renderGpx } from "../src/gpx.ts";
import { renderRoute } from "../src/index.ts";
import { decodePng } from "../src/png/decode.ts";

const SAMPLE_GPX = "test/fixtures/sample.gpx";

async function mockFetch(): Promise<Response> {
  const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
  return new Response(bytes, { status: 200 });
}

test("parseGpxTrackPoints extracts trkpt coordinates in order, flattening across trkseg", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const points = parseGpxTrackPoints(gpx);

  expect(points).toEqual([
    [2.3491, 48.853],
    [2.3376, 48.8592],
    [2.2951, 48.8738],
    [2.2986, 48.8867], // last <trkpt> has lon before lat in the fixture — order must not matter
  ]);
});

test("parseGpxTrackPoints ignores <wpt> waypoints", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const points = parseGpxTrackPoints(gpx);
  // The fixture's <wpt> sits at [2.3376, 48.8606], distinct from any trkpt above.
  expect(points.some(([lon, lat]) => lon === 2.3376 && lat === 48.8606)).toBe(false);
});

test("parseGpxTrackPoints handles single-quoted attributes and self-closing tags", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat='48.85' lon='2.35'/></trkseg></trk></gpx>`;
  expect(parseGpxTrackPoints(gpx)).toEqual([[2.35, 48.85]]);
});

test("parseGpxTrackPoints throws when a trkpt is missing lat or lon", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="48.85"></trkpt></trkseg></trk></gpx>`;
  expect(() => parseGpxTrackPoints(gpx)).toThrow(/missing a lat or lon/);
});

test("parseGpxTrackPoints throws on non-numeric lat/lon", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="north" lon="2.35"></trkpt></trkseg></trk></gpx>`;
  expect(() => parseGpxTrackPoints(gpx)).toThrow(/non-numeric/);
});

test("parseGpxTrackPoints throws when there are no trkpt elements at all", () => {
  const gpx = `<gpx><wpt lat="48.85" lon="2.35"><name>Somewhere</name></wpt></gpx>`;
  expect(() => parseGpxTrackPoints(gpx)).toThrow(/no <trkpt> elements/);
});

test("renderGpx is a thin wrapper: identical output to calling renderRoute with the same coordinates", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const coordinates = parseGpxTrackPoints(gpx);

  const viaGpx = await renderGpx(gpx, { width: 300, height: 200, fetchImpl: mockFetch });
  const viaRoute = await renderRoute({
    coordinates,
    width: 300,
    height: 200,
    fetchImpl: mockFetch,
  });

  expect(Array.from(viaGpx)).toEqual(Array.from(viaRoute));
});

test("renderGpx produces a valid, correctly sized PNG end-to-end", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const png = await renderGpx(gpx, { width: 250, height: 180, fetchImpl: mockFetch });
  const decoded = await decodePng(png);
  expect(decoded.width).toBe(250);
  expect(decoded.height).toBe(180);
});
