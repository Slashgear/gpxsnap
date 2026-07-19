import { renderGpx } from "gpxsnap/gpx";

const gpxContents = await Bun.file("test/fixtures/sample.gpx").text();

const png = await renderGpx(gpxContents, {
  width: 1200,
  height: 600,
  padding: 40,
});

await Bun.write("examples/output-gpx.png", png);
console.log(`Wrote examples/output-gpx.png (${png.length} bytes)`);
