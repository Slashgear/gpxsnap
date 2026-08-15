---
"gpxsnap": minor
---

Add `legend` to `renderGpx` for multi-track files: a color-swatch-and-name
key stamped in the bottom-left corner, one row per track, only drawn when
the file has more than one track. Entries beyond `LegendStyle.maxEntries`
(default 6) collapse into a trailing "+N more" row instead of growing the
plate without bound.
