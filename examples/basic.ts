import { renderRoute } from "../src/index.ts";

// A short walk through central Paris: Notre-Dame -> Louvre -> Arc de Triomphe.
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
  width: 1200,
  height: 600,
  padding: 40,
});

await Bun.write("examples/output.png", png);
console.log(`Wrote examples/output.png (${png.length} bytes)`);
