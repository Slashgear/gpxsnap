import type { Canvas } from "./canvas.ts";
import { drawBadge } from "./badge.ts";

export interface AttributionStyle {
  text?: string;
  scale?: number;
  padding?: number;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

/** Exported so other overlays (the elevation profile) can size themselves around the attribution badge when the caller hasn't overridden its text. */
export const DEFAULT_ATTRIBUTION_TEXT = "© OpenStreetMap contributors";
const DEFAULT_TEXT = DEFAULT_ATTRIBUTION_TEXT;

/** Stamps a translucent attribution bar in the bottom-right corner, per the default tile source's usage policy. */
export function stampAttribution(canvas: Canvas, style: AttributionStyle = {}): void {
  drawBadge(canvas, style.text ?? DEFAULT_TEXT, "bottom-right", {
    scale: style.scale,
    padding: style.padding,
    textColor: style.textColor,
    backgroundColor: style.backgroundColor,
    backgroundOpacity: style.backgroundOpacity,
  });
}
