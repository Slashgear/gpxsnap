# gpxsnap

## 1.3.0

### Minor Changes

- fd5bbfb: Basemap presets, overlays and softer colors (#19):

  - `basemap` picks a keyless tile preset with its attribution: `osm`, `esri-topo`, `esri-topo-relief`, `esri-light-gray`, `ign-plan`, `ign-plan-relief` (CLI: `--basemap`).
  - `overlay: { tileUrl, opacity, blend, maxZoom }` composites a second tile layer (e.g. a hillshade with `blend: "multiply"`) onto the map before the route is drawn. Best-effort, and above its `maxZoom` the lower-zoom tile is cropped and upscaled.
  - `tileFade` (0-1) mutes the base map's colors; `maxZoom` caps the framing zoom.
  - The PNG decoder now reads 1/2/4-bit palette and grayscale tiles (as served by e.g. CARTO), non-PNG tiles (Esri's JPEG) are transcoded through `Bun.Image` on Bun, and the bitmap font gains `|`.
  - In browsers, non-PNG tiles are decoded with the browser's own `createImageBitmap`, so the `esri-*` presets work there too (Node and Deno still read PNG tiles only).

- ec04861: Richer route statistics (#16):

  - `computeStatistics` now also returns raw min/max elevation, mean absolute grade, and — when points carry `<time>` — elapsed duration, moving time (segments slower than 0.5 m/s count as stopped) and average moving speed.
  - New `statsFields` option on `renderGpx` picks what the stats badge shows, in order: `"distance"`, `"elevation"`, `"elevationRange"`, `"grade"`, `"duration"`, `"movingTime"`, `"speed"`, `"pace"`. The default (`["distance", "elevation"]`) keeps today's badge unchanged.
  - `computeStatistics`, `formatStatistics` and the `RouteStatistics`/`StatsField` types are now exported from `gpxsnap/gpx`.
  - The badge font gains `/` and `%` glyphs.

- c4fd296: Harden rendering against bad input and flaky tile servers:

  - `width`/`height` must now be integers from 1 to 4096 (NaN, 0, negative, fractional or huge values throw before any request), the physical canvas (`* pixelRatio`) is capped at 8192 px per side, and `padding` must be non-negative.
  - New `maxTiles` option (default `100`): a render needing more tiles throws before fetching anything.
  - Tile requests now time out (`tileTimeoutMs`, default 10 s) and are retried with backoff on network errors, timeouts, 429 and 5xx (`tileRetries`, default 2). `FetchLike` now receives an `AbortSignal`.
  - New `onTileError: "skip"` leaves an unfetchable or undecodable tile blank instead of failing the whole render (default stays `"throw"`).
  - New pluggable `tileCache` option plus a built-in `createMemoryTileCache()` LRU, to follow OSM's tile caching policy without adding dependencies.
  - The PNG decoder rejects tiles that aren't a square standard/retina tile size, oversized images and truncated data from the IHDR, before allocating pixel buffers.

- 52a58a8: Tileless / offline rendering (#17): `tileUrl: false` skips tile fetching entirely and draws the route on a transparent canvas, or on a solid color with the new `background` option (e.g. `"#ffffff"`). No network request is made, `maxTiles` doesn't apply, and attribution defaults off since there's no map data to credit (an explicit `attribution` is still stamped).
- 2388d45: New `gpxsnap` command (#18): `bunx gpxsnap route.gpx -o out.png --width 1200 --stats` renders a GPX file from the command line. Built on `node:util`'s `parseArgs` (no new dependency); flags map onto `renderGpx` options, including `--no-tiles`/`--background` for offline renders and `--stats-fields` for the richer statistics. Run `gpxsnap --help` for the full list.

### Patch Changes

- 039c401: Text rendering no longer throws on accented characters: a GPX named "Sortie l'après-midi" used to fail with `unsupported character in text: "è"`. The bitmap font now has French and common Latin-1 accented letters (lower and upper case, plus ç, œ, æ, ß, ñ), extra symbols (`# @ & _ = * ; < > [ ] ° " €`), maps typographic quotes, dashes and non-breaking spaces to their plain forms, strips diacritics it has no glyph for (ő → o), and draws a visible box for anything else instead of throwing. Decomposed (NFD) input is normalized first.

## 1.2.0

### Minor Changes

- 2ec32f2: Add `colorBy` to `LineStyle`, reusing the existing `gradient` option (from
  `pixelRatio`'s sibling feature, line gradients) as the color ramp:
  `colorBy: "elevation" | "speed"` positions each point along `gradient` by
  its own value, normalized to the route's own min/max, instead of position
  along the route's length (the previous, still-default behavior). GPX-only
  (needs `<ele>`/`<time>` data `renderRoute`'s bare coordinates don't carry)
  and falls back silently to length-based coloring when there isn't enough
  usable data, matching `stats`/`elevationProfile`'s existing convention.
- fbc615c: Add `distanceMarkers` to `renderRoute`/`renderGpx`: tick marks every
  `interval` (default 5) `unit` (default `"km"`) of real-world route
  distance, perpendicular to the route at that point, with an optional
  distance label. Placed per track — no marker spans the gap between
  disconnected tracks. It's purely coordinate-based (no elevation/timestamp
  data needed), so — unlike `stats`/`elevationProfile`/`legend` — it's
  available on `renderRoute` as well as `renderGpx`.
- cacf0fb: Add `gradient` to `LineStyle` (the `line` option): overrides `color`,
  interpolating a list of hex color stops (or the built-in `"rainbow"`
  preset) along the route's own on-canvas length. Resolved per rendered
  segment, so it's smoothest on dense tracks. Needs no `<time>`/elevation
  data, unlike speed-based coloring.
- 0d23ed3: Add `shape` to `MarkerStyle` (start/end route markers): `"circle"`
  (default, unchanged) | `"square"` | `"diamond"` | `"triangle"`. Built-in
  vector shapes drawn with the same antialiased fill approach as the rest of
  the renderer — no image assets, same dependency-free spirit as the
  hand-drawn bitmap font. The ring, if any, is drawn in the same shape,
  slightly larger.
- 0c3fc55: Add `legend` to `renderGpx` for multi-track files: a color-swatch-and-name
  key stamped in the bottom-left corner, one row per track, only drawn when
  the file has more than one track. Entries beyond `LegendStyle.maxEntries`
  (default 6) collapse into a trailing "+N more" row instead of growing the
  plate without bound.
- c448809: Parse `<time>` per GPX point. `GpxPoint` (and `parseGpxDocument`'s output)
  now carries an optional `time` field — the raw ISO 8601 string from
  `<trkpt>`/`<rtept>`'s `<time>` child, kept only when it parses as a valid
  date. Not yet used by rendering — this is the foundation for upcoming
  duration/speed/pace features.
- efc465a: Add `pixelRatio` to `renderRoute`/`renderGpx` for high-DPI/retina output. The
  geographic framing stays identical to `pixelRatio: 1`; the canvas and every
  drawn element (route line, markers, badges, elevation profile) render at
  `width * pixelRatio` x `height * pixelRatio` physical pixels instead. Also
  requests retina map tiles: `tileUrl` templates with an `{r}` token get it
  substituted with `@2x`/`@3x`; templates without one (e.g. the default OSM
  source, which has no retina tiles) fall back to nearest-neighbor upscaling
  the standard tile.
- 2a9fe81: Add `format`/`quality` to `renderRoute`/`renderGpx` for WebP/JPEG output on
  Bun. The default PNG path is unchanged on every runtime — gpxsnap still
  renders and encodes the same dependency-free PNG it always did. Requesting
  `format: "webp" | "jpeg"` re-encodes those PNG bytes through Bun's native
  `Bun.Image` (no npm dependency, built into the Bun binary); it's a Bun-only
  enhancement, so requesting it on Node or Deno throws a clear error
  immediately, before any tile fetching, rather than silently falling back.

## 1.1.1

### Patch Changes

- f977760: Fixed an algorithmic-complexity (quadratic-time) issue in the GPX tag scanner used by `parseGpxDocument`/`parseGpxTrackPoints`/`renderGpx`: malformed input with unclosed tags (e.g. a truncated `.gpx` upload) could take seconds to parse instead of milliseconds. The scanner now uses a linear `indexOf`-based forward scan instead of a backtracking regex. Also documented `parseGpxDocument`, `parseGpxTrackPoints`, and `extractGpxName` in the README — these were already exported from `gpxsnap/gpx` but undocumented.

## 1.1.0

### Minor Changes

- 63a155e: Add a `simplify` option to `renderRoute`/`renderGpx`: a Ramer-Douglas-Peucker tolerance in meters that drops points deviating less than that amount from the line through their neighbors, before bounds fitting and rendering. Useful for dense recorded tracks (a real ~1200-point ride drops to ~270 points at a 10m tolerance) — the route still looks the same, with fewer segments to composite. Omit or pass 0 to render every point as recorded (the existing default behavior, unchanged).
- d140566: Richer GPX rendering, inspired by gpx.studio: `renderRoute`/`renderGpx` gain a `title` option (auto-filled from the GPX's own `<name>` unless set explicitly, `false` to suppress) stamped as a top-left badge. `renderGpx` now understands multi-track files — each `<trk>` renders as its own polyline with no spurious connecting segment between disconnected tracks, using a cycled default color palette or an embedded `gpx_style:color` extension per track — plus `<wpt>` waypoints as small dots, and falls back to `<rte>`/`<rtept>` when a file has no recorded `<trk>` at all (planned routes with no GPS recording). Two new GPX-only options round this out: `stats` (a badge with distance and, when at least half the points carry `<ele>` data, smoothed elevation gain/loss) and `elevationProfile` (a mini filled line chart along the bottom of the image, reserving room so its line doesn't run underneath the attribution badge). The bitmap font used for all on-image text now covers digits and common punctuation.

## 1.0.2

### Patch Changes

- c84e0b9: Fix type resolution and declared runtime compatibility:

  - Added explicit `types` conditions to `exports` and a top-level `types` field. Previously TypeScript could only resolve gpxsnap's types under specific resolver configurations; verified with `@arethetypeswrong/cli` that both entry points now resolve correctly under `bundler` and `node16`/`nodenext` (ESM) resolution.
  - `engines` now also declares `node` (`>=22.18.0`, the real floor for native TypeScript type-stripping) and `deno` (`>=1.0.0`) instead of only `bun` — the package always worked under Node/Deno, `engines` just didn't say so.
  - Narrowed two internal `Uint8Array` parameter types to `Uint8Array<ArrayBuffer>` in the PNG codec, fixing a type error consumers would hit under a standard DOM-lib tsconfig (TypeScript 5.7+ made typed arrays generic over buffer type; `BlobPart` requires a concrete `ArrayBuffer`).

## 1.0.1

### Patch Changes

- f9cbcba: Replace the internal `const enum ColorType` (PNG decoder) with a plain object + type alias. TypeScript enums have runtime semantics that can't be erased by type-stripping alone, which broke importing gpxsnap's raw `.ts` source directly under Node.js (>=22.18) and Deno — both now work, verified by a cross-runtime e2e check (`test/e2e/render.e2e.ts`) run in CI against Bun, Node 20/22/24, and Deno.
