---
"gpxsnap": minor
---

Basemap presets, overlays and softer colors (#19):

- `basemap` picks a keyless tile preset with its attribution: `osm`, `esri-topo`, `esri-topo-relief`, `esri-light-gray`, `ign-plan`, `ign-plan-relief` (CLI: `--basemap`).
- `overlay: { tileUrl, opacity, blend, maxZoom }` composites a second tile layer (e.g. a hillshade with `blend: "multiply"`) onto the map before the route is drawn. Best-effort, and above its `maxZoom` the lower-zoom tile is cropped and upscaled.
- `tileFade` (0-1) mutes the base map's colors; `maxZoom` caps the framing zoom.
- The PNG decoder now reads 1/2/4-bit palette and grayscale tiles (as served by e.g. CARTO), non-PNG tiles (Esri's JPEG) are transcoded through `Bun.Image` on Bun, and the bitmap font gains `|`.
- In browsers, non-PNG tiles are decoded with the browser's own `createImageBitmap`, so the `esri-*` presets work there too (Node and Deno still read PNG tiles only).
