import { renderGpx } from "gpxsnap/gpx";

// A real ~1200-point cycling track near Lyon, France (anonymized: no waypoints,
// names, or timestamps — see test/fixtures/sample-ride.gpx). Dense real GPS
// data like this already hugs the road network with a plain polyline stroke;
// no map-matching needed.
const gpxContents = await Bun.file("test/fixtures/sample-ride.gpx").text();

const png = await renderGpx(gpxContents, {
  width: 1200,
  height: 900,
  padding: 40,
});

await Bun.write("examples/output-real-ride.png", png);
console.log(`Wrote examples/output-real-ride.png (${png.length} bytes)`);
