import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import type PDFDocument from "pdfkit";
import { hasHebrew, toPdfVisualText } from "./rtl";

type TextOpts = PDFKit.Mixins.TextOptions & {
  /**
   * If you want to force RTL even without Hebrew (rare), set true.
   */
  forceRtl?: boolean;
};

let fontRegistered = false;

function registerHebrewFontOnce(doc: PDFDocument) {
  if (fontRegistered) return;

  try {
    // FreeSans.otf locations (in order of preference):
    // 1. Repo root (from this file's location)
    // 2. apps/api/src/assets/fonts/ (fallback)
    // 3. process.cwd() (current working directory)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // From apps/api/src/utils/pdf/ -> go up 4 levels to repo root
    const repoRootPath = path.resolve(__dirname, "../../../../FreeSans.otf");
    // From apps/api/src/utils/pdf/ -> go to assets/fonts
    const assetsFontPath = path.resolve(__dirname, "../../assets/fonts/FreeSans.otf");
    const cwdPath = path.resolve(process.cwd(), "FreeSans.otf");
    
    // Try repo root first (most reliable)
    let fontPath: string | null = null;
    if (fs.existsSync(repoRootPath)) {
      fontPath = repoRootPath;
    } else if (fs.existsSync(assetsFontPath)) {
      fontPath = assetsFontPath;
    } else if (fs.existsSync(cwdPath)) {
      fontPath = cwdPath;
    }
    
    if (!fontPath) {
      throw new Error(`FreeSans.otf not found. Checked: ${repoRootPath}, ${assetsFontPath}, ${cwdPath}`);
    }
    
    doc.registerFont("Hebrew", fontPath);
    fontRegistered = true;
  } catch (err) {
    console.warn('[pdfText] Failed to register Hebrew font:', err);
    // Don't set fontRegistered = true, so we retry next time
  }
}

/**
 * Use instead of doc.text() for any content that may include Hebrew.
 * Keeps natural wrapping (spaces remain spaces) and fixes RTL order.
 */
export function pdfText(
  doc: PDFDocument,
  text: string,
  x?: number,
  y?: number,
  options?: TextOpts
) {
  const opts: TextOpts = { ...(options ?? {}) };

  const isRtl = opts.forceRtl === true || hasHebrew(text);

  if (isRtl) {
    registerHebrewFontOnce(doc);
    doc.font("Hebrew");
    // Key: visual text + right alignment
    const visual = toPdfVisualText(text);
    return doc.text(visual, x as any, y as any, {
      ...opts,
      align: opts.align ?? "right",
    });
  }

  return doc.text(text, x as any, y as any, opts);
}
