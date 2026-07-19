# gpxsnap

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
