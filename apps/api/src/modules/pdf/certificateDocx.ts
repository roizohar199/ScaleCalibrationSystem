import { buildCertificateHtml } from "./htmlTemplate.js";
import HtmlToDocx from "@turbodocx/html-to-docx";
import { getFontFamily } from "./embeddedFont.js";

function formatNumber(value: any, decimals: number = 3): string {
  if (value == null || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString("he-IL", { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export async function generateCertificateDOCX(calibration: any): Promise<Buffer> {
  console.log(`[generateCertificateDOCX] Starting DOCX generation for calibration ${calibration.id || 'unknown'}`);
  
  try {
    // Validate calibration data
    if (!calibration) {
      throw new Error("Calibration data is required");
    }

    const unit = calibration.scale?.model?.unit || 'kg';
    const capacity = calibration.scale?.model?.maxCapacity ? Number(calibration.scale.model.maxCapacity) : null;
    const e = calibration.scale?.model?.e ? Number(calibration.scale.model.e) : null;
    const divisionsN = capacity && e ? Math.floor(capacity / e) : null;
    
    console.log(`[generateCertificateDOCX] Calibration data: unit=${unit}, capacity=${capacity}, e=${e}`);

    // Parse measurements
    let measurementsJson = null;
    try {
      measurementsJson = calibration.measurementsJson ? (
        typeof calibration.measurementsJson === 'string' 
          ? JSON.parse(calibration.measurementsJson)
          : calibration.measurementsJson
      ) : null;
      console.log(`[generateCertificateDOCX] Parsed measurementsJson, has measurements: ${!!measurementsJson?.measurements}`);
    } catch (parseError: any) {
      console.error(`[generateCertificateDOCX] Error parsing measurementsJson:`, parseError);
      throw new Error(`Failed to parse measurementsJson: ${parseError.message || parseError}`);
    }
    
    const measurements = measurementsJson?.measurements 
      ? measurementsJson.measurements
      : (measurementsJson || { accuracy: [], eccentricity: [], repeatability: [] });
    
    console.log(`[generateCertificateDOCX] Measurements: accuracy=${measurements.accuracy?.length || 0}, eccentricity=${measurements.eccentricity?.length || 0}, repeatability=${measurements.repeatability?.length || 0}`);

    // Build blocks array
    const blocks: Array<{ label: string; value: string }> = [];

    // Customer details
    if (calibration.customer?.name) {
      blocks.push({ label: "שם הלקוח", value: calibration.customer.name });
    }
    if (calibration.customer?.customerNo) {
      blocks.push({ label: "מס' לקוח", value: calibration.customer.customerNo });
    }
    if (calibration.customer?.address) {
      blocks.push({ label: "כתובת", value: calibration.customer.address });
    }

    // Scale details
    const manufacturer = calibration.scale?.model?.manufacturer || calibration.scale?.manufacturer || '-';
    const modelName = calibration.scale?.model?.modelName || calibration.scale?.deviceType || '-';
    
    if (manufacturer !== '-') {
      blocks.push({ label: "שם יצרן", value: manufacturer });
    }
    if (modelName !== '-') {
      blocks.push({ label: "סוג מכשיר", value: modelName });
    }
    if (calibration.scale?.serialMfg) {
      blocks.push({ label: "מס' סידורי יצרן", value: calibration.scale.serialMfg });
    }
    if (capacity) {
      const unitLabel = unit === 'kg' ? 'ק"ג' : unit === 'g' ? 'גרם' : unit;
      blocks.push({ label: "כושר העמסה", value: `${formatNumber(capacity, 0)} ${unitLabel}` });
    }
    if (divisionsN) {
      blocks.push({ label: "מספר חלוקות", value: String(divisionsN) });
    }
    if (calibration.scale?.model?.d) {
      blocks.push({ label: "ערך חלוקה ממשית (d)", value: formatNumber(Number(calibration.scale.model.d), 3) });
    }
    if (e) {
      blocks.push({ label: "ערך חלוקה לכיול (e)", value: formatNumber(e, 3) });
    }
    if (calibration.scale?.model?.accuracyClass) {
      blocks.push({ label: "רמת דיוק", value: calibration.scale.model.accuracyClass });
    }

    const minLoad = calibration.scale?.model?.minLoad || null;
    const maxLoad = capacity;
    if (minLoad) {
      const unitLabel = unit === 'kg' ? 'ק"ג' : unit === 'g' ? 'גרם' : unit;
      blocks.push({ label: "גבול תחתון להעמסה", value: `${formatNumber(Number(minLoad), 2)} ${unitLabel}` });
    }
    if (maxLoad) {
      const unitLabel = unit === 'kg' ? 'ק"ג' : unit === 'g' ? 'גרם' : unit;
      blocks.push({ label: "גבול עליון להעמסה", value: `${formatNumber(Number(maxLoad), 0)} ${unitLabel}` });
    }

    // Test dates
    if (calibration.testDate) {
      blocks.push({ label: "תאריך בדיקה", value: formatDate(calibration.testDate) });
    }
    if (calibration.nextDueDate) {
      blocks.push({ label: "תאריך בדיקה הבאה", value: formatDate(calibration.nextDueDate) });
    }

    // Visual check and status
    if (calibration.visualCheck) {
      blocks.push({ label: "בדיקה חזותית", value: calibration.visualCheck });
    }
    if (calibration.overallStatus) {
      blocks.push({ label: "סטטוס הבדיקה", value: calibration.overallStatus });
    }

    // Build tables array
    const tables: Array<{
      title: string;
      columns: string[];
      rows: Array<Array<string | number>>;
    }> = [];

    // Accuracy table (6 columns)
    if (measurements.accuracy && measurements.accuracy.length > 0) {
      tables.push({
        title: "סטיית דיוק הסקלה וסטיה מאיפוס\nACCURACY OF READING AND ZERO DEVIATION",
        columns: ["מסה מועמסת", "קריאה בעליה", "סטיה בעליה", "קריאה בירידה", "סטיה בירידה", "סטיה מותרת"],
        rows: measurements.accuracy.map((row: any) => {
          const load = row.load != null ? Number(row.load) : null;
          const reading1 = row.reading1 != null ? Number(row.reading1) : null;
          const reading3 = row.reading3 != null ? Number(row.reading3) : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;
          
          const uploadError = reading1 != null && load != null ? reading1 - load : null;
          const downloadError = reading3 != null && load != null ? reading3 - load : null;

          return [
            formatNumber(load, 3),
            formatNumber(reading1, 3),
            formatNumber(uploadError, 3),
            formatNumber(reading3, 3),
            formatNumber(downloadError, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Eccentricity table (4 columns)
    if (measurements.eccentricity && measurements.eccentricity.length > 0) {
      tables.push({
        title: "בדיקת אי מרכזיות העמסה (פינות)\nECCENTRICITY TEST",
        columns: ["נקודת העמסה", "קריאה בעליה", "סטיה בעליה", "סטיה מותרת"],
        rows: measurements.eccentricity.map((row: any) => {
          const position = row.position || row.load || null;
          const load = row.load != null ? Number(row.load) : (position ? 5 : null);
          const reading = row.reading || row.reading1;
          const readingValue = reading != null ? Number(reading) : null;
          const error = readingValue != null && load != null ? readingValue - load : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;

          return [
            position ? String(position) : '-',
            formatNumber(readingValue, 3),
            formatNumber(error, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Repeatability table (4 columns)
    if (measurements.repeatability && measurements.repeatability.length > 0) {
      tables.push({
        title: "בדיקת הדירות\nREPEATABILITY TEST",
        columns: ["מסה מועמסת", "קריאת המסה", "סטיה בקריאה", "סטיה מותרת"],
        rows: measurements.repeatability.map((row: any) => {
          const load = row.load != null ? Number(row.load) : null;
          const reading = row.reading || row.readings?.[0] || row.average;
          const readingValue = reading != null ? Number(reading) : null;
          const error = readingValue != null && load != null ? readingValue - load : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;

          return [
            formatNumber(load, 3),
            formatNumber(readingValue, 3),
            formatNumber(error, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Sensitivity table (4 columns)
    if (measurements.sensitivity && measurements.sensitivity.length > 0) {
      tables.push({
        title: "בדיקת סף רגישות\nSENSITIVITY TEST",
        columns: ["מסה מועמסת", "מסה נוספת", "סטיה בקריאה", "סטיה מותרת"],
        rows: measurements.sensitivity.map((row: any) => {
          const load = row.load != null ? Number(row.load) : null;
          const addLoad = row.addLoad != null ? Number(row.addLoad) : null;
          const error = row.error != null ? Number(row.error) : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;

          return [
            formatNumber(load, 3),
            formatNumber(addLoad, 3),
            formatNumber(error, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Time table (5 columns)
    if (measurements.time && measurements.time.length > 0) {
      tables.push({
        title: "בדיקת זמן\nTIME TEST",
        columns: ["זמן הקריאה", "מסה מועמסת", "סטיה מאיפוס 1", "סטיה מאיפוס 2", "סטיה מותרת"],
        rows: measurements.time.map((row: any) => {
          const time = row.time != null ? Number(row.time) : null;
          const load = row.load != null ? Number(row.load) : null;
          const error1 = row.error1 != null ? Number(row.error1) : null;
          const error2 = row.error2 != null ? Number(row.error2) : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;

          return [
            formatNumber(time, 0),
            formatNumber(load, 3),
            formatNumber(error1, 3),
            formatNumber(error2, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Tare table (3 columns)
    if (measurements.tare && measurements.tare.length > 0) {
      tables.push({
        title: "בדיקת טרה\nTARE TEST",
        columns: ["מסה מועמסת", "סטיה מקריאה", "סטיה מותרת"],
        rows: measurements.tare.map((row: any) => {
          const load = row.load != null ? Number(row.load) : null;
          const error = row.error != null ? Number(row.error) : null;
          const tolerance = row.tolerance != null ? Number(row.tolerance) : null;

          return [
            formatNumber(load, 3),
            formatNumber(error, 3),
            formatNumber(tolerance, 3)
          ];
        })
      });
    }

    // Build model (same as PDF)
    const model = {
      title: 'דו"ח בדיקת מאזניים',
      certificateNo: calibration.reportNo || calibration.certificate?.certificateNo || 'ללא',
      customerName: calibration.customer?.name || '-',
      customerId: calibration.customer?.customerNo,
      scaleManufacturer: manufacturer !== '-' ? manufacturer : undefined,
      scaleModel: modelName !== '-' ? modelName : undefined,
      scaleSerial: calibration.scale?.serialMfg,
      location: calibration.site?.name || calibration.site?.location,
      date: formatDate(calibration.testDate || calibration.createdAt),
      blocks,
      tables: tables.length > 0 ? tables : undefined
    };

    // Generate HTML using the same template as PDF
    console.log(`[generateCertificateDOCX] Building HTML template...`);
    let html: string;
    try {
      html = buildCertificateHtml(model);
      console.log(`[generateCertificateDOCX] HTML template built successfully, length: ${html.length} chars`);
    } catch (htmlError: any) {
      console.error(`[generateCertificateDOCX] Error building HTML template:`, htmlError);
      throw new Error(`Failed to build HTML template: ${htmlError.message || htmlError}`);
    }

    // Convert HTML to DOCX with RTL support
    console.log(`[generateCertificateDOCX] Converting HTML to DOCX with RTL support...`);
    let docxBuffer: Buffer;
    try {
      // Get font family (supports Hebrew)
      const fontFamily = getFontFamily();
      // Extract primary font name (first font in the list)
      const primaryFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Arial';
      
      const documentOptions = {
        direction: 'rtl',  // Enable right-to-left text direction
        lang: 'he-IL',     // Set language to Hebrew
        font: primaryFont,  // Use Hebrew-supporting font
        orientation: 'portrait',
        pageSize: {
          width: 12240,   // A4 width in TWIP (1/20th of a point)
          height: 15840   // A4 height in TWIP
        },
        margins: {
          top: 1440,     // 1 inch = 1440 TWIP
          right: 1440,
          bottom: 1440,
          left: 1440
        },
        table: {
          borderOptions: {
            size: 1,
            color: '000000'  // Black borders
          }
        }
      };
      
      console.log(`[generateCertificateDOCX] Using font: ${primaryFont}, direction: RTL, lang: he-IL`);
      const docxArrayBuffer = await HtmlToDocx(html, null, documentOptions);
      // Convert ArrayBuffer to Buffer
      docxBuffer = Buffer.from(docxArrayBuffer);
      console.log(`[generateCertificateDOCX] DOCX generated successfully, size: ${docxBuffer.length} bytes`);
    } catch (convertError: any) {
      console.error(`[generateCertificateDOCX] Error converting HTML to DOCX:`, convertError);
      throw new Error(`Failed to convert HTML to DOCX: ${convertError.message || convertError}`);
    }

    console.log(`[generateCertificateDOCX] DOCX generation completed successfully`);
    return docxBuffer;
  } catch (error: any) {
    console.error(`[generateCertificateDOCX] Fatal error generating DOCX:`, error);
    console.error(`[generateCertificateDOCX] Error stack:`, error.stack);
    throw error;
  }
}
