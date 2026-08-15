import { renderGpx } from "gpxsnap/gpx";

/**
 * No API key needed for any of these — all volunteer-run, same "descriptive
 * User-Agent, don't hammer it" etiquette as OSM's own default. CARTO/
 * MapTiler/Thunderforest (which do need a key) are README-only recipes, not
 * offered here: there's nowhere safe to hold a key in a public client-side
 * demo. `tileUrl: undefined` for "osm" lets gpxsnap use its own default.
 */
// Attribution strings are drawn with gpxsnap's own hand-drawn bitmap font
// (see font.ts), which has a limited character set — no "|", for instance.
const TILE_STYLES: Record<string, { tileUrl: string | undefined; attribution: string }> = {
  osm: { tileUrl: undefined, attribution: "© OpenStreetMap contributors" },
  opentopomap: {
    tileUrl: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors, SRTM - © OpenTopoMap (CC-BY-SA)",
  },
  cyclosm: {
    tileUrl: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors - Map style: © CyclOSM",
  },
};

interface SnippetOptions {
  width: number;
  height: number;
  pixelRatio: number;
  padding: number;
  simplify: number | undefined;
  tileUrl: string | undefined;
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
  title: string | false | undefined;
  markers: boolean;
  stats: boolean;
  elevationProfile: boolean;
  attribution: string | boolean;
}

/** Builds a copy-pasteable `renderGpx` call reflecting the demo form's current state. */
function buildSnippet(options: SnippetOptions): string {
  const lines = [
    `width: ${options.width},`,
    `height: ${options.height},`,
    `pixelRatio: ${options.pixelRatio},`,
    `padding: ${options.padding},`,
  ];
  if (options.simplify !== undefined) lines.push(`simplify: ${options.simplify},`);
  if (options.tileUrl !== undefined) lines.push(`tileUrl: ${JSON.stringify(options.tileUrl)},`);
  lines.push(
    `line: { color: ${JSON.stringify(options.lineColor)}, width: ${options.lineWidth}, opacity: ${options.lineOpacity} },`,
  );
  // `undefined` means "no explicit title" — renderGpx auto-fills it from the
  // GPX file's own name, so the field is omitted rather than written out.
  if (options.title !== undefined) lines.push(`title: ${JSON.stringify(options.title)},`);
  lines.push(`markers: ${options.markers},`);
  lines.push(`stats: ${options.stats},`);
  lines.push(`elevationProfile: ${options.elevationProfile},`);
  lines.push(
    `attribution: ${typeof options.attribution === "string" ? JSON.stringify(options.attribution) : options.attribution},`,
  );

  const indented = lines.map((line) => `  ${line}`).join("\n");
  return `import { renderGpx } from "gpxsnap/gpx";

const gpxContents = await Bun.file("route.gpx").text();

const png = await renderGpx(gpxContents, {
${indented}
});

await Bun.write("route.png", png);`;
}

const form = document.getElementById("demo-form") as HTMLFormElement;
const fileInput = document.getElementById("gpx-file") as HTMLInputElement;
const widthInput = document.getElementById("width") as HTMLInputElement;
const heightInput = document.getElementById("height") as HTMLInputElement;
const colorInput = document.getElementById("line-color") as HTMLInputElement;
const tileStyleInput = document.getElementById("tile-style") as HTMLSelectElement;
const pixelRatioInput = document.getElementById("pixel-ratio") as HTMLSelectElement;
const simplifyInput = document.getElementById("simplify") as HTMLInputElement;
const paddingInput = document.getElementById("padding") as HTMLInputElement;
const lineWidthInput = document.getElementById("line-width") as HTMLInputElement;
const lineOpacityInput = document.getElementById("line-opacity") as HTMLInputElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const attributionTextInput = document.getElementById("attribution-text") as HTMLInputElement;
const showTitleInput = document.getElementById("show-title") as HTMLInputElement;
const showStatsInput = document.getElementById("show-stats") as HTMLInputElement;
const showElevationProfileInput = document.getElementById(
  "show-elevation-profile",
) as HTMLInputElement;
const showAttributionInput = document.getElementById("show-attribution") as HTMLInputElement;
const showMarkersInput = document.getElementById("show-markers") as HTMLInputElement;
const statusEl = document.getElementById("demo-status")!;
const resultEl = document.getElementById("demo-result")!;
const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

let lastObjectUrl: string | null = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    statusEl.textContent = "Choose a .gpx file first.";
    return;
  }

  submitButton.disabled = true;
  statusEl.textContent = "Fetching tiles and rendering…";
  resultEl.replaceChildren();

  try {
    const gpxContents = await file.text();
    const title = showTitleInput.checked ? titleInput.value.trim() || undefined : false;
    const tileStyle = TILE_STYLES[tileStyleInput.value] ?? TILE_STYLES.osm!;
    const attribution = showAttributionInput.checked
      ? attributionTextInput.value.trim() || tileStyle.attribution
      : false;

    const png = await renderGpx(gpxContents, {
      width: Number(widthInput.value),
      height: Number(heightInput.value),
      pixelRatio: Number(pixelRatioInput.value),
      padding: Number(paddingInput.value),
      simplify: Number(simplifyInput.value) || undefined,
      tileUrl: tileStyle.tileUrl,
      line: {
        color: colorInput.value,
        width: Number(lineWidthInput.value),
        opacity: Number(lineOpacityInput.value),
      },
      title,
      markers: showMarkersInput.checked,
      stats: showStatsInput.checked,
      elevationProfile: showElevationProfileInput.checked,
      attribution,
    });

    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    const blob = new Blob([png as BlobPart], { type: "image/png" });
    lastObjectUrl = URL.createObjectURL(blob);

    const img = document.createElement("img");
    img.src = lastObjectUrl;
    img.alt = "Rendered route";
    resultEl.appendChild(img);

    const link = document.createElement("a");
    link.href = lastObjectUrl;
    link.download = "route.png";
    link.textContent = `Download PNG (${(png.length / 1024).toFixed(0)} KB)`;
    link.className = "button secondary";
    resultEl.appendChild(link);

    const snippet = buildSnippet({
      width: Number(widthInput.value),
      height: Number(heightInput.value),
      pixelRatio: Number(pixelRatioInput.value),
      padding: Number(paddingInput.value),
      simplify: Number(simplifyInput.value) || undefined,
      tileUrl: tileStyle.tileUrl,
      lineColor: colorInput.value,
      lineWidth: Number(lineWidthInput.value),
      lineOpacity: Number(lineOpacityInput.value),
      title,
      markers: showMarkersInput.checked,
      stats: showStatsInput.checked,
      elevationProfile: showElevationProfileInput.checked,
      attribution,
    });
    const codeBlock = document.createElement("pre");
    codeBlock.className = "snippet";
    const code = document.createElement("code");
    code.textContent = snippet;
    codeBlock.appendChild(code);
    resultEl.appendChild(codeBlock);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button secondary";
    copyButton.textContent = "Copy code";
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(snippet);
      copyButton.textContent = "Copied!";
      setTimeout(() => {
        copyButton.textContent = "Copy code";
      }, 1500);
    });
    resultEl.appendChild(copyButton);

    statusEl.textContent = "";
  } catch (error) {
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    submitButton.disabled = false;
  }
});
