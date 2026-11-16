import type { Canvas } from "./canvas.ts";
import { parseColor } from "./line.ts";

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

/**
 * A tiny 5x7 pixel font, hand-drawn as ASCII art (# = lit, . = off) so each
 * glyph's source reads as the letter it draws. Covers A-Z, a-z, digits,
 * and the punctuation a tile-attribution string, a route title, or a
 * distance/elevation stat is likely to need.
 */
const GLYPHS_ASCII: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
  ".": [".....", ".....", ".....", ".....", ".....", "..#..", "....."],
  "©": [".###.", "#...#", "#.#.#", "#.#..", "#.#.#", "#...#", ".###."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."],
  ":": [".....", ".....", "..#..", ".....", "..#..", ".....", "....."],
  "/": [".....", "....#", "...#.", "..#..", ".#...", "#....", "....."],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],

  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "#....", "####.", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],

  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],

  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".####"],
  f: ["..##.", ".#..#", ".#...", "###..", ".#...", ".#...", ".#..."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#...#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "####.", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", ".####", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: ["..#..", "..#..", "#####", "..#..", "..#..", "..#..", "...##"],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", "#...#", "#...#", "#...#", "#...#", ".####", "....#"],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
};

/** Extra punctuation and symbols that GPX names and custom titles commonly contain. */
const GLYPHS_SYMBOLS: Record<string, string[]> = {
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
  ";": [".....", ".....", "..#..", ".....", "..#..", "..#..", ".#..."],
  "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "°": [".##..", "#..#.", "#..#.", ".##..", ".....", ".....", "....."],
  "·": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
  "€": ["..###", ".#...", "####.", ".#...", "####.", ".#...", "..###"],
  ç: [".....", ".####", "#....", "#....", ".####", "..#..", ".##.."],
  Ç: [".####", "#....", "#....", "#....", "#....", ".####", "..##."],
  œ: [".....", ".....", ".#.#.", "#.#.#", "#.###", "#.#..", ".#.##"],
  Œ: [".####", "#.#..", "#.#..", "#.###", "#.#..", "#.#..", ".####"],
  æ: [".....", ".....", "##.#.", "..#.#", ".####", "#.#..", ".####"],
  Æ: [".####", "#.#..", "#.#..", "#####", "#.#..", "#.#..", "#.###"],
  ß: [".##..", "#..#.", "#.#..", "#..#.", "#...#", "#...#", "#.##."],
  ÿ: [".#.#.", ".....", "#...#", "#...#", ".####", "....#", ".###."],
};

/**
 * Accented Latin letters are composed from an accent mark stacked on a
 * base letter. Lowercase letters have a 5-row x-height, leaving two rows
 * above for the accent; uppercase ones get a 1-row accent over a 6-row
 * version of the capital.
 */
const LOWER_ACCENTS: Record<string, [string, string]> = {
  "\u0301": ["...#.", "..#.."], // acute
  "\u0300": [".#...", "..#.."], // grave
  "\u0302": ["..#..", ".#.#."], // circumflex
  "\u0308": [".#.#.", "....."], // diaeresis
  "\u0303": [".##.#", "#.##."], // tilde
};
const UPPER_ACCENTS: Record<string, string> = {
  "\u0301": "...#.",
  "\u0300": ".#...",
  "\u0302": "..#..",
  "\u0308": ".#.#.",
  "\u0303": ".##.#",
};
const LOWER_BASES: Record<string, string[]> = {
  a: GLYPHS_ASCII.a!.slice(2),
  e: GLYPHS_ASCII.e!.slice(2),
  i: GLYPHS_ASCII.i!.slice(2), // dotless i
  o: GLYPHS_ASCII.o!.slice(2),
  u: GLYPHS_ASCII.u!.slice(2),
  n: GLYPHS_ASCII.n!.slice(2),
};
const UPPER_BASES: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#"],
  E: ["#####", "#....", "####.", "#....", "#....", "#####"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "#####"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", ".###."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  Y: ["#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
};

function composeAccented(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [mark, accent] of Object.entries(LOWER_ACCENTS)) {
    for (const [base, rows] of Object.entries(LOWER_BASES)) {
      const ch = (base + mark).normalize("NFC");
      if (ch.length === 1) out[ch] = [...accent, ...rows];
    }
  }
  for (const [mark, accent] of Object.entries(UPPER_ACCENTS)) {
    for (const [base, rows] of Object.entries(UPPER_BASES)) {
      const ch = (base + mark).normalize("NFC");
      if (ch.length === 1) out[ch] = [accent, ...rows];
    }
  }
  return out;
}

/** Drawn for any character the font can't otherwise represent, so nothing is silently dropped. */
const REPLACEMENT_GLYPH = ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"];

/** Typographic variants mapped onto the plain glyph that best stands in for them. */
const ALIASES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u2032": "'",
  "`": "'",
  "\u00b4": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u00ab": '"',
  "\u00bb": '"',
  "\u2033": '"',
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u00a0": " ",
  "\u202f": " ",
  "\u2009": " ",
  "\u2007": " ",
  "\u2002": " ",
  "\u2003": " ",
  "\u00d7": "x",
  "\u2022": "\u00b7",
  "\u2026": ".",
  "\t": " ",
  // Letters with a stroke rather than a combining diacritic, which NFD can't strip.
  ł: "l",
  Ł: "L",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ı: "i",
  ħ: "h",
  Ħ: "H",
};

function parseGlyph(rows: readonly string[]): boolean[] {
  const bits: boolean[] = [];
  for (const row of rows) {
    for (const ch of row) bits.push(ch === "#");
  }
  return bits;
}

const GLYPHS = new Map<string, boolean[]>(
  Object.entries({ ...GLYPHS_ASCII, ...GLYPHS_SYMBOLS, ...composeAccented() }).map(([ch, rows]) => [
    ch,
    parseGlyph(rows),
  ]),
);
const REPLACEMENT = parseGlyph(REPLACEMENT_GLYPH);
const COMBINING_MARK = /\p{M}/u;

/** Whether `ch` (a single code point) has its own glyph, without any fallback. */
export function hasGlyph(ch: string): boolean {
  return GLYPHS.has(ch);
}

/**
 * Resolves each character of `text` to the glyph that will draw it:
 * its own glyph, else a typographic alias, else its letter with the
 * diacritics stripped (e.g. "ł"→"l", "Ő"→"O"), else a visible box.
 * Combining marks left over after NFC normalization are dropped, since
 * the letter they decorate is still drawn.
 */
function layoutGlyphs(text: string): boolean[][] {
  const glyphs: boolean[][] = [];
  for (const raw of text.normalize("NFC")) {
    if (COMBINING_MARK.test(raw)) continue;
    const ch = ALIASES[raw] ?? raw;
    const glyph =
      GLYPHS.get(ch) ?? GLYPHS.get(ch.normalize("NFD").replace(/\p{M}/gu, "")) ?? REPLACEMENT;
    glyphs.push(glyph);
  }
  return glyphs;
}

export interface TextStyle {
  color?: string;
  scale?: number;
  opacity?: number;
}

/** The pixel size a string of `text` will occupy when drawn at the given scale. */
export function measureText(text: string, scale = 1): { width: number; height: number } {
  const count = layoutGlyphs(text).length;
  if (count === 0) return { width: 0, height: GLYPH_HEIGHT * scale };
  const advance = (GLYPH_WIDTH + 1) * scale;
  return { width: count * advance - scale, height: GLYPH_HEIGHT * scale };
}

/**
 * Draws `text` with its top-left corner at (x, y). Never throws: accented
 * letters, symbols and typographic punctuation have glyphs or fallbacks,
 * and anything else is drawn as a visible box rather than silently
 * dropped (attribution text is a policy requirement, not decoration).
 */
export function drawText(
  canvas: Canvas,
  text: string,
  x: number,
  y: number,
  style: TextStyle = {},
): void {
  const scale = style.scale ?? 1;
  const opacity = style.opacity ?? 1;
  const [r, g, b] = parseColor(style.color ?? "#000000");

  let cursorX = x;
  for (const glyph of layoutGlyphs(text)) {
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        if (!glyph[row * GLYPH_WIDTH + col]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            canvas.blend(cursorX + col * scale + sx, y + row * scale + sy, r, g, b, opacity);
          }
        }
      }
    }
    cursorX += (GLYPH_WIDTH + 1) * scale;
  }
}
