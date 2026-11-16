---
"gpxsnap": minor
---

Tileless / offline rendering (#17): `tileUrl: false` skips tile fetching entirely and draws the route on a transparent canvas, or on a solid color with the new `background` option (e.g. `"#ffffff"`). No network request is made, `maxTiles` doesn't apply, and attribution defaults off since there's no map data to credit (an explicit `attribution` is still stamped).
