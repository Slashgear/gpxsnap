import { expect, test } from "bun:test";
import { renderGpx } from "../src/gpx.ts";

async function mockFetch(): Promise<Response> {
  const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
  return new Response(bytes, { status: 200 });
}

const BASE_OPTIONS = {
  width: 400,
  height: 400,
  attribution: false,
  markers: false,
  fetchImpl: mockFetch,
} as const;

test("renders disconnected tracks as separate polylines, not one flattened line", async () => {
  const twoTracks = `<gpx>
    <trk><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.31"/></trkseg></trk>
    <trk><trkseg><trkpt lat="48.95" lon="2.45"/><trkpt lat="48.96" lon="2.46"/></trkseg></trk>
  </gpx>`;
  const flattenedSingleTrack = `<gpx><trk><trkseg>
    <trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.31"/>
    <trkpt lat="48.95" lon="2.45"/><trkpt lat="48.96" lon="2.46"/>
  </trkseg></trk></gpx>`;

  const separate = await renderGpx(twoTracks, BASE_OPTIONS);
  const flattened = await renderGpx(flattenedSingleTrack, BASE_OPTIONS);

  // If tracks were silently flattened, this would render a spurious segment
  // connecting the two clusters — a different (and wrong) image.
  expect(Array.from(separate)).not.toEqual(Array.from(flattened));
});

test("draws a dot for each <wpt> waypoint", async () => {
  const withWaypoint = `<gpx><trk><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.32"/></trkseg></trk><wpt lat="48.855" lon="2.31"/></gpx>`;
  const withoutWaypoint = `<gpx><trk><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.32"/></trkseg></trk></gpx>`;

  const withWp = await renderGpx(withWaypoint, BASE_OPTIONS);
  const withoutWp = await renderGpx(withoutWaypoint, BASE_OPTIONS);

  expect(Array.from(withWp)).not.toEqual(Array.from(withoutWp));
});

test("uses a track's embedded gpx_style:color when line.color isn't set explicitly", async () => {
  const gpx = `<gpx><trk><extensions><line><color>00FF00</color></line></extensions><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.32"/></trkseg></trk></gpx>`;

  const usingEmbeddedColor = await renderGpx(gpx, BASE_OPTIONS);
  const explicitSameColor = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#00FF00" } });
  const explicitDifferentColor = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { color: "#0000FF" },
  });

  expect(Array.from(usingEmbeddedColor)).toEqual(Array.from(explicitSameColor));
  expect(Array.from(usingEmbeddedColor)).not.toEqual(Array.from(explicitDifferentColor));
});

test("an explicit line.color overrides every track's embedded color uniformly", async () => {
  const gpx = `<gpx>
    <trk><extensions><line><color>00FF00</color></line></extensions><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.31"/></trkseg></trk>
    <trk><extensions><line><color>0000FF</color></line></extensions><trkseg><trkpt lat="48.95" lon="2.45"/><trkpt lat="48.96" lon="2.46"/></trkseg></trk>
  </gpx>`;

  const perTrackColors = await renderGpx(gpx, BASE_OPTIONS);
  const forcedUniform = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#00FF00" } });

  expect(Array.from(perTrackColors)).not.toEqual(Array.from(forcedUniform));
});

test("cycles a default color per track when none has an embedded color", async () => {
  const gpx = `<gpx>
    <trk><trkseg><trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.31"/></trkseg></trk>
    <trk><trkseg><trkpt lat="48.95" lon="2.45"/><trkpt lat="48.96" lon="2.46"/></trkseg></trk>
  </gpx>`;

  const defaultCycling = await renderGpx(gpx, BASE_OPTIONS);
  const forcedUniform = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#E74C3C" } });

  expect(Array.from(defaultCycling)).not.toEqual(Array.from(forcedUniform));
});
