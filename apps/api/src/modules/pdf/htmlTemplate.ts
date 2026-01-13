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

  const blocksHtml = model.blocks
    .map(
      (b) => `
      <div class="row">
        <div class="label">${escapeHtml(b.label)}</div>
        <div class="value">${escapeHtml(b.value)}</div>
      </div>
    `
    )
    .join("");

  const tablesHtml = (model.tables ?? [])
    .map((t) => {
      const head = t.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
      const body = t.rows
        .map(
          (r) =>
            `<tr>${r
              .map((cell) => `<td>${escapeHtml(String(cell))}</td>`)
              .join("")}</tr>`
        )
        .join("");

      return `
        <div class="section">
          <div class="sectionTitle">${escapeHtml(t.title)}</div>
          <table>
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
      unicode-bidi: plaintext;
      margin: 0;
      padding: 24px;
      color: #111;
      font-size: 12.5px;
      line-height: 1.35;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
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

    <div class="meta">
      <div class="metaItem"><span class="metaKey">מספר תעודה</span><span class="metaVal">${escapeHtml(model.certificateNo)}</span></div>
      <div class="metaItem"><span class="metaKey">תאריך</span><span class="metaVal">${escapeHtml(model.date)}</span></div>
      <div class="metaItem"><span class="metaKey">לקוח</span><span class="metaVal">${escapeHtml(model.customerName)}</span></div>
      <div class="metaItem"><span class="metaKey">מס׳ לקוח</span><span class="metaVal">${escapeHtml(model.customerId ?? "-")}</span></div>
      <div class="metaItem"><span class="metaKey">יצרן</span><span class="metaVal">${escapeHtml(model.scaleManufacturer ?? "-")}</span></div>
      <div class="metaItem"><span class="metaKey">דגם</span><span class="metaVal">${escapeHtml(model.scaleModel ?? "-")}</span></div>
      <div class="metaItem"><span class="metaKey">סידורי</span><span class="metaVal">${escapeHtml(model.scaleSerial ?? "-")}</span></div>
      <div class="metaItem"><span class="metaKey">מיקום</span><span class="metaVal">${escapeHtml(model.location ?? "-")}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="sectionTitle">פרטי בדיקה</div>
    ${blocksHtml}
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
