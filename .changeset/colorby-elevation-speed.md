---
"gpxsnap": minor
---

Add `colorBy` to `LineStyle`, reusing the existing `gradient` option (from
`pixelRatio`'s sibling feature, line gradients) as the color ramp:
`colorBy: "elevation" | "speed"` positions each point along `gradient` by
its own value, normalized to the route's own min/max, instead of position
along the route's length (the previous, still-default behavior). GPX-only
(needs `<ele>`/`<time>` data `renderRoute`'s bare coordinates don't carry)
and falls back silently to length-based coloring when there isn't enough
usable data, matching `stats`/`elevationProfile`'s existing convention.
