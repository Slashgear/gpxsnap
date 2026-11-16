---
"gpxsnap": minor
---

New `gpxsnap` command (#18): `bunx gpxsnap route.gpx -o out.png --width 1200 --stats` renders a GPX file from the command line. Built on `node:util`'s `parseArgs` (no new dependency); flags map onto `renderGpx` options, including `--no-tiles`/`--background` for offline renders and `--stats-fields` for the richer statistics. Run `gpxsnap --help` for the full list.
