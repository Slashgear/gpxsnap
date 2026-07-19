import { expect, test } from "bun:test";
import { extractGpxName, parseGpxTrackPoints, renderGpx } from "../src/gpx.ts";
import { renderRoute } from "../src/index.ts";
import { decodePng } from "../src/png/decode.ts";

const SAMPLE_GPX = "test/fixtures/sample.gpx";

async function mockFetch(): Promise<Response> {
  const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
  return new Response(bytes, { status: 200 });
}

test("parseGpxTrackPoints extracts trkpt coordinates in order, flattening across trkseg and tracks", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const points = parseGpxTrackPoints(gpx);

  expect(points).toEqual([
    [2.3491, 48.853],
    [2.3376, 48.8592],
    [2.2951, 48.8738],
    [2.2986, 48.8867], // last <trkpt> has lon before lat in the fixture — order must not matter
    [2.36, 48.89], // second <trk>'s points
    [2.365, 48.895],
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

test("parseGpxTrackPoints throws when there are no trkpt or rtept elements at all", () => {
  const gpx = `<gpx><wpt lat="48.85" lon="2.35"><name>Somewhere</name></wpt></gpx>`;
  expect(() => parseGpxTrackPoints(gpx)).toThrow(/no <trkpt> or <rtept> elements/);
});

test("renderGpx matches renderRoute exactly for a single track with no waypoints", async () => {
  // sample.gpx has a <wpt>, which renderGpx now renders as a dot that
  // renderRoute has no way to know about — use a waypoint-free inline GPX
  // here so this test isolates "single track, same coordinates and title".
  const gpx = `<gpx><trk><trkseg><trkpt lat="48.853" lon="2.3491"/><trkpt lat="48.8592" lon="2.3376"/></trkseg></trk></gpx>`;
  const coordinates = parseGpxTrackPoints(gpx);

  const viaGpx = await renderGpx(gpx, {
    width: 300,
    height: 200,
    title: false,
    fetchImpl: mockFetch,
  });
  const viaRoute = await renderRoute({
    coordinates,
    width: 300,
    height: 200,
    title: false,
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

test("extractGpxName prefers the track's own name", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  expect(extractGpxName(gpx)).toBe("Sample Paris Walk");
});

test("extractGpxName falls back to <metadata><name> when the track has none", () => {
  const gpx = `<gpx><metadata><name>File-level name</name></metadata><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(extractGpxName(gpx)).toBe("File-level name");
});

test("extractGpxName returns undefined when nothing has a name", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(extractGpxName(gpx)).toBeUndefined();
});

test("extractGpxName decodes standard XML entities", () => {
  const gpx = `<gpx><trk><name>Rock &amp; Ride ~ Antoine&apos;s loop</name><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(extractGpxName(gpx)).toBe("Rock & Ride ~ Antoine's loop");
});

test("renderGpx auto-fills title from the GPX file's name", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const withAuto = await renderGpx(gpx, { width: 300, height: 200, fetchImpl: mockFetch });
  const withoutTitle = await renderGpx(gpx, {
    width: 300,
    height: 200,
    title: false,
    fetchImpl: mockFetch,
  });
  const withExplicitSameTitle = await renderGpx(gpx, {
    width: 300,
    height: 200,
    title: "Sample Paris Walk",
    fetchImpl: mockFetch,
  });

  expect(Array.from(withAuto)).not.toEqual(Array.from(withoutTitle));
  expect(Array.from(withAuto)).toEqual(Array.from(withExplicitSameTitle));
});

test("renderGpx respects an explicit title override", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const withOverride = await renderGpx(gpx, {
    width: 300,
    height: 200,
    title: "Custom title",
    fetchImpl: mockFetch,
  });
  const withAuto = await renderGpx(gpx, { width: 300, height: 200, fetchImpl: mockFetch });

  expect(Array.from(withOverride)).not.toEqual(Array.from(withAuto));
});

test("renderGpx stamps a stats badge only when stats is truthy", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const withStats = await renderGpx(gpx, {
    width: 300,
    height: 200,
    stats: true,
    fetchImpl: mockFetch,
  });
  const withoutStats = await renderGpx(gpx, { width: 300, height: 200, fetchImpl: mockFetch });

  expect(Array.from(withStats)).not.toEqual(Array.from(withoutStats));
});

test("renderGpx stats badge honors a custom style", async () => {
  const gpx = await Bun.file(SAMPLE_GPX).text();
  const defaultStyle = await renderGpx(gpx, {
    width: 300,
    height: 200,
    stats: true,
    fetchImpl: mockFetch,
  });
  const customStyle = await renderGpx(gpx, {
    width: 300,
    height: 200,
    stats: { textColor: "#ff0000" },
    fetchImpl: mockFetch,
  });

  expect(Array.from(defaultStyle)).not.toEqual(Array.from(customStyle));
});
