---
"gpxsnap": minor
---

Add `gradient` to `LineStyle` (the `line` option): overrides `color`,
interpolating a list of hex color stops (or the built-in `"rainbow"`
preset) along the route's own on-canvas length. Resolved per rendered
segment, so it's smoothest on dense tracks. Needs no `<time>`/elevation
data, unlike speed-based coloring.
