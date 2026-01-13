import bidiFactory from "bidi-js";

const bidi = bidiFactory();
const HEBREW_RE = /[\u0590-\u05FF]/;

export function containsHebrew(s: string): boolean {
  return typeof s === "string" && HEBREW_RE.test(s);
}

/**
 * Normalize spacing WITHOUT destroying line breaks:
 * - keeps \n
 * - collapses spaces/tabs inside each line
 * - preserves single spaces between words
 */
function normalizePerLine(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\u00A0/g, " ")     // NBSP -> space
        .replace(/[ \t]+/g, " ")     // collapse only spaces/tabs
        .replace(/^\s+|\s+$/g, "")   // trim line
    )
    .join("\n");
}

function reverseRange(chars: string[], start: number, end: number) {
  while (start < end) {
    const t = chars[start];
    chars[start] = chars[end];
    chars[end] = t;
    start++;
    end--;
  }
}

/**
 * Convert ONE line into visual order for RTL drawing in PDFKit.
 * PDFKit draws glyphs LTR; so we must pre-reorder.
 */
function toVisualRtlLine(line: string): string {
  if (!line) return "";

  // Force paragraph direction RTL for Hebrew-containing lines
  const embeddingLevels = bidi.getEmbeddingLevels(line, "rtl");
  const flips = bidi.getReorderSegments(line, embeddingLevels);

  const chars = Array.from(line);
  flips.forEach(([start, end]: [number, number]) => reverseRange(chars, start, end));

  // Mirror brackets etc. where BiDi requires
  const mirrored = bidi.getMirroredCharactersMap(line, embeddingLevels);
  mirrored.forEach((replacement: string, index: number) => {
    if (index >= 0 && index < chars.length) chars[index] = replacement;
  });

  return chars.join("");
}

/**
 * Public API used by PDF generator:
 * - preserves existing spaces/newlines
 * - applies visual RTL reorder only to lines that contain Hebrew
 */
export function preprocessHebrewText(input: string): string {
  if (!input || typeof input !== "string") return input;
  if (!containsHebrew(input)) return input;

  const normalized = normalizePerLine(input);

  return normalized
    .split(/\r?\n/)
    .map((line) => (containsHebrew(line) ? toVisualRtlLine(line) : line))
    .join("\n");
}

export default preprocessHebrewText;
