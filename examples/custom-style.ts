import { renderRoute } from "../src/index.ts";

// gpxsnap's default tileUrl (tile.openstreetmap.org) is the only style OSM's
// own infrastructure serves, and it's intentionally "busy" — labels, POIs,
// every road class. Anything more minimal (Positron, Voyager, Toner-style)
// is always a *third-party* value-add service on top of OSM's data, and
// each has its own terms:
//
//   - CARTO's Positron/Voyager tiles don't need an API key to fetch, but
//     their free tier is scoped to "CARTO grantees" (nonprofit/education) —
//     check https://carto.com/basemaps before using it in a shipped product.
//   - Stadia Maps' "Alidade Smooth" (used below) is clean and minimal, but
//     needs a free API key (https://stadiamaps.com) for anything beyond
//     very limited local testing.
//
// This example shows the swap; you'll need your own Stadia API key to
// actually run it.

const apiKey = process.env.STADIA_API_KEY;
if (!apiKey) {
  throw new Error(
    "Set STADIA_API_KEY to run this example — see https://stadiamaps.com for a free key",
  );
}

const coordinates: [number, number][] = [
  [2.3491, 48.853],
  [2.3376, 48.8592],
  [2.3364, 48.8606],
  [2.3266, 48.8611],
  [2.3055, 48.8656],
  [2.2951, 48.8738],
  [2.2986, 48.8867],
];

const png = await renderRoute({
  coordinates,
  width: 1200,
  height: 600,
  padding: 40,
  tileUrl: `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=${apiKey}`,
  attribution: "© Stadia Maps © OpenMapTiles © OpenStreetMap",
});

await Bun.write("examples/output-custom-style.png", png);
console.log(`Wrote examples/output-custom-style.png (${png.length} bytes)`);
