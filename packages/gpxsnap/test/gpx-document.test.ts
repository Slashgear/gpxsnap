import { expect, test } from "bun:test";
import { parseGpxDocument, parseGpxTrackPoints } from "../src/gpx.ts";

test("parseGpxDocument extracts the file-level name from <metadata>", () => {
  const gpx = `<gpx><metadata><name>My Ride</name></metadata><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(parseGpxDocument(gpx).name).toBe("My Ride");
});

test("parseGpxDocument keeps each track's own name distinct from the document name", () => {
  const gpx = `<gpx><metadata><name>File name</name></metadata><trk><name>Track name</name><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.name).toBe("File name");
  expect(doc.tracks[0]!.name).toBe("Track name");
});

test("parseGpxDocument parses elevation per point when present", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="2"><ele>123.4</ele></trkpt><trkpt lat="3" lon="4"/></trkseg></trk></gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.tracks[0]!.points).toEqual([
    { lon: 2, lat: 1, elevation: 123.4 },
    { lon: 4, lat: 3, elevation: undefined },
  ]);
});

test("parseGpxDocument splits multiple <trk> into separate tracks", () => {
  const gpx = `<gpx>
    <trk><name>Out</name><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk>
    <trk><name>Back</name><trkseg><trkpt lat="10" lon="10"/><trkpt lat="11" lon="11"/></trkseg></trk>
  </gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.tracks).toHaveLength(2);
  expect(doc.tracks[0]!.name).toBe("Out");
  expect(doc.tracks[0]!.points).toHaveLength(2);
  expect(doc.tracks[1]!.name).toBe("Back");
  expect(doc.tracks[1]!.points).toHaveLength(2);
});

test("parseGpxDocument extracts top-level <wpt> waypoints, with and without names", () => {
  const gpx = `<gpx>
    <wpt lat="1" lon="2"><name>Rest stop</name></wpt>
    <wpt lat="3" lon="4"/>
    <trk><trkseg><trkpt lat="5" lon="6"/></trkseg></trk>
  </gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.waypoints).toEqual([
    { lon: 2, lat: 1, name: "Rest stop" },
    { lon: 4, lat: 3, name: undefined },
  ]);
});

test("parseGpxDocument falls back to <rte>/<rtept> when there is no <trk> at all", () => {
  const gpx = `<gpx><rte><name>Planned route</name><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.tracks).toHaveLength(1);
  expect(doc.tracks[0]!.name).toBe("Planned route");
  expect(doc.tracks[0]!.points).toEqual([
    { lon: 2, lat: 1, elevation: undefined },
    { lon: 4, lat: 3, elevation: undefined },
  ]);
});

test("parseGpxDocument prefers <trk> over <rte> when a file has both", () => {
  const gpx = `<gpx>
    <rte><rtept lat="90" lon="90"/></rte>
    <trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>
  </gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.tracks[0]!.points).toEqual([{ lon: 2, lat: 1, elevation: undefined }]);
});

test("parseGpxTrackPoints renders a route-only (<rte>) file via the fallback", () => {
  const gpx = `<gpx><rte><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`;
  expect(parseGpxTrackPoints(gpx)).toEqual([
    [2, 1],
    [4, 3],
  ]);
});

test("parseGpxDocument extracts an embedded gpx_style:color extension, normalized to #RRGGBB", () => {
  const gpx = `<gpx><trk><extensions><gpx_style:line><gpx_style:color>FF00FF</gpx_style:color></gpx_style:line></extensions><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(parseGpxDocument(gpx).tracks[0]!.color).toBe("#FF00FF");
});

test("parseGpxDocument expands a 3-digit embedded color to 6 digits", () => {
  const gpx = `<gpx><trk><extensions><line><color>0F0</color></line></extensions><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(parseGpxDocument(gpx).tracks[0]!.color).toBe("#00FF00");
});

test("parseGpxDocument leaves color undefined when there's no extensions block", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`;
  expect(parseGpxDocument(gpx).tracks[0]!.color).toBeUndefined();
});

test("parseGpxDocument returns empty tracks/waypoints for a document with neither, without throwing", () => {
  const gpx = `<gpx><metadata><name>Empty</name></metadata></gpx>`;
  const doc = parseGpxDocument(gpx);
  expect(doc.tracks).toEqual([]);
  expect(doc.waypoints).toEqual([]);
  expect(doc.name).toBe("Empty");
});

test("parseGpxDocument stays fast on malformed input with no closing tags (algorithmic-complexity DoS regression)", () => {
  // A lazy-wildcard regex re-scans the remaining input from every candidate
  // tag-open position, which is quadratic when a closing tag never appears.
  // 200k repeats of an unclosed <trk> used to take multiple seconds; it
  // should now stay comfortably linear.
  const unclosed = "<trk>".repeat(200_000);
  const noTagEnd = "<trk ".repeat(200_000);

  const start = performance.now();
  parseGpxDocument(unclosed);
  parseGpxDocument(noTagEnd);
  const elapsedMs = performance.now() - start;

  expect(elapsedMs).toBeLessThan(1000);
});

test("parseGpxDocument handles the real multi-track fixture: two tracks, one with an embedded color and a point missing <ele>", async () => {
  const gpx = await Bun.file("test/fixtures/sample.gpx").text();
  const doc = parseGpxDocument(gpx);

  expect(doc.tracks).toHaveLength(2);

  const [first, second] = doc.tracks;
  expect(first!.name).toBe("Sample Paris Walk");
  expect(first!.color).toBeUndefined();
  expect(first!.points.every((p) => p.elevation !== undefined)).toBe(true);

  expect(second!.name).toBe("Second Loop");
  expect(second!.color).toBe("#00FF00");
  expect(second!.points[0]!.elevation).toBeUndefined();
  expect(second!.points[1]!.elevation).toBe(50.0);
});
