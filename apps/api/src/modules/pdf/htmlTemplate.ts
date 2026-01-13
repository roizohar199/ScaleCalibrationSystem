import { getFontDataUrl, getFontFamily } from "./embeddedFont.js";

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

export function buildCertificateHtml(model: CertificatePdfModel): string {
  console.log(`[buildCertificateHtml] Building HTML for certificate ${model.certificateNo}`);
  
  // Validate model
  if (!model) {
    throw new Error("Certificate model is required");
  }
  if (!model.title || !model.certificateNo || !model.customerName) {
    throw new Error("Certificate model missing required fields: title, certificateNo, customerName");
  }

  // Get embedded font or use system fonts
  const fontDataUrl = getFontDataUrl();
  const fontFamily = getFontFamily();
  
  if (fontDataUrl) {
    console.log(`[buildCertificateHtml] Using embedded font (Base64 length: ${fontDataUrl.length})`);
  } else {
    console.log(`[buildCertificateHtml] Using system fonts: ${fontFamily}`);
  }

  const blocksTableHtml = model.blocks.length > 0 ? `
    <table dir="rtl" style="width: 100%; border-collapse: collapse; direction: rtl; unicode-bidi: embed; margin-top: 8px; border: 1px solid #e5e7eb;">
      <tbody>
        ${model.blocks.map((b) => `
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top; white-space: pre-wrap; word-break: break-word;">${escapeHtml(b.value)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">${escapeHtml(b.label)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "";

  const tablesHtml = (model.tables ?? [])
    .map((t) => {
      const head = t.columns
        .map((c) => `<th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700;">${escapeHtml(c)}</th>`)
        .join("");
      const body = t.rows
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
    }

    .header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .title { font-size: 18px; font-weight: 700; }

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
  <div class="header">
    <div class="title">${escapeHtml(model.title)}</div>

    <table dir="rtl" style="width: 100%; border-collapse: collapse; direction: rtl; unicode-bidi: embed; margin-top: 8px; border: 1px solid #e5e7eb;">
      <tbody>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.certificateNo)}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; width: 40%; vertical-align: top;">מספר תעודה</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.date)}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">תאריך</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerName)}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">לקוח</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.customerId ?? "-")}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מס׳ לקוח</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleManufacturer ?? "-")}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">יצרן</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleModel ?? "-")}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">דגם</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.scaleSerial ?? "-")}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">סידורי</td></tr>
        <tr><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; vertical-align: top;">${escapeHtml(model.location ?? "-")}</td><td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; direction: rtl; unicode-bidi: embed; background: #f9fafb; font-weight: 700; vertical-align: top;">מיקום</td></tr>
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
