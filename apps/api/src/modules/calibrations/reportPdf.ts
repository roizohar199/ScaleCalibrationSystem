import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { preprocessHebrewText } from '../../utils/hebrewBidi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatNumber(value: any, decimals: number = 3): string {
  if (value == null || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

function drawAccuracyTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";

  // Layout
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;

  // 6 columns - same width (like the screenshot)
  const colCount = 6;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = Array(colCount).fill(colW);
  // fix rounding drift on last col
  colWidths[colCount - 1] = tableWidth - colW * (colCount - 1);

  const titleH = 22;
  const headerH = 34;
  const rowH = 18;

  // Colors - שיפור לקריאה טובה יותר
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  // Column order לפי המסמך המקורי (משמאל לימין): מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת
  const headersHe = [
    "מסה מועמסת",
    "קריאה בעליה",
    "סטיה בעליה",
    "קריאה בירידה",
    "סטיה בירידה",
    "סטיה מותרת",
  ];
  const headersEn = [
    "LOAD MASS",
    "UPLOAD\nREADING",
    "UPLOAD\nERROR",
    "DOWNLOAD\nREADING",
    "DOWNLOAD\nERROR",
    "PERMISSIBLE\nERROR",
  ];

  const drawHeader = (yTop: number) => {
    // Title row (spanning all columns)
    doc
      .save()
      .rect(left, yTop, tableWidth, titleH)
      .fill(headerBg)
      .restore();

    doc
      .save()
      .lineWidth(1)
      .strokeColor(borderColor)
      .rect(left, yTop, tableWidth, titleH)
      .stroke()
      .restore();

    // Title row - Hebrew first, then English
    doc
      .save()
      .fillColor(headerText)
      .fontSize(10);
    doc.text( "סטיית דיוק הסקלה וסטיה מאיפוס", left, yTop + 5, {
      width: tableWidth,
      align: "right",
    });
    doc.restore();
    doc
      .save()
      .fillColor(headerText)
      .font("Helvetica-Bold")
      .fontSize(9);
    doc.text( "ACCURACY OF READING AND ZERO DEVIATION", left, yTop + 15, {
      width: tableWidth,
      align: "center",
    });
    doc.restore();

    // Header cells row
    const y = yTop + titleH;

    // header background
    doc
      .save()
      .rect(left, y, tableWidth, headerH)
      .fill(headerBg)
      .restore();

    // grid lines + header text
    let x = left;
    for (let i = 0; i < colCount; i++) {
      // cell border
      doc
        .save()
        .lineWidth(1)
        .strokeColor(borderColor)
        .rect(x, y, colWidths[i], headerH)
        .stroke()
        .restore();

      // Hebrew (top) - RTL alignment with Hebrew font
      doc
        .save()
        .fillColor(headerText)
        .fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, {
        width: colWidths[i] - 4,
        align: "right",
      });
      doc.restore();

      // English (bottom, 2 lines)
      doc
        .save()
        .fillColor(headerText)
        .font("Helvetica-Bold")
        .fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, {
        width: colWidths[i] - 4,
        align: "center",
        lineGap: 0,
      });
      doc.restore();

      x += colWidths[i];
    }

    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    // body background row
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();

    // Calculate values
    const load = row.load != null ? Number(row.load) : null;

    const uploadReading = row.uploadReading != null ? Number(row.uploadReading) : null;
    const downloadReading = row.downloadReading != null ? Number(row.downloadReading) : null;

    const uploadError =
      uploadReading != null && load != null ? uploadReading - load : null;
    const downloadError =
      downloadReading != null && load != null ? downloadReading - load : null;

    const mpe = row.mpe != null ? Number(row.mpe) : null;

    // Order לפי המסמך המקורי (משמאל לימין): מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת
    // If downloadReading is null, show empty cells for download columns
    const cells = downloadReading === null ? [
      formatNumber(load, 3), // מסה מועמסת
      formatNumber(uploadReading, 3), // קריאה בעליה
      formatNumber(uploadError, 3), // סטיה בעליה
      '-', // קריאה בירידה
      '-', // סטיה בירידה
      formatNumber(mpe, 3), // סטיה מותרת
    ] : [
      formatNumber(load, 3), // מסה מועמסת
      formatNumber(uploadReading, 3), // קריאה בעליה
      formatNumber(uploadError, 3), // סטיה בעליה
      formatNumber(downloadReading, 3), // קריאה בירידה
      formatNumber(downloadError, 3), // סטיה בירידה
      formatNumber(mpe, 3), // סטיה מותרת
    ];

    let x = left;
    for (let i = 0; i < colCount; i++) {
      // cell border
      doc
        .save()
        .lineWidth(1)
        .strokeColor(borderColor)
        .rect(x, y, colWidths[i], rowH)
        .stroke()
        .restore();

      // bold permissible error column (last column)
      const isMpeCol = i === 5;

      // Use Hebrew font for numbers if available, but align right for RTL
      doc
        .save()
        .fillColor(bodyText)
        .font(isMpeCol ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9);
      doc.text( cells[i], x + 2, y + 4, {
        width: colWidths[i] - 4,
        align: "right",
      });
      doc.restore();

      x += colWidths[i];
    }
  };

  // Start drawing
  let y = doc.y + 6;

  // If near bottom, new page
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  // Draw header once, then rows; repeat header on page breaks
  y = drawHeader(y);

  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }

  // Move cursor below table
  doc.y = y + 10;
}

// טבלת אקסצנטריות - מבנה: נקודת העמסה | קריאה בעליה | סטיה בעליה | סטיה מותרת
function drawEccentricityTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;
  const colCount = 4;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = [colW, colW, colW, tableWidth - colW * 3];
  
  const titleH = 22;
  const headerH = 34;
  const rowH = 18;
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  const headersHe = ["נקודת העמסה", "קריאה בעליה", "סטיה בעליה", "סטיה מותרת"];
  const headersEn = ["LOADING POINT", "UPLOAD READING", "UPLOAD ERROR", "PERMISSIBLE ERROR"];

  const drawHeader = (yTop: number) => {
    const y = yTop + titleH;
    doc.save().rect(left, y, tableWidth, headerH).fill(headerBg).restore();
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], headerH).stroke().restore();
      doc.save();
      doc.fillColor(headerText);
      doc.fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      doc.save();
      doc.fillColor(headerText);
      doc.font("Helvetica-Bold");
      doc.fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, { width: colWidths[i] - 4, align: "center" });
      doc.restore();
      x += colWidths[i];
    }
    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();
    const position = row.position || row.load || null;
    const load = row.load != null ? Number(row.load) : (position ? 5 : null); // בדרך כלל 5 ק"ג
    const reading = row.reading || row.reading1;
    const uploadReading = reading != null ? Number(reading) : null;
    const uploadError = uploadReading != null && load != null ? uploadReading - load : null;
    const mpe = row.tolerance != null ? Number(row.tolerance) : null;
    
    const cells = [
      position ? String(position) : '-',
      formatNumber(uploadReading, 3),
      formatNumber(uploadError, 3),
      formatNumber(mpe, 3)
    ];
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], rowH).stroke().restore();
      doc.save();
      doc.fillColor(bodyText);
      doc.font(i === 3 ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9);
      doc.text( cells[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      x += colWidths[i];
    }
  };

  let y = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawHeader(y);
  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }
  doc.y = y + 10;
}

// טבלת חזרתיות - מבנה: מסה מועמסת | קריאת המסה | סטיה בקריאה | סטיה מותרת
function drawRepeatabilityTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;
  const colCount = 4;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = [colW, colW, colW, tableWidth - colW * 3];
  
  const titleH = 22;
  const headerH = 34;
  const rowH = 18;
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  const headersHe = ["מסה מועמסת", "קריאת המסה", "סטיה בקריאה", "סטיה מותרת"];
  const headersEn = ["LOAD MASS", "MASS READING", "READING ERROR", "PERMISSIBLE ERROR"];

  const drawHeader = (yTop: number) => {
    const y = yTop + titleH;
    doc.save().rect(left, y, tableWidth, headerH).fill(headerBg).restore();
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], headerH).stroke().restore();
      doc.save();
      doc.fillColor(headerText);
      doc.fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      doc.save();
      doc.fillColor(headerText);
      doc.font("Helvetica-Bold");
      doc.fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, { width: colWidths[i] - 4, align: "center" });
      doc.restore();
      x += colWidths[i];
    }
    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();
    const load = row.load != null ? Number(row.load) : null;
    const reading = row.uploadReading != null ? Number(row.uploadReading) : null;
    const error = row.error != null ? Number(row.error) : (reading != null && load != null ? reading - load : null);
    const mpe = row.mpe != null ? Number(row.mpe) : null;
    
    const cells = [
      formatNumber(load, 3),
      formatNumber(reading, 3),
      formatNumber(error, 3),
      formatNumber(mpe, 3)
    ];
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], rowH).stroke().restore();
      doc.save();
      doc.fillColor(bodyText);
      doc.font(i === 3 ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9);
      doc.text( cells[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      x += colWidths[i];
    }
  };

  let y = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawHeader(y);
  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }
  doc.y = y + 10;
}

// טבלת סף רגישות - מבנה: מסה מועמסת | מסה נוספת | סטיה בקריאה | סטיה מותרת
function drawSensitivityTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;
  const colCount = 4;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = [colW, colW, colW, tableWidth - colW * 3];
  
  const titleH = 22;
  const headerH = 34;
  const rowH = 18;
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  const headersHe = ["מסה מועמסת", "מסה נוספת", "סטיה בקריאה", "סטיה מותרת"];
  const headersEn = ["LOAD MASS", "ADD LOAD MASS", "READING ERROR", "PERMISSIBLE ERROR"];

  const drawHeader = (yTop: number) => {
    const y = yTop + titleH;
    doc.save().rect(left, y, tableWidth, headerH).fill(headerBg).restore();
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], headerH).stroke().restore();
      doc.save();
      doc.fillColor(headerText);
      doc.fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      doc.save();
      doc.fillColor(headerText);
      doc.font("Helvetica-Bold");
      doc.fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, { width: colWidths[i] - 4, align: "center" });
      doc.restore();
      x += colWidths[i];
    }
    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();
    const load = row.load != null ? Number(row.load) : null;
    const addLoad = row.addLoad != null ? Number(row.addLoad) : null;
    const error = row.error != null ? Number(row.error) : null;
    const mpe = row.tolerance != null ? Number(row.tolerance) : null;
    
    const cells = [
      formatNumber(load, 3),
      formatNumber(addLoad, 3),
      formatNumber(error, 3),
      formatNumber(mpe, 3)
    ];
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], rowH).stroke().restore();
      doc.save();
      doc.fillColor(bodyText);
      doc.font(i === 3 ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9);
      doc.text( cells[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      x += colWidths[i];
    }
  };

  let y = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawHeader(y);
  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }
  doc.y = y + 10;
}

// טבלת זמן - מבנה: זמן הקריאה | מסה מועמסת | סטיה מאיפוס 1 | סטיה מאיפוס 2 | סטיה מותרת
function drawTimeTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;
  const colCount = 5;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = Array(colCount).fill(colW);
  colWidths[colCount - 1] = tableWidth - colW * (colCount - 1);
  
  const titleH = 22;
  const headerH = 34;
  const rowH = 18;
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  const headersHe = ["זמן הקריאה", "מסה מועמסת", "סטיה מאיפוס 1", "סטיה מאיפוס 2", "סטיה מותרת"];
  const headersEn = ["TIME OF READING", "LOAD MASS", "ZERO READING ERROR 1", "ZERO READING ERROR 2", "PERMISSIBLE ERROR"];

  const drawHeader = (yTop: number) => {
    const y = yTop + titleH;
    doc.save().rect(left, y, tableWidth, headerH).fill(headerBg).restore();
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], headerH).stroke().restore();
      doc.save();
      doc.fillColor(headerText);
      doc.fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      doc.save();
      doc.fillColor(headerText);
      doc.font("Helvetica-Bold");
      doc.fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, { width: colWidths[i] - 4, align: "center" });
      doc.restore();
      x += colWidths[i];
    }
    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();
    const time = row.time != null ? Number(row.time) : null;
    const load = row.load != null ? Number(row.load) : null;
    const error1 = row.error1 != null ? Number(row.error1) : null;
    const error2 = row.error2 != null ? Number(row.error2) : null;
    const mpe = row.tolerance != null ? Number(row.tolerance) : null;
    
    const cells = [
      formatNumber(time, 0),
      formatNumber(load, 3),
      formatNumber(error1, 3),
      formatNumber(error2, 3),
      formatNumber(mpe, 3)
    ];
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], rowH).stroke().restore();
      doc.save();
      doc.fillColor(bodyText);
      doc.font(i === 4 ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9);
      doc.text( cells[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      x += colWidths[i];
    }
  };

  let y = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawHeader(y);
  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }
  doc.y = y + 10;
}

// טבלת טרה - מבנה: מסה מועמסת | סטיה מקריאה | סטיה מותרת
function drawTareTable(
  doc: PDFDocument,
  rows: any[],
  options?: { unit?: string }
) {
  const unit = options?.unit || "kg";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableWidth = right - left;
  const colCount = 3;
  const colW = Math.floor(tableWidth / colCount);
  const colWidths = [colW, colW, tableWidth - colW * 2];
  
  const titleH = 22;
  const headerH = 34;
  const rowH = 18;
  const borderColor = "#000000";
  const headerBg = "#E0E0E0";
  const bodyBg = "#FFFFFF";
  const headerText = "#000000";
  const bodyText = "#000000";

  const headersHe = ["מסה מועמסת", "סטיה מקריאה", "סטיה מותרת"];
  const headersEn = ["LOAD MASS", "READING ERROR", "PERMISSIBLE ERROR"];

  const drawHeader = (yTop: number) => {
    const y = yTop + titleH;
    doc.save().rect(left, y, tableWidth, headerH).fill(headerBg).restore();
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], headerH).stroke().restore();
      doc.save();
      doc.fillColor(headerText);
      doc.fontSize(9);
      doc.text( headersHe[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      doc.save();
      doc.fillColor(headerText);
      doc.font("Helvetica-Bold");
      doc.fontSize(8);
      doc.text( headersEn[i], x + 2, y + 16, { width: colWidths[i] - 4, align: "center" });
      doc.restore();
      x += colWidths[i];
    }
    return yTop + titleH + headerH;
  };

  const drawRow = (y: number, row: any) => {
    doc.save().rect(left, y, tableWidth, rowH).fill(bodyBg).restore();
    const load = row.load != null ? Number(row.load) : null;
    const error = row.error != null ? Number(row.error) : null;
    const mpe = row.tolerance != null ? Number(row.tolerance) : null;
    
    const cells = [
      formatNumber(load, 3),
      formatNumber(error, 3),
      formatNumber(mpe, 3)
    ];
    
    let x = left;
    for (let i = 0; i < colCount; i++) {
      doc.save().lineWidth(0.5).strokeColor(borderColor).rect(x, y, colWidths[i], rowH).stroke().restore();
      doc.save();
      doc.fillColor(bodyText);
      doc.font(i === 2 ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9);
      doc.text( cells[i], x + 2, y + 4, { width: colWidths[i] - 4, align: "right" });
      doc.restore();
      x += colWidths[i];
    }
  };

  let y = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
  if (y + titleH + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y = drawHeader(y);
  for (const row of rows) {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    drawRow(y, row);
    y += rowH;
  }
  doc.y = y + 10;
}

export async function generateReportPDF(calibration: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Wrap doc.text to preprocess Hebrew text with bidi-js
    const origText = doc.text.bind(doc) as any;
    doc.text = function (text: any, x?: any, y?: any, options?: any) {
      try {
        if (typeof text === "string" && /[\u0590-\u05FF]/.test(text)) {
          // IMPORTANT: do NOT use /\s+/g because it kills \n and can glue words.
          // Normalize only spaces/tabs per-line while keeping line breaks.
          const cleaned = text
            .split(/\r?\n/)
            .map((line) =>
              line
                .replace(/\u00A0/g, " ")
                .replace(/[ \t]+/g, " ")
                .replace(/^\s+|\s+$/g, "")
            )
            .join("\n");

          text = preprocessHebrewText(cleaned);
        }
      } catch (e) {
        // swallow preprocessing errors and continue
      }

      return origText(text, x, y, options);
    } as any;

    const unit = calibration.scale?.model?.unit || 'kg';
    const capacity = calibration.scale?.model?.maxCapacity ? Number(calibration.scale.model.maxCapacity) : null;
    const e = calibration.scale?.model?.e ? Number(calibration.scale.model.e) : null;
    const divisionsN = capacity && e ? Math.floor(capacity / e) : null;

    // כותרת ראשית - RTL alignment
    doc.fontSize(18).text("דו\"ח בדיקת מאזניים", { align: "right" });
    doc.moveDown(0.3);
    doc.fontSize(14).text("דו\"ח מספר: " + (calibration.reportNo || calibration.certificate?.certificateNo || 'ללא'), { align: "right" });
    doc.moveDown(1);

    // פרטי הלקוח - RTL alignment
    doc.fontSize(12).text("פרטי הלקוח", { underline: true, align: "right" });
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`שם הלקוח: ${calibration.customer?.name || '-'}`, { align: "right" });
    doc.text(`מס' לקוח: ${calibration.customer?.customerNo || '-'}`, { align: "right" });
    doc.text(`כתובת: ${calibration.customer?.address || '-'}`, { align: "right" });
    doc.moveDown(1);

    // פרטי המאזניים - RTL alignment
    doc.fontSize(12).text("פרטי המאזניים", { underline: true, align: "right" });
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`שם יצרן: ${calibration.scale?.model?.manufacturer || calibration.scale?.manufacturer || '-'}`, { align: "right" });
    doc.text(`סוג מכשיר: ${calibration.scale?.model?.modelName || calibration.scale?.deviceType || '-'}`, { align: "right" });
    doc.text(`מס' סידורי יצרן: ${calibration.scale?.serialMfg || '-'}`, { align: "right" });
    doc.text(`כושר העמסה: ${capacity ? formatNumber(capacity, 0) : '-'} ${unit === 'kg' ? 'ק"ג' : unit === 'g' ? 'גרם' : unit}`, { align: "right" });
    doc.text(`מספר חלוקות: ${divisionsN || '-'}`, { align: "right" });
    doc.text(`ערך חלוקה ממשית (d): ${calibration.scale?.model?.d ? formatNumber(Number(calibration.scale.model.d), 3) : '-'}`, { align: "right" });
    doc.text(`ערך חלוקה לכיול (e): ${e ? formatNumber(e, 3) : '-'}`, { align: "right" });
    doc.text(`רמת דיוק: ${calibration.scale?.model?.accuracyClass || '-'}`, { align: "right" });
    
    // גבולות העמסה (אם קיימים)
    const minLoad = calibration.scale?.model?.minLoad || null;
    const maxLoad = capacity;
    if (minLoad || maxLoad) {
      doc.text(`גבול תחתון להעמסה:\t${minLoad ? formatNumber(Number(minLoad), 2) + ' ' + (unit === 'kg' ? 'ק"ג' : unit) : '-'}`, { align: "right" });
      doc.text(`גבול עליון להעמסה:\t${maxLoad ? formatNumber(Number(maxLoad), 0) + ' ' + (unit === 'kg' ? 'ק"ג' : unit) : '-'}`, { align: "right" });
    }
    
    doc.moveDown(0.5);
    
    // תאריכי בדיקה
    if (calibration.testDate) {
      const testDate = new Date(calibration.testDate);
      const nextDueDate = calibration.nextDueDate ? new Date(calibration.nextDueDate) : null;
      doc.text(`תאריך בדיקה: ${testDate.toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric', year: '2-digit' })}`, { align: "right" });
      if (nextDueDate) {
        doc.text(`תאריך בדיקה הבאה: ${nextDueDate.toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric', year: '2-digit' })}`, { align: "right" });
      }
    }
    
    doc.moveDown(1);

    // Parse measurements - support both structures
    const measurementsJson = calibration.measurementsJson ? (
      typeof calibration.measurementsJson === 'string' 
        ? JSON.parse(calibration.measurementsJson)
        : calibration.measurementsJson
    ) : null;
    
    const measurements = measurementsJson?.measurements 
      ? measurementsJson.measurements
      : (measurementsJson || { accuracy: [], eccentricity: [], repeatability: [] });

    // טבלת דיוק (ACCURACY) - סדר עמודות: מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת
    if (measurements.accuracy && measurements.accuracy.length > 0) {
      // Title is now in the table header, so we don't need it here
      doc.moveDown(0.5);

      // Convert to format expected by drawAccuracyTable - סדר: מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת
      const accuracyRows = measurements.accuracy.map((row: any) => {
        const load = row.load != null ? Number(row.load) : null;
        const reading1 = row.reading1 != null ? Number(row.reading1) : null;
        const reading3 = row.reading3 != null ? Number(row.reading3) : null;
        const tolerance = row.tolerance != null ? Number(row.tolerance) : null;
        
        return {
          load: load,
          uploadReading: reading1,
          downloadReading: reading3,
          mpe: tolerance
        };
      });

      drawAccuracyTable(doc, accuracyRows, { unit });
      doc.moveDown(0.5);
    }

    // טבלת אקסצנטריות (ECCENTRICITY) - מבנה: נקודת העמסה | קריאה בעליה | סטיה בעליה | סטיה מותרת
    if (measurements.eccentricity && measurements.eccentricity.length > 0) {
      // Title is now in the table header
      doc.moveDown(0.5);

      drawEccentricityTable(doc, measurements.eccentricity, { unit });
      doc.moveDown(0.5);
    }

    // טבלת חזרתיות (REPEATABILITY)
    if (measurements.repeatability && measurements.repeatability.length > 0) {
      // Title is now in the table header
      doc.moveDown(0.5);

      // Draw repeatability table - מבנה: מסה מועמסת | קריאת המסה | סטיה בקריאה | סטיה מותרת
      const repeatabilityRows = measurements.repeatability.map((row: any) => {
        const load = row.load != null ? Number(row.load) : null;
        const reading = row.reading || row.average;
        const error = reading != null && load != null ? reading - load : null;
        return {
          load: load,
          uploadReading: reading,
          downloadReading: null,
          mpe: row.tolerance,
          error: error
        };
      });

      drawRepeatabilityTable(doc, repeatabilityRows, { unit });
      doc.moveDown(0.5);
    }

    // טבלת סף רגישות (SENSITIVITY)
    if (measurements.sensitivity && measurements.sensitivity.length > 0) {
      // Title is now in the table header
      doc.moveDown(0.5);

      drawSensitivityTable(doc, measurements.sensitivity, { unit });
      doc.moveDown(0.5);
    }

    // טבלת זמן (TIME)
    if (measurements.time && measurements.time.length > 0) {
      // Title is now in the table header
      doc.moveDown(0.5);

      drawTimeTable(doc, measurements.time, { unit });
      doc.moveDown(0.5);
    }

    // טבלת טרה (TARE)
    if (measurements.tare && measurements.tare.length > 0) {
      // Title is now in the table header
      doc.moveDown(0.5);

      drawTareTable(doc, measurements.tare, { unit });
      doc.moveDown(0.5);
    }

    // בדיקה חזותית וסטטוס - RTL alignment
    doc.moveDown(1);
    doc.fontSize(10);
    doc.text(`בדיקה חזותית: ${calibration.visualCheck || 'תקין'}`, { align: "right" });
    doc.text(`סטטוס הבדיקה: ${calibration.overallStatus || 'שמיש'}`, { align: "right" });
    doc.moveDown(1);
    
    // הערות תחתית - RTL alignment
    doc.fontSize(9);
    doc.text("המאזניים נבדקו בעזרת משקולות המאושרות ומכויילות ע\"י משרד התעשייה והמסחר מפרט עבודה תואם תקן בינלאומי 111 - R  O.I.M.L.", { align: "right" });
    doc.text(`כל המידות נמדדו ב${unit === 'kg' ? 'ק\"ג' : unit === 'g' ? 'גרם' : unit}`, { align: "right" });
    doc.text("כל הזמנים נמדדו בשניות.", { align: "right" });

    doc.end();
  });
}

