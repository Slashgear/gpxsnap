import { renderRoute } from "../src/index.ts";

// width/height are already fully free-form — this is just a sensible preset
// for a vertical Story/Reel (Instagram, TikTok, YouTube Shorts), 1080x1920
// (9:16) being the platforms' own recommended export size.
const coordinates: [number, number][] = [
  [2.3491, 48.853],
  [2.3376, 48.8592],
  [2.3364, 48.8606],
  [2.3266, 48.8611],
  [2.3055, 48.8656],
  [2.2951, 48.8738],
  [2.2986, 48.8867],
];

const png = await renderRoute({
  coordinates,
  width: 1080,
  height: 1920,
  padding: 80,
});

await Bun.write("examples/output-social-story.png", png);
console.log(`Wrote examples/output-social-story.png (${png.length} bytes)`);
