---
"gpxsnap": minor
---

Add `format`/`quality` to `renderRoute`/`renderGpx` for WebP/JPEG output on
Bun. The default PNG path is unchanged on every runtime — gpxsnap still
renders and encodes the same dependency-free PNG it always did. Requesting
`format: "webp" | "jpeg"` re-encodes those PNG bytes through Bun's native
`Bun.Image` (no npm dependency, built into the Bun binary); it's a Bun-only
enhancement, so requesting it on Node or Deno throws a clear error
immediately, before any tile fetching, rather than silently falling back.
