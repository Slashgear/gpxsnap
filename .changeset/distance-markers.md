---
"gpxsnap": minor
---

Add `distanceMarkers` to `renderRoute`/`renderGpx`: tick marks every
`interval` (default 5) `unit` (default `"km"`) of real-world route
distance, perpendicular to the route at that point, with an optional
distance label. Placed per track — no marker spans the gap between
disconnected tracks. It's purely coordinate-based (no elevation/timestamp
data needed), so — unlike `stats`/`elevationProfile`/`legend` — it's
available on `renderRoute` as well as `renderGpx`.
