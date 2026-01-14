/**
 * Embedded Logo - loaded from LOGO directory at initialization
 * This logo is embedded in the code at build/init time, so it doesn't depend on external files at runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logo paths to check (relative to this file and project root)
const logoPaths = [
  path.resolve(process.cwd(), "LOGO/LOGO.jpg"), // From project root
  path.resolve(__dirname, "../../../../../LOGO/LOGO.jpg"), // From pdf/ -> LOGO/
  path.resolve(process.cwd(), "apps/api/LOGO/LOGO.jpg"), // Alternative location
];

// Cache the logo Base64 string
let cachedLogoBase64: string | null = null;

/**
 * Load and cache the logo as Base64
 * This is called once at module initialization
 */
function loadEmbeddedLogo(): string | null {
  if (cachedLogoBase64 !== null) {
    return cachedLogoBase64;
  }

  for (const logoPath of logoPaths) {
    try {
      if (fs.existsSync(logoPath)) {
        console.log(`[embeddedLogo] Loading logo from: ${logoPath}`);
        const logoBuffer = fs.readFileSync(logoPath);
        cachedLogoBase64 = logoBuffer.toString("base64");
        console.log(`[embeddedLogo] Logo loaded successfully, Base64 length: ${cachedLogoBase64.length}`);
        return cachedLogoBase64;
      }
    } catch (error: any) {
      console.warn(`[embeddedLogo] Failed to load logo from ${logoPath}:`, error.message);
    }
  }

  console.warn(`[embeddedLogo] Logo file not found in any of the checked paths. Certificates will be generated without logo.`);
  cachedLogoBase64 = null;
  return null;
}

// Load logo at module initialization
export const LOGO_BASE64: string | null = loadEmbeddedLogo();

/**
 * Get the logo data URL for embedding in HTML
 * If logo is embedded, returns data URL. Otherwise, returns null.
 */
export function getLogoDataUrl(): string | null {
  if (LOGO_BASE64) {
    return `data:image/jpeg;base64,${LOGO_BASE64}`;
  }
  return null;
}

/**
 * Get the logo file path (for file:// URLs if needed)
 * Returns the first valid path found, or null if not found
 */
export function getLogoPath(): string | null {
  for (const logoPath of logoPaths) {
    if (fs.existsSync(logoPath)) {
      return logoPath;
    }
  }
  return null;
}
