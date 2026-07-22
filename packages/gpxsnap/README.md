# gpxsnap

A dependency-free route-preview PNG renderer for Bun. GPX tracks (or plain
coordinates) in, a static map image out — no native bindings anywhere in the
chain: no `sharp`, no `libvips`, just `fetch` and the Web `CompressionStream`
/ `DecompressionStream` APIs.

![Sample output: a real ~1200-point GPS track rendered near Lyon, France](docs/sample.png)

That's a real recorded ride (anonymized — see `test/fixtures/sample-ride.gpx`
and `examples/real-ride.ts`), not hand-picked waypoints: dense real GPS data
already hugs the road network with a plain polyline stroke, no map-matching
required.

## Install

```bash
bun add gpxsnap
```

gpxsnap ships as raw TypeScript source (no build step, no compiled output) —
so which runtimes can `import` it directly depends on their TypeScript
support:

| Runtime | Support                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bun     | Any version — native TS transpilation.                                                                                                                                                                                                           |
| Node.js | **≥22.18** — native type-stripping, unflagged, since that version. Node ≥22.6 works with `--experimental-strip-types`. Node <22.6 (including 20.x LTS) has no native TS support at all; bring your own transpiler (`tsx`, `ts-node`) or bundler. |
| Deno    | Any version — native TS support since Deno 1.0.                                                                                                                                                                                                  |

This is verified on every push, not just typechecked: `test/e2e/render.e2e.ts`
is one script (no `bun:test`, no runtime-specific globals) run unmodified
under Bun, Node 20/22/24, and Deno in CI. Run it yourself with
`bun run test:e2e:bun` / `test:e2e:node` / `test:e2e:deno`.

Note this project's own tooling (`bun run typecheck`, `bun run test`, CI)
uses Bun throughout — the runtime matrix above is about what a _consumer_
of the published package can use, not what's needed to develop gpxsnap
itself (see [CONTRIBUTING.md](../../CONTRIBUTING.md), which does require Bun).

Types resolve correctly for modern resolution (`bundler`, `node16`/`nodenext`)
— verified with [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io).
Legacy `node10`-style resolution and CommonJS `require()` are not
supported (this package is ESM-only, matching the runtime matrix above);
use a dynamic `import()` from CJS code if you need to.

## Usage

```ts
import { renderRoute } from "gpxsnap";

const png = await renderRoute({
  coordinates: [
    [2.3522, 48.8566],
    [2.295, 48.8738],
    [2.2986, 48.8867],
  ], // [lon, lat][]
  width: 1200,
  height: 600,
  padding: 40,
});

await Bun.write("route.png", png);
```

See `examples/basic.ts` for a runnable example (`bun examples/basic.ts`).

For an actual `.gpx` file, use the `gpxsnap/gpx` convenience entry point
instead of extracting coordinates yourself:

```ts
import { renderGpx } from "gpxsnap/gpx";

const gpxContents = await Bun.file("route.gpx").text();
const png = await renderGpx(gpxContents, { width: 1200, height: 600 });
```

`renderGpx` understands more of a real GPX file than a flat coordinate list
can express:

- **Multiple `<trk>`** each render as their own polyline — no spurious line
  connecting disconnected tracks — cycling through a small default color
  palette, or an embedded [GPX Style extension](https://gpx.studio/)
  `gpx_style:color` per track, unless you set `line.color` explicitly (which
  then applies to every track uniformly).
- **`<rte>`/`<rtept>`** (a planned route with no GPS recording) is used as a
  fallback when a file has no `<trk>` at all.
- **`<wpt>` waypoints** render as small dots.
- **`title`** auto-fills from the track's or file's `<name>` unless you set
  it explicitly (`false` to suppress even an auto-detected name).
- **`stats`** and **`elevationProfile`** (GPX-only — see the API tables
  below) use each point's `<ele>` elevation data, when present.

See `examples/gpx.ts` for a runnable example (`bun examples/gpx.ts`), or
`examples/real-ride.ts` for the denser real-world track shown above.

gpxsnap only renders — it doesn't edit GPX files. It can simplify a track
for rendering (see `simplify` below), but for trimming, merging, or other
edits before rendering, [gpx.studio](https://gpx.studio/) is a great free
tool for that.

## API

### `renderRoute(options): Promise<Uint8Array>`

| Option        | Type                      | Default                                          | Notes                                                                                                    |
| ------------- | ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `coordinates` | `[number, number][]`      | required                                         | `[lon, lat]` pairs                                                                                       |
| `width`       | `number`                  | required                                         | output PNG width in pixels                                                                               |
| `height`      | `number`                  | required                                         | output PNG height in pixels                                                                              |
| `padding`     | `number`                  | `40`                                             | margin kept between the fitted route bbox and canvas edge                                                |
| `simplify`    | `number`                  | `0` (off)                                        | Ramer-Douglas-Peucker tolerance in meters; drops points that deviate less than this from their neighbors |
| `title`       | `string \| false`         | `undefined` (off)                                | stamped as a badge in the top-left corner; unsupported characters throw (see the font's character set)   |
| `line`        | `LineStyle`               | see below                                        | route stroke styling                                                                                     |
| `markers`     | `boolean \| MarkersStyle` | `true`                                           | start/end pins; `false` to omit                                                                          |
| `tileUrl`     | `string`                  | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | any `{z}`/`{x}`/`{y}` XYZ template — see below for other styles                                          |
| `attribution` | `boolean \| string`       | `true` (OSM text)                                | pass a string for a non-OSM tile source's required wording                                               |
| `concurrency` | `number`                  | `8`                                              | max simultaneous tile fetches                                                                            |
| `userAgent`   | `string`                  | `gpxsnap (https://github.com/Slashgear/gpxsnap)` | sent on every tile request                                                                               |
| `fetchImpl`   | `FetchLike`               | global `fetch`                                   | injection point for tests / custom networking                                                            |

### `LineStyle` (the `line` option)

| Field     | Type     | Default     |
| --------- | -------- | ----------- |
| `color`   | `string` | `"#E74C3C"` |
| `width`   | `number` | `3`         |
| `opacity` | `number` | `1`         |

### `MarkersStyle` (the `markers` option, as `{ start?, end? }`)

Each of `start` / `end` is a `MarkerStyle`:

| Field       | Type     | Default                             |
| ----------- | -------- | ----------------------------------- |
| `radius`    | `number` | `6`                                 |
| `color`     | `string` | `"#2ECC71"` start / `"#E74C3C"` end |
| `ringColor` | `string` | `"#ffffff"`                         |
| `ringWidth` | `number` | `2`                                 |
| `opacity`   | `number` | `1`                                 |

### `renderGpx(gpxContents, options): Promise<Uint8Array>`

Same options as `renderRoute`, minus `coordinates` (extracted from the GPX
data for you), plus `title` auto-filled from the GPX's own `<name>` (see
above) and two GPX-only options that need per-point elevation data
`renderRoute` doesn't have. Exported from `gpxsnap/gpx`.

| Option             | Type                               | Default | Notes                                                                                                          |
| ------------------ | ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `stats`            | `boolean \| BadgeStyle`            | `false` | badge (top-right) with distance, and — if at least half the points have `<ele>` — smoothed elevation gain/loss |
| `elevationProfile` | `boolean \| ElevationProfileStyle` | `false` | mini filled line chart along the bottom strip; silently omitted with fewer than 2 elevation points             |

`BadgeStyle` is `{ scale?, padding?, textColor?, backgroundColor?,
backgroundOpacity? }`. `ElevationProfileStyle` is `{ height?, lineColor?,
fillColor?, fillOpacity?, backgroundColor?, backgroundOpacity? }`.

### GPX parsing, without rendering

`gpxsnap/gpx` also exports the parsing step on its own, for callers that want
track/waypoint data rather than (or in addition to) a rendered PNG:

```ts
import { parseGpxDocument, parseGpxTrackPoints, extractGpxName } from "gpxsnap/gpx";

const gpxContents = await Bun.file("route.gpx").text();

parseGpxDocument(gpxContents); // full structure: tracks, waypoints, names, colors, elevation
parseGpxTrackPoints(gpxContents); // just [lon, lat][], flattened across tracks — what renderGpx feeds to renderRoute
extractGpxName(gpxContents); // the same name renderGpx auto-fills into `title`
```

| Function                   | Returns               | Notes                                                                                                                                                                 |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseGpxDocument(gpx)`    | `GpxDocument`         | `{ name?, tracks: GpxTrack[], waypoints: GpxWaypoint[] }`. Each `GpxTrack` is `{ name?, color?, points: GpxPoint[] }`; each `GpxPoint` is `{ lon, lat, elevation? }`. |
| `parseGpxTrackPoints(gpx)` | `[number, number][]`  | Flattened `[lon, lat]` pairs across every track/route. Throws if there are no `<trkpt>`/`<rtept>` elements at all.                                                    |
| `extractGpxName(gpx)`      | `string \| undefined` | First track's own name, falling back to `<metadata><name>`.                                                                                                           |

These are a targeted extraction, not a general-purpose XML parser: only the
elements a route preview needs (`<trk>`/`<rte>`, `<trkpt>`/`<rtept>`, `<wpt>`,
`<name>`, `<ele>`, and the `gpx_style:color` extension), matched with
`indexOf`-based scanning kept deliberately linear in input size — including
on malformed input (unclosed tags, missing `>`) — rather than a backtracking
regex, so a truncated or malicious upload can't pin the CPU. External
entities/DOCTYPE aren't processed at all (only the five predefined XML
entities `&amp; &lt; &gt; &quot; &apos;` are decoded), so there's no XXE
surface. Numeric `lat`/`lon` are validated with `Number.isFinite` and throw
on garbage rather than silently producing `NaN`. If you need full XML
fidelity (CDATA, comments, arbitrary nesting), reach for a real XML parser
instead.

## Why

[`staticmaps`](https://www.npmjs.com/package/staticmaps) works, but it pulls
in a native `sharp`/`libvips` binary plus a transitive `modern-async` →
`core-js-pure` chain of ES5 polyfills, just to stitch some tiles and draw a
line. None of that is essential — tile fetch, PNG decode/encode, and line
rasterization are small, boundable, well-documented pieces of code, built here
using only Web-standard APIs that Bun (and modern Node) already ship.

## Development

```bash
bun install
bun test          # run tests
bun run typecheck  # tsc --noEmit
bun run lint       # oxlint
bun run fmt:check  # oxfmt --check
```

Test fixtures in `test/fixtures/` are real tiles pulled from
`tile.openstreetmap.org`, checked in so the test suite never touches the
network.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) before opening a PR, and
[CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) for community expectations. Report
security issues per [SECURITY.md](../../SECURITY.md) rather than in a public issue.

## Legal

The default tile source, `tile.openstreetmap.org`, is volunteer-funded and
governed by a strict [usage policy](https://operations.osmfoundation.org/policies/tiles/):
a descriptive `User-Agent` is required, heavy/production automated use is not
welcome, and attribution is required on every rendered image. Set
`userAgent` to something that identifies your app, and for production use
consider self-hosting tiles or a paid provider (MapTiler, Stadia,
Thunderforest).

### Other tile styles

The default style is intentionally "busy" — it's the only one OSM's own
infrastructure serves. A cleaner/more minimal look (Positron, Voyager,
Toner-style, ...) always means a third-party tile provider on top of OSM's
data, each with its own terms:

- [CARTO](https://carto.com/basemaps)'s Positron/Voyager tiles don't need an
  API key to fetch, but their free tier is scoped to "CARTO grantees"
  (nonprofit/education) — check their current terms before shipping it in a
  product.
- [Stadia Maps](https://stadiamaps.com)' "Alidade Smooth" is clean and
  minimal, but needs a free API key for anything beyond limited local
  testing.

See `examples/custom-style.ts` for the latter — same `tileUrl`/`attribution`
options, just pointed at a different provider.

## License

MIT
