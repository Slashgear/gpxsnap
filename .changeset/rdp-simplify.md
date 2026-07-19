---
"gpxsnap": minor
---

Add a `simplify` option to `renderRoute`/`renderGpx`: a Ramer-Douglas-Peucker tolerance in meters that drops points deviating less than that amount from the line through their neighbors, before bounds fitting and rendering. Useful for dense recorded tracks (a real ~1200-point ride drops to ~270 points at a 10m tolerance) — the route still looks the same, with fewer segments to composite. Omit or pass 0 to render every point as recorded (the existing default behavior, unchanged).
