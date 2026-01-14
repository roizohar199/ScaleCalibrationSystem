import { getFontDataUrl, getFontFamily } from "./embeddedFont.js";
import { getLogoDataUrl } from "./embeddedLogo.js";

type CertificatePdfModel = {
  title: string;
  certificateNo: string;
  customerName: string;
  customerId?: string;
  scaleManufacturer?: string;
  scaleModel?: string;
  scaleSerial?: string;
  location?: string;
  date: string;
  blocks: Array<{ label: string; value: string }>;
  tables?: Array<{
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
  }>;
};

export function buildCertificateHtml(model: CertificatePdfModel, options?: { reverseDataTables?: boolean; reverseMetaTables?: boolean; logoPosition?: 'pdf' | 'docx' }): string {
  console.log(`[buildCertificateHtml] Building HTML for certificate ${model.certificateNo}`);
  
  // Validate model
  if (!model) {
    throw new Error("Certificate model is required");
  }
  if (!model.title || !model.certificateNo || !model.customerName) {
    throw new Error("Certificate model missing required fields: title, certificateNo, customerName");
  }
  
  const reverseDataTables = options?.reverseDataTables ?? false;
  const reverseMetaTables = options?.reverseMetaTables ?? false;
  const logoPosition = options?.logoPosition ?? 'pdf';

  // Get embedded font or use system fonts
  const fontDataUrl = getFontDataUrl();
  const fontFamily = getFontFamily();
  
  if (fontDataUrl) {
    console.log(`[buildCertificateHtml] Using embedded font (Base64 length: ${fontDataUrl.length})`);
  } else {
    console.log(`[buildCertificateHtml] Using system fonts: ${fontFamily}`);
  }

  // Get logo data URL
  const logoDataUrl = getLogoDataUrl();
  if (logoDataUrl) {
    console.log(`[buildCertificateHtml] Logo found and will be included in certificate`);
  } else {
    console.log(`[buildCertificateHtml] Logo not found, certificate will be generated without logo`);
  }

  const blocksTableHtml = model.blocks.length > 0 ? `
    <table dir="rtl" style="width: 100%; border-collapse: collapse; direction: rtl; unicode-bidi: embed; margin-top: 8px; border: 1px solid #e5e7eb;">
      <tbody>
        ${model.blocks.map((b) => {
          if (reverseMetaTables) {
            return `
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top; white-space: pre-wrap; word-break: break-word;">${escapeHtml(b.value)}</td>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">${escapeHtml(b.label)}</th>
          </tr>
        `;
          } else {
            return `
          <tr>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">${escapeHtml(b.label)}</th>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top; white-space: pre-wrap; word-break: break-word;">${escapeHtml(b.value)}</td>
          </tr>
        `;
          }
        }).join("")}
      </tbody>
    </table>
  ` : "";

  const tablesHtml = (model.tables ?? [])
    .map((t) => {
      // Reverse columns and rows for RTL display only if reverseDataTables is true
      const columns = reverseDataTables ? [...t.columns].reverse() : t.columns;
      const rows = reverseDataTables ? t.rows.map(row => [...row].reverse()) : t.rows;
      
      const head = columns
        .map((c) => `<th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700;">${escapeHtml(c)}</th>`)
        .join("");
      const body = rows
        .map(
          (r) =>
            `<tr>${r
              .map((cell) => `<td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(String(cell))}</td>`)
              .join("")}</tr>`
        )
        .join("");

      return `
        <div class="section">
          <div class="sectionTitle" style="font-size: 14px; font-weight: 700; margin-bottom: 12px; padding: 8px 12px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; text-align: right; direction: rtl; unicode-bidi: embed;">${escapeHtml(t.title)}</div>
          <table dir="rtl" style="width: 100%; border-collapse: collapse; direction: rtl; unicode-bidi: embed; margin-top: 8px; border: 1px solid #e5e7eb;">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `;
    })
    .join("");

  // Build @font-face CSS if we have embedded font
  const fontFaceCss = fontDataUrl 
    ? `@font-face {
      font-family: "HebrewFont";
      src: url("${fontDataUrl}") format("opentype");
      font-weight: 400;
      font-style: normal;
    }`
    : '';

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    ${fontFaceCss}

    * { box-sizing: border-box; }
    html, body { height: 100%; }

    body {
      font-family: ${fontFamily};
      direction: rtl;
      unicode-bidi: embed;
      margin: 0;
      padding: 24px;
      color: #111;
      font-size: 12.5px;
      line-height: 1.35;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
      text-align: right;
      position: relative;
    }

    .header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 12px;
      margin-bottom: 14px;
      position: relative;
      clear: both;
    }
    
    ${logoDataUrl ? `
    .header {
      margin-top: ${logoPosition === 'pdf' ? '160px' : '0'};
    }
    ${logoPosition === 'docx' ? `
    .companyInfo {
      width: 100%;
      text-align: center;
      direction: rtl;
      margin: 0;
      padding: 0;
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 1.6;
    }
    .companyInfo p {
      margin: 0;
      padding: 0;
      text-align: center;
    }
    .title {
      text-align: center;
    }
    ` : `
    .logoContainer {
      left: 0;
      padding-left: 10px;
    }
    `}
    ` : ''}

    .headerTop {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 8px;
      width: 100%;
    }

    .logoContainer {
      position: absolute;
      top: -24px;
      left: 0;
      z-index: 10;
      display: inline-block;
      vertical-align: top;
      margin: 0;
      padding: 0;
      width: auto;
      height: auto;
    }

    .logoContainer img {
      max-height: 150px;
      max-width: 300px;
      height: auto;
      width: auto;
      object-fit: contain;
      display: block;
    }

    .title { font-size: 18px; font-weight: 700; flex: 1; }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 14px;
      font-size: 12px;
      color: #222;
    }

    .metaItem {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 10px;
      border: 1px solid #eee;
      border-radius: 8px;
      background: #fafafa;
    }

    .metaKey { color: #444; font-weight: 700; }
    .metaVal { color: #111; }

    .section { margin-top: 14px; }
    .sectionTitle {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      padding: 6px 10px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 10px;
      padding: 8px 10px;
      border-bottom: 1px dashed #eee;
    }

    .label { font-weight: 700; color: #222; white-space: nowrap; }

    /* critical for spaces + newlines */
    .value {
      color: #111;
      white-space: pre-wrap;
      word-break: break-word;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
      margin-top: 8px;
      direction: rtl;
    }

    th, td {
      border: 1px solid #e5e7eb;
      padding: 8px 8px;
      text-align: right;
      vertical-align: top;
      white-space: nowrap;
    }

    th { background: #f9fafb; font-weight: 700; }

    .footer {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      color: #444;
      font-size: 11px;
    }
  </style>
</head>
<body>
  ${logoPosition === 'docx' ? `<div class="companyInfo" style="text-align: center; direction: rtl;"><p style="text-align: center; margin: 0; padding: 0;">ניוטק איילון בע"מ</p><p style="text-align: center; margin: 0; padding: 0;">החרושת 12 כפר סבא</p><p style="text-align: center; margin: 0; padding: 0;">09-7666789</p></div>` : (logoDataUrl ? `<div class="logoContainer"><img src="${logoDataUrl}" alt="Logo" style="max-height: 150px; max-width: 300px; height: auto; width: auto; display: block;" /></div>` : '')}
  <div class="header">
    <div class="headerTop">
      <div class="title">${escapeHtml(model.title)}</div>
    </div>

    <table dir="rtl" style="width: 100%; border-collapse: collapse; direction: rtl; unicode-bidi: embed; margin-top: 8px; border: 1px solid #e5e7eb;">
      <tbody>
        ${reverseMetaTables ? `
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.certificateNo)}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">מספר תעודה</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.date)}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">תאריך</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerName)}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">לקוח</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerId ?? "-")}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מס׳ לקוח</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleManufacturer ?? "-")}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">יצרן</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleModel ?? "-")}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">דגם</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleSerial ?? "-")}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">סידורי</th></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.location ?? "-")}</td><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מיקום</th></tr>
        ` : `
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">מספר תעודה</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.certificateNo)}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">תאריך</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.date)}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">לקוח</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerName)}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מס׳ לקוח</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerId ?? "-")}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">יצרן</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleManufacturer ?? "-")}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">דגם</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleModel ?? "-")}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">סידורי</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleSerial ?? "-")}</td></tr>
        <tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מיקום</th><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.location ?? "-")}</td></tr>
        `}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="sectionTitle" style="font-size: 14px; font-weight: 700; margin-bottom: 12px; padding: 8px 12px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; text-align: right; direction: rtl; unicode-bidi: embed;">פרטי בדיקה</div>
    ${blocksTableHtml}
  </div>

  ${tablesHtml}

  <div class="footer">מסמך זה הופק דיגיטלית מתוך המערכת.</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
