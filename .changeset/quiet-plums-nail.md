---
"gpxsnap": patch
---

Fixed an algorithmic-complexity (quadratic-time) issue in the GPX tag scanner used by `parseGpxDocument`/`parseGpxTrackPoints`/`renderGpx`: malformed input with unclosed tags (e.g. a truncated `.gpx` upload) could take seconds to parse instead of milliseconds. The scanner now uses a linear `indexOf`-based forward scan instead of a backtracking regex. Also documented `parseGpxDocument`, `parseGpxTrackPoints`, and `extractGpxName` in the README — these were already exported from `gpxsnap/gpx` but undocumented.
