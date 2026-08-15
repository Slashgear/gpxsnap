---
"gpxsnap": minor
---

Add `pixelRatio` to `renderRoute`/`renderGpx` for high-DPI/retina output. The
geographic framing stays identical to `pixelRatio: 1`; the canvas and every
drawn element (route line, markers, badges, elevation profile) render at
`width * pixelRatio` x `height * pixelRatio` physical pixels instead. Also
requests retina map tiles: `tileUrl` templates with an `{r}` token get it
substituted with `@2x`/`@3x`; templates without one (e.g. the default OSM
source, which has no retina tiles) fall back to nearest-neighbor upscaling
the standard tile.
