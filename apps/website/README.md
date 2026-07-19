# gpxsnap-website

The [gpxsnap](https://github.com/Slashgear/gpxsnap) landing page and
in-browser demo, built with [Astro](https://astro.build). Deployed to
GitHub Pages at https://gpx.slashgear.dev/.

This is a private, unpublished workspace package (see `.changeset/config.json`'s
`ignore` list) — it's part of the monorepo but never versioned or shipped to npm.

`gpxsnap` is a `workspace:*` dependency here, so the demo always runs
against the current local library code, not the last published npm
version.

gpxsnap (and this demo) only render GPX tracks — they don't edit them. If
you need to trim, merge, simplify, or otherwise manipulate a track first,
[gpx.studio](https://gpx.studio/) is a great free tool for that.

## Commands

Run from the repo root (or here directly — Bun resolves the workspace
either way):

```bash
bun run dev       # local dev server
bun run build     # production build to dist/
bun run preview   # preview the production build locally
bun run typecheck # astro check
```
