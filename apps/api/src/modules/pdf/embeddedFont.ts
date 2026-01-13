/**
 * Embedded Hebrew font - loaded from assets at initialization
 * This font is embedded in the code at build/init time, so it doesn't depend on external files at runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Font paths to check (relative to this file)
const fontPaths = [
  path.resolve(__dirname, "../../assets/fonts/FreeSans.otf"), // From pdf/ -> assets/fonts/
  path.resolve(process.cwd(), "FreeSans.otf"), // From project root
  path.resolve(process.cwd(), "apps/api/src/assets/fonts/FreeSans.otf"), // From monorepo root
];

// Cache the font Base64 string
let cachedFontBase64: string | null = null;

/**
 * Load and cache the font as Base64
 * This is called once at module initialization
 */
function loadEmbeddedFont(): string | null {
  if (cachedFontBase64 !== null) {
    return cachedFontBase64;
  }

  for (const fontPath of fontPaths) {
    try {
      if (fs.existsSync(fontPath)) {
        console.log(`[embeddedFont] Loading font from: ${fontPath}`);
        const fontBuffer = fs.readFileSync(fontPath);
        cachedFontBase64 = fontBuffer.toString("base64");
        console.log(`[embeddedFont] Font loaded successfully, Base64 length: ${cachedFontBase64.length}`);
        return cachedFontBase64;
      }
    } catch (error: any) {
      console.warn(`[embeddedFont] Failed to load font from ${fontPath}:`, error.message);
    }
  }

  console.warn(`[embeddedFont] Font file not found in any of the checked paths. Using system fonts.`);
  cachedFontBase64 = null;
  return null;
}

// Load font at module initialization
export const FONT_BASE64: string | null = loadEmbeddedFont();

/**
 * Get the font data URL for embedding in HTML
 * If font is embedded, returns data URL. Otherwise, returns null to use system fonts.
 */
export function getFontDataUrl(): string | null {
  if (FONT_BASE64) {
    return `data:font/otf;base64,${FONT_BASE64}`;
  }
  return null;
}

/**
 * Get the font-family CSS value
 * Uses embedded font if available, otherwise falls back to system fonts with Hebrew support
 */
export function getFontFamily(): string {
  if (FONT_BASE64) {
    return '"HebrewFont", Arial, "Noto Sans Hebrew", "David", sans-serif';
  }
  // Fallback to system fonts that support Hebrew
  return 'Arial, "Noto Sans Hebrew", "David", "Segoe UI", sans-serif';
}
