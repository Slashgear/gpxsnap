import { renderGpx } from "gpxsnap/gpx";

const form = document.getElementById("demo-form") as HTMLFormElement;
const fileInput = document.getElementById("gpx-file") as HTMLInputElement;
const widthInput = document.getElementById("width") as HTMLInputElement;
const heightInput = document.getElementById("height") as HTMLInputElement;
const colorInput = document.getElementById("line-color") as HTMLInputElement;
const pixelRatioInput = document.getElementById("pixel-ratio") as HTMLSelectElement;
const simplifyInput = document.getElementById("simplify") as HTMLInputElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
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
    const png = await renderGpx(gpxContents, {
      width: Number(widthInput.value),
      height: Number(heightInput.value),
      pixelRatio: Number(pixelRatioInput.value),
      padding: 30,
      simplify: Number(simplifyInput.value) || undefined,
      line: { color: colorInput.value },
      title: showTitleInput.checked ? titleInput.value.trim() || undefined : false,
      markers: showMarkersInput.checked,
      stats: showStatsInput.checked,
      elevationProfile: showElevationProfileInput.checked,
      attribution: showAttributionInput.checked,
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

    statusEl.textContent = "";
  } catch (error) {
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    submitButton.disabled = false;
  }
});
