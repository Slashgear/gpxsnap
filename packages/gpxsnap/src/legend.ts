import type { Canvas } from "./canvas.ts";
import { drawText, measureText } from "./font.ts";
import { parseColor } from "./line.ts";

export interface LegendEntry {
  color: string;
  label: string;
}

export interface LegendStyle {
  scale?: number;
  padding?: number;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  swatchSize?: number;
  /** Rows shown before the rest collapse into a single "+N more" row. */
  maxEntries?: number;
}

const DEFAULT_SCALE = 2;
const DEFAULT_PADDING = 4;
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_OPACITY = 0.65;
const DEFAULT_SWATCH_SIZE = 10;
const DEFAULT_MAX_ENTRIES = 6;
const ROW_GAP = 4;
const SWATCH_GAP = 4;

/**
 * Draws a translucent plate anchored to the bottom-left corner, one row per
 * track: a small color swatch and its name — the key to which color is
 * which track in a multi-track `renderGpx` render. Entries beyond
 * `maxEntries` collapse into a trailing "+N more" row rather than growing
 * the plate (and the image) without bound.
 */
export function drawLegend(
  canvas: Canvas,
  entries: readonly LegendEntry[],
  style: LegendStyle = {},
  pixelRatio = 1,
): void {
  if (entries.length === 0) return;

  const scale = (style.scale ?? DEFAULT_SCALE) * pixelRatio;
  const padding = (style.padding ?? DEFAULT_PADDING) * pixelRatio;
  const swatchSize = (style.swatchSize ?? DEFAULT_SWATCH_SIZE) * pixelRatio;
  const rowGap = ROW_GAP * pixelRatio;
  const swatchGap = SWATCH_GAP * pixelRatio;
  const maxEntries = style.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const visible = entries.slice(0, maxEntries);
  const overflow = entries.length - visible.length;
  const rows: { color?: string; label: string }[] = visible.map((e) => ({
    color: e.color,
    label: e.label,
  }));
  if (overflow > 0) rows.push({ label: `+${overflow} more` });

  const textHeight = measureText("Hg", scale).height;
  const rowHeight = Math.max(textHeight, swatchSize);
  const maxTextWidth = Math.max(...rows.map((r) => measureText(r.label, scale).width));

  const plateWidth = Math.min(
    canvas.width,
    Math.round(padding * 2 + swatchSize + swatchGap + maxTextWidth),
  );
  const plateHeight = Math.min(
    canvas.height,
    Math.round(padding * 2 + rows.length * rowHeight + (rows.length - 1) * rowGap),
  );
  const plateY = canvas.height - plateHeight;

  const [bgR, bgG, bgB] = parseColor(style.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  const backgroundOpacity = style.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY;
  for (let y = plateY; y < plateY + plateHeight; y++) {
    for (let x = 0; x < plateWidth; x++) {
      canvas.blend(x, y, bgR, bgG, bgB, backgroundOpacity);
    }
  }

  rows.forEach((row, i) => {
    const rowY = plateY + padding + i * (rowHeight + rowGap);
    if (row.color) {
      const [r, g, b] = parseColor(row.color);
      const swatchY = Math.round(rowY + (rowHeight - swatchSize) / 2);
      for (let sy = 0; sy < swatchSize; sy++) {
        for (let sx = 0; sx < swatchSize; sx++) {
          canvas.blend(Math.round(padding) + sx, swatchY + sy, r, g, b, 1);
        }
      }
    }
    const textX = Math.round(padding + swatchSize + swatchGap);
    const textY = Math.round(rowY + (rowHeight - textHeight) / 2);
    drawText(canvas, row.label, textX, textY, {
      scale,
      color: style.textColor ?? DEFAULT_TEXT_COLOR,
      opacity: 1,
    });
  });
}
