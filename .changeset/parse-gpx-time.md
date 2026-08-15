---
"gpxsnap": minor
---

Parse `<time>` per GPX point. `GpxPoint` (and `parseGpxDocument`'s output)
now carries an optional `time` field — the raw ISO 8601 string from
`<trkpt>`/`<rtept>`'s `<time>` child, kept only when it parses as a valid
date. Not yet used by rendering — this is the foundation for upcoming
duration/speed/pace features.
