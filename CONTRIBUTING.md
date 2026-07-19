# Contributing to gpxsnap

Thanks for considering a contribution. This project deliberately keeps its
dependency count at zero, so the bar for adding one is very high — if you're
tempted to reach for a library, open an issue first to discuss it.

## Development setup

```bash
git clone https://github.com/Slashgear/gpxsnap.git
cd gpxsnap
bun install
```

## Before opening a PR

```bash
bun test          # tests must pass
bun run typecheck  # tsc --noEmit
bun run lint       # oxlint
bun run fmt:check  # oxfmt --check — run `bun run fmt` to fix
```

All four run in CI on every PR; a failing one will block merge.

## Project structure

- `src/png/` — the PNG codec (decode/encode/crc32). This is the part of the
  project worth taking most seriously — see the "hard part" note in the
  README.
- `src/tiles.ts` — slippy-map tile math and fetching.
- `src/line.ts`, `src/markers.ts`, `src/font.ts`, `src/attribution.ts` —
  route rendering.
- `src/gpx.ts` — the `gpxsnap/gpx` convenience entry point.
- `test/fixtures/` — real tiles and sample GPX files, checked in so the
  test suite never touches the network. `sample-ride.gpx` is a real ~1200
  point track, anonymized (no `<wpt>`, no timestamps) — if you add another
  real-world fixture, anonymize it the same way before committing; a raw
  `.gpx` dropped at the repo root is gitignored by default for exactly this
  reason.

## Tests

- Prefer real fixtures over synthetic data where practical (see
  `test/fixtures/`) — the PNG decoder in particular has already caught real
  bugs against real OSM tiles that synthetic test data wouldn't have caught.
- `test/render.test.ts` compares output against a checked-in golden PNG. If
  you intentionally change rendering output (line style, marker shape,
  attribution layout, etc.), regenerate it and explain why in the PR:

  ```bash
  bun -e '
  import { renderRoute } from "./src/index.ts";
  async function mockFetch() {
    const bytes = await Bun.file("test/fixtures/tile_13_4149_2818.png").arrayBuffer();
    return new Response(bytes, { status: 200 });
  }
  const png = await renderRoute({
    coordinates: [[2.3491, 48.853], [2.3376, 48.8592], [2.2986, 48.8867]],
    width: 400, height: 300, padding: 20,
    tileUrl: "https://example.invalid/{z}/{x}/{y}.png",
    fetchImpl: mockFetch, userAgent: "gpxsnap-tests",
  });
  await Bun.write("test/fixtures/golden_render.png", png);
  '
  ```

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`, ...).

## Releasing

Versioning and publishing are handled by [Changesets](https://github.com/changesets/changesets).
If your PR changes anything consumers would notice (a fix, a new option, a
behavior change), add a changeset:

```bash
bunx changeset
```

Pick a bump type (patch/minor/major — this project isn't at a stable 2.0 API
yet, so breaking changes still land as minor bumps per SemVer's `0.x`/`1.x`
convention where relevant) and describe the change. Commit the generated
`.changeset/*.md` file with your PR.

From there it's automatic: merging to `main` makes the release workflow open
or update a "Version Packages" PR that bumps the version and updates
`CHANGELOG.md`. Merging _that_ PR publishes to npm via
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) — no
npm token is stored in this repo.

## Design principles (read before adding scope)

- No dependencies, no native bindings. `fetch` and
  `CompressionStream`/`DecompressionStream` are the whole toolbox.
- Small, boundable pieces over general-purpose abstractions — e.g.
  `src/gpx.ts` extracts `<trkpt>` elements with a targeted regex rather than
  pulling in an XML parser, because that's the only thing a route preview
  actually needs.
- Respect the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
  attribution stays on by default, and a descriptive `User-Agent` is always
  sent.

## Reporting bugs / requesting features

Use the issue templates. For security issues, see [SECURITY.md](SECURITY.md)
instead of opening a public issue.
