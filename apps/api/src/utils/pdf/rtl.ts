import bidiFactory from "bidi-js";

/**
 * PDFKit does NOT support RTL layout. We pre-shape the string using Unicode BiDi:
 * - compute embedding levels
 * - apply reorder segments (reverse ranges)
 * - apply mirrored characters map (e.g. parentheses)
 *
 * Based on bidi-js public API: factory() -> object with getEmbeddingLevels, getReorderSegments, getMirroredCharactersMap.
 */

const bidi = bidiFactory();

const HEBREW_RE = /[\u0590-\u05FF]/;

export function hasHebrew(input: string): boolean {
  return HEBREW_RE.test(input);
}

/**
 * Normalize whitespace without breaking wrapping:
 * - collapse multiple spaces/tabs into single spaces
 * - trim line edges
 */
function normalizeLineSpacing(line: string): string {
  return line
    .replace(/\u00A0/g, " ")        // NBSP -> normal space (avoid weird wrap behavior)
    .replace(/[ \t]+/g, " ")        // collapse
    .replace(/\s+$/g, "")           // trim end
    .replace(/^\s+/g, "");          // trim start
}

function reverseRange(chars: string[], start: number, end: number) {
  while (start < end) {
    const tmp = chars[start];
    chars[start] = chars[end];
    chars[end] = tmp;
    start++;
    end--;
  }
}

/**
 * Convert a single line to visual order for RTL.
 * We force paragraph direction = "rtl" for lines containing Hebrew.
 */
export function toVisualRtlLine(lineRaw: string): string {
  const line = normalizeLineSpacing(lineRaw);
  if (!line) return "";

  try {
    // embedding levels for the whole line (force rtl)
    const embeddingLevels = bidi.getEmbeddingLevels(line, "rtl");

    // reorder segments: list of [start,end] ranges to reverse (inclusive)
    const flips = bidi.getReorderSegments(line, embeddingLevels);

    const chars = Array.from(line);

    flips.forEach(([start, end]: [number, number]) => {
      reverseRange(chars, start, end);
    });

    // mirrored chars (parentheses etc.) where needed
    const mirrored = bidi.getMirroredCharactersMap(line, embeddingLevels);
    mirrored.forEach((replacement: string, charIndex: number) => {
      if (charIndex >= 0 && charIndex < chars.length) chars[charIndex] = replacement;
    });

    return chars.join("");
  } catch (e) {
    // Fallback: return original line if bidi processing fails
    console.warn('[rtl] BiDi processing failed, returning original:', e);
    return line;
  }
}

/**
 * Convert multi-line input preserving line breaks.
 * Only transform lines that contain Hebrew; leave LTR lines unchanged.
 */
export function toPdfVisualText(input: string): string {
  if (!input) return "";
  const lines = input.split(/\r?\n/);

  const out = lines.map((ln) => {
    const normalized = normalizeLineSpacing(ln);
    if (!normalized) return "";
    return hasHebrew(normalized) ? toVisualRtlLine(normalized) : normalized;
  });

  return out.join("\n");
}
