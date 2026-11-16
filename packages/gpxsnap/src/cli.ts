#!/usr/bin/env bun
/**
 * `gpxsnap` command-line entry point: renders a GPX file to an image.
 *
 *   bunx gpxsnap route.gpx -o out.png --width 1200 --height 630 --stats
 *
 * Built on `node:util`'s `parseArgs` and `node:fs/promises`, so it runs the
 * same on Bun, Node (>= 22.18, native TypeScript) and Deno, with no
 * argument-parsing dependency.
 */
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderGpx } from "./gpx.ts";
import type { RenderGpxOptions } from "./gpx.ts";
import type { StatsField } from "./statistics.ts";
import { BASEMAP_NAMES } from "./basemaps.ts";

export const USAGE = `Usage: gpxsnap <input.gpx> [options]

Renders a GPX route to a PNG (or WebP/JPEG on Bun).

Output
  -o, --output <file>        Output file (default: <input> with the format's extension)
      --width <px>           Image width (default: 800)
      --height <px>          Image height (default: 600)
      --pixel-ratio <n>      Resolution multiplier, e.g. 2 for retina (default: 1)
      --format <fmt>         png | webp | jpeg (default: png, or from --output's extension)
      --quality <1-100>      WebP/JPEG quality

Map
      --basemap <name>       Keyless tile preset: osm, esri-topo, esri-topo-relief,
                             esri-light-gray, ign-plan, ign-plan-relief
                             (esri-* need Bun; ign-* cover France only)
      --tile-url <template>  XYZ tile URL template (default: OpenStreetMap)
      --overlay-url <tmpl>   Second tile layer drawn over the map (e.g. hillshade)
      --overlay-opacity <n>  Overlay strength, 0-1 (default: 1)
      --overlay-blend <mode> normal | multiply (multiply suits hillshade)
      --no-overlay           Drop the preset's overlay
      --tile-fade <n>        Soften the map's colors, 0-1 (default: 0)
      --max-zoom <n>         Never frame the route closer than this zoom
      --no-tiles             Draw without any basemap (no network request)
      --background <color>   Hex background color, e.g. "#ffffff" (default: transparent)
      --attribution <text>   Attribution text for a non-OSM tile source
      --no-attribution       Omit the attribution stamp
      --user-agent <ua>      User-Agent sent with tile requests
      --padding <px>         Margin around the route (default: 40)

Route
      --line-color <color>   Route color, e.g. "#e74c3c"
      --line-width <px>      Route width
      --color-by <mode>      length | elevation | speed
      --simplify <meters>    Simplify the route before drawing
      --no-markers           Omit start/end markers

Overlays
      --title <text>         Title badge (default: the GPX name)
      --no-title             Omit the title badge
      --stats                Stats badge (distance and elevation gain/loss)
      --stats-fields <list>  Stats to show, comma-separated (implies --stats):
                             distance,elevation,elevationRange,grade,
                             duration,movingTime,speed,pace
      --elevation-profile    Mini elevation chart along the bottom
      --legend               Track legend (multi-track files only)

      --help                 Show this help
`;

const STATS_FIELDS: readonly StatsField[] = [
  "distance",
  "elevation",
  "elevationRange",
  "grade",
  "duration",
  "movingTime",
  "speed",
  "pace",
];
const FORMATS = ["png", "webp", "jpeg"] as const;
type Format = (typeof FORMATS)[number];
const COLOR_BY = ["length", "elevation", "speed"] as const;
const OVERLAY_BLENDS = ["normal", "multiply"] as const;

export interface CliInvocation {
  input: string;
  output: string;
  options: RenderGpxOptions;
}

export class CliUsageError extends Error {}

function toNumber(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) {
    throw new CliUsageError(`--${flag} must be a number, got "${value}"`);
  }
  return n;
}

function oneOf<T extends string>(
  flag: string,
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CliUsageError(`--${flag} must be one of ${allowed.join(", ")}, got "${value}"`);
  }
  return value as T;
}

function formatFromPath(path: string): Format | undefined {
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "jpg") return "jpeg";
  return (FORMATS as readonly string[]).includes(ext ?? "") ? (ext as Format) : undefined;
}

function replaceExtension(path: string, format: Format): string {
  const ext = format === "jpeg" ? "jpg" : format;
  return /\.[^./\\]+$/.test(path) ? path.replace(/\.[^./\\]+$/, `.${ext}`) : `${path}.${ext}`;
}

/** Turns argv (without the runtime/script entries) into render options. Returns `null` for `--help`. */
export function parseCliArgs(argv: readonly string[]): CliInvocation | null {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        output: { type: "string", short: "o" },
        width: { type: "string" },
        height: { type: "string" },
        "pixel-ratio": { type: "string" },
        format: { type: "string" },
        quality: { type: "string" },
        basemap: { type: "string" },
        "tile-url": { type: "string" },
        "overlay-url": { type: "string" },
        "overlay-opacity": { type: "string" },
        "overlay-blend": { type: "string" },
        "no-overlay": { type: "boolean" },
        "tile-fade": { type: "string" },
        "max-zoom": { type: "string" },
        "no-tiles": { type: "boolean" },
        background: { type: "string" },
        attribution: { type: "string" },
        "user-agent": { type: "string" },
        padding: { type: "string" },
        "line-color": { type: "string" },
        "line-width": { type: "string" },
        "color-by": { type: "string" },
        simplify: { type: "string" },
        "no-markers": { type: "boolean" },
        title: { type: "string" },
        "no-title": { type: "boolean" },
        "no-attribution": { type: "boolean" },
        stats: { type: "boolean" },
        "stats-fields": { type: "string" },
        "elevation-profile": { type: "boolean" },
        legend: { type: "boolean" },
        help: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
  const { values } = parsed;
  const { positionals } = parsed;

  if (values.help) return null;

  if (positionals.length === 0) throw new CliUsageError("missing input GPX file");
  if (positionals.length > 1) {
    throw new CliUsageError(
      `expected one input file, got ${positionals.length}: ${positionals.join(" ")}`,
    );
  }
  const input = positionals[0]!;

  const explicitFormat = oneOf("format", values.format, FORMATS);
  const format =
    explicitFormat ?? (values.output ? formatFromPath(values.output) : undefined) ?? "png";
  const output = values.output ?? replaceExtension(input, format);

  let statsFields: StatsField[] | undefined;
  if (values["stats-fields"] !== undefined) {
    statsFields = values["stats-fields"].split(",").map((f) => {
      const field = f.trim();
      if (!(STATS_FIELDS as readonly string[]).includes(field)) {
        throw new CliUsageError(
          `unknown stats field "${field}" (expected ${STATS_FIELDS.join(", ")})`,
        );
      }
      return field as StatsField;
    });
  }

  const line: RenderGpxOptions["line"] = {};
  if (values["line-color"] !== undefined) line.color = values["line-color"];
  const lineWidth = toNumber("line-width", values["line-width"]);
  if (lineWidth !== undefined) line.width = lineWidth;
  const colorBy = oneOf("color-by", values["color-by"], COLOR_BY);
  if (colorBy !== undefined) line.colorBy = colorBy;

  if (values["no-tiles"] && values["tile-url"] !== undefined) {
    throw new CliUsageError("--no-tiles and --tile-url can't be combined");
  }

  const options: RenderGpxOptions = {
    width: toNumber("width", values.width) ?? 800,
    height: toNumber("height", values.height) ?? 600,
    format,
  };
  const set = <K extends keyof RenderGpxOptions>(
    key: K,
    value: RenderGpxOptions[K] | undefined,
  ) => {
    if (value !== undefined) options[key] = value;
  };
  set("pixelRatio", toNumber("pixel-ratio", values["pixel-ratio"]));
  set("quality", toNumber("quality", values.quality));
  set("padding", toNumber("padding", values.padding));
  set("simplify", toNumber("simplify", values.simplify));
  set("tileUrl", values["no-tiles"] ? false : values["tile-url"]);
  set("basemap", oneOf("basemap", values.basemap, BASEMAP_NAMES));
  set("tileFade", toNumber("tile-fade", values["tile-fade"]));
  set("maxZoom", toNumber("max-zoom", values["max-zoom"]));
  const overlayBlend = oneOf("overlay-blend", values["overlay-blend"], OVERLAY_BLENDS);
  const overlayOpacity = toNumber("overlay-opacity", values["overlay-opacity"]);
  if (values["no-overlay"]) {
    if (values["overlay-url"] !== undefined) {
      throw new CliUsageError("--no-overlay and --overlay-url can't be combined");
    }
    options.overlay = false;
  } else if (values["overlay-url"] !== undefined) {
    options.overlay = {
      tileUrl: values["overlay-url"],
      opacity: overlayOpacity,
      blend: overlayBlend,
    };
  } else if (overlayBlend !== undefined || overlayOpacity !== undefined) {
    throw new CliUsageError("--overlay-opacity and --overlay-blend need --overlay-url");
  }
  set("background", values.background);
  set("userAgent", values["user-agent"]);
  set("attribution", values.attribution);
  if (Object.keys(line).length > 0) options.line = line;
  if (values["no-markers"]) options.markers = false;
  if (values["no-title"] && values.title !== undefined) {
    throw new CliUsageError("--no-title and --title can't be combined");
  }
  if (values["no-attribution"] && values.attribution !== undefined) {
    throw new CliUsageError("--no-attribution and --attribution can't be combined");
  }
  if (values["no-title"]) options.title = false;
  else set("title", values.title);
  if (values["no-attribution"]) options.attribution = false;
  if (values.stats || statsFields) options.stats = true;
  set("statsFields", statsFields);
  if (values["elevation-profile"]) options.elevationProfile = true;
  if (values.legend) options.legend = true;

  return { input, output, options };
}

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Runs the CLI and returns the process exit code. */
export async function runCli(
  argv: readonly string[],
  io: CliIo = {
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
  },
): Promise<number> {
  let invocation: CliInvocation | null;
  try {
    invocation = parseCliArgs(argv);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    io.stderr(`gpxsnap: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (invocation === null) {
    io.stdout(USAGE);
    return 0;
  }

  try {
    const gpx = await readFile(invocation.input, "utf8");
    const image = await renderGpx(gpx, invocation.options);
    await writeFile(invocation.output, image);
    io.stdout(`${invocation.output}\n`);
    return 0;
  } catch (error) {
    io.stderr(`gpxsnap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** `import.meta.main` where the runtime has it, else compare against argv[1] (resolving the npm `bin` symlink). */
function isEntryPoint(): boolean {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
