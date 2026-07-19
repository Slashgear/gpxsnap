import type { Canvas } from "./canvas.ts";
import { drawText, measureText } from "./font.ts";
import { parseColor } from "./line.ts";

export type BadgeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface BadgeStyle {
  scale?: number;
  padding?: number;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

const DEFAULT_SCALE = 2;
const DEFAULT_PADDING = 4;
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_OPACITY = 0.65;

/** The badge's own plate size (unclamped to any canvas) — lets other overlays (e.g. the elevation profile) reserve space so they don't render underneath it. */
export function measureBadgeSize(
  text: string,
  style: BadgeStyle = {},
): { width: number; height: number } {
  const scale = style.scale ?? DEFAULT_SCALE;
  const padding = style.padding ?? DEFAULT_PADDING;
  const { width: textWidth, height: textHeight } = measureText(text, scale);
  return { width: textWidth + padding * 2, height: textHeight + padding * 2 };
}

/** Draws a translucent background plate with `text` on top, anchored to one corner of the canvas. */
export function drawBadge(
  canvas: Canvas,
  text: string,
  corner: BadgeCorner,
  style: BadgeStyle = {},
): void {
  const scale = style.scale ?? DEFAULT_SCALE;
  const padding = style.padding ?? DEFAULT_PADDING;
  const { width: rawWidth, height: rawHeight } = measureBadgeSize(text, style);

  const barWidth = Math.min(canvas.width, rawWidth);
  const barHeight = Math.min(canvas.height, rawHeight);
  const barX = corner === "top-right" || corner === "bottom-right" ? canvas.width - barWidth : 0;
  const barY =
    corner === "bottom-left" || corner === "bottom-right" ? canvas.height - barHeight : 0;

  const [br, bg, bb] = parseColor(style.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  const backgroundOpacity = style.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY;
  for (let y = barY; y < barY + barHeight; y++) {
    for (let x = barX; x < barX + barWidth; x++) {
      canvas.blend(x, y, br, bg, bb, backgroundOpacity);
    }
  }

  drawText(canvas, text, barX + padding, barY + padding, {
    scale,
    color: style.textColor ?? DEFAULT_TEXT_COLOR,
    opacity: 1,
  });
}
