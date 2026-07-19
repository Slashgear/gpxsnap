import type { Canvas } from "./canvas.ts";
import { drawText, measureText } from "./font.ts";
import { parseColor } from "./line.ts";

export interface AttributionStyle {
  text?: string;
  scale?: number;
  padding?: number;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

const DEFAULT_TEXT = "© OpenStreetMap contributors";
const DEFAULT_SCALE = 2;
const DEFAULT_PADDING = 4;
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_OPACITY = 0.65;

/** Stamps a translucent attribution bar in the bottom-right corner, per the default tile source's usage policy. */
export function stampAttribution(canvas: Canvas, style: AttributionStyle = {}): void {
  const text = style.text ?? DEFAULT_TEXT;
  const scale = style.scale ?? DEFAULT_SCALE;
  const padding = style.padding ?? DEFAULT_PADDING;
  const { width: textWidth, height: textHeight } = measureText(text, scale);

  const barWidth = Math.min(canvas.width, textWidth + padding * 2);
  const barHeight = Math.min(canvas.height, textHeight + padding * 2);
  const barX = canvas.width - barWidth;
  const barY = canvas.height - barHeight;

  const [br, bg, bb] = parseColor(style.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  const backgroundOpacity = style.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY;
  for (let y = barY; y < canvas.height; y++) {
    for (let x = barX; x < canvas.width; x++) {
      canvas.blend(x, y, br, bg, bb, backgroundOpacity);
    }
  }

  drawText(canvas, text, barX + padding, barY + padding, {
    scale,
    color: style.textColor ?? DEFAULT_TEXT_COLOR,
    opacity: 1,
  });
}
