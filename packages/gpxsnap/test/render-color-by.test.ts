import { expect, test } from "bun:test";
import { renderGpx } from "../src/gpx.ts";

async function mockFetch(): Promise<Response> {
  const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
  return new Response(bytes, { status: 200 });
}

const BASE_OPTIONS = {
  width: 400,
  height: 300,
  attribution: false,
  markers: false,
  fetchImpl: mockFetch,
} as const;

function gpxWithElevationAndTime(): string {
  const points = Array.from({ length: 30 }, (_, i) => {
    const lat = 48.85 + i * 0.001;
    const lon = 2.3 + i * 0.001;
    const ele = 100 + i * 10; // steadily climbing
    const time = new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(); // one point per minute
    return `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele><time>${time}</time></trkpt>`;
  }).join("");
  return `<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`;
}

test("colorBy: elevation changes the output vs. a flat line color", async () => {
  const gpx = gpxWithElevationAndTime();
  const flat = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#E74C3C" } });
  const byElevation = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow", colorBy: "elevation" },
  });
  expect(Array.from(byElevation)).not.toEqual(Array.from(flat));
});

test("colorBy: speed changes the output vs. a flat line color", async () => {
  const gpx = gpxWithElevationAndTime();
  const flat = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#E74C3C" } });
  const bySpeed = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow", colorBy: "speed" },
  });
  expect(Array.from(bySpeed)).not.toEqual(Array.from(flat));
});

test("colorBy: elevation vs. colorBy: speed produce different output for the same route", async () => {
  const gpx = gpxWithElevationAndTime();
  const byElevation = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow", colorBy: "elevation" },
  });
  const bySpeed = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow", colorBy: "speed" },
  });
  expect(Array.from(byElevation)).not.toEqual(Array.from(bySpeed));
});

test("colorBy: elevation falls back to length-based gradient when the GPX has no <ele>", async () => {
  const withoutElevation = `<gpx><trk><trkseg>
    <trkpt lat="48.85" lon="2.30"/><trkpt lat="48.86" lon="2.31"/><trkpt lat="48.87" lon="2.32"/>
  </trkseg></trk></gpx>`;

  const byLength = await renderGpx(withoutElevation, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow" },
  });
  const byElevationFallback = await renderGpx(withoutElevation, {
    ...BASE_OPTIONS,
    line: { gradient: "rainbow", colorBy: "elevation" },
  });
  expect(Array.from(byElevationFallback)).toEqual(Array.from(byLength));
});

test("colorBy is a no-op without a gradient set (colorBy alone doesn't imply one)", async () => {
  const gpx = gpxWithElevationAndTime();
  const flat = await renderGpx(gpx, { ...BASE_OPTIONS, line: { color: "#E74C3C" } });
  const flatWithColorBy = await renderGpx(gpx, {
    ...BASE_OPTIONS,
    line: { color: "#E74C3C", colorBy: "elevation" },
  });
  expect(Array.from(flatWithColorBy)).toEqual(Array.from(flat));
});
