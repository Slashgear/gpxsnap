---
"gpxsnap": minor
---

Richer route statistics (#16):

- `computeStatistics` now also returns raw min/max elevation, mean absolute grade, and — when points carry `<time>` — elapsed duration, moving time (segments slower than 0.5 m/s count as stopped) and average moving speed.
- New `statsFields` option on `renderGpx` picks what the stats badge shows, in order: `"distance"`, `"elevation"`, `"elevationRange"`, `"grade"`, `"duration"`, `"movingTime"`, `"speed"`, `"pace"`. The default (`["distance", "elevation"]`) keeps today's badge unchanged.
- `computeStatistics`, `formatStatistics` and the `RouteStatistics`/`StatsField` types are now exported from `gpxsnap/gpx`.
- The badge font gains `/` and `%` glyphs.
