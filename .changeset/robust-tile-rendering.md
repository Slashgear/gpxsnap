---
"gpxsnap": minor
---

Harden rendering against bad input and flaky tile servers:

- `width`/`height` must now be integers from 1 to 4096 (NaN, 0, negative, fractional or huge values throw before any request), the physical canvas (`* pixelRatio`) is capped at 8192 px per side, and `padding` must be non-negative.
- New `maxTiles` option (default `100`): a render needing more tiles throws before fetching anything.
- Tile requests now time out (`tileTimeoutMs`, default 10 s) and are retried with backoff on network errors, timeouts, 429 and 5xx (`tileRetries`, default 2). `FetchLike` now receives an `AbortSignal`.
- New `onTileError: "skip"` leaves an unfetchable or undecodable tile blank instead of failing the whole render (default stays `"throw"`).
- New pluggable `tileCache` option plus a built-in `createMemoryTileCache()` LRU, to follow OSM's tile caching policy without adding dependencies.
- The PNG decoder rejects tiles that aren't a square standard/retina tile size, oversized images and truncated data from the IHDR, before allocating pixel buffers.
