import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { findOrCreateScale } from "./scaleMatcher.js";
import { createImportedCalibration } from "./calibrationImporter.js";

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

// Reuse parsing logic from importReports2025Zip.ts
type Extracted = {
  fileName: string;
  customerName?: string;
  customerNo?: string;
  address?: string;
  phone?: string;
  serialMfg?: string;
  serialInternal?: string;
  manufacturer?: string;
  deviceType?: string;
  modelName?: string;
  capacity?: number;
  unit?: "kg" | "g" | "mg";
  d?: number;
  e?: number;
  divisionsN?: number;
  accuracyCls?: "I" | "II" | "III";
  minLoad?: number; // גבול תחתון להעמסה
  maxLoad?: number; // גבול עליון להעמסה
  testDate?: Date;
  reportNo?: string;
};

function decodeXmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // תווים Unicode עשרוניים
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code < 0x10FFFF ? String.fromCharCode(code) : match;
    })
    // תווים Unicode hex
    .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code < 0x10FFFF ? String.fromCharCode(code) : match;
    });
}

function stripXmlTags(xml: string) {
  const withBreaks = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " ");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(stripped).replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

// ולידציה של שורת טבלת דיוק (שופרה)
function validateAccuracyRow(row: any): boolean {
  if (!row) {
    console.warn(`[validateAccuracyRow] שורה ריקה`);
    return false;
  }
  
  // load הוא חובה
  if (typeof row.load !== 'number' || row.load < 0 || isNaN(row.load)) {
    console.warn(`[validateAccuracyRow] load לא תקין:`, row.load);
    return false;
  }
  
  // קריאות יכולות להיות null או מספר
  if (row.uploadReading !== null && row.uploadReading !== undefined) {
    if (typeof row.uploadReading !== 'number' || isNaN(row.uploadReading)) {
      console.warn(`[validateAccuracyRow] uploadReading לא תקין:`, row.uploadReading);
      return false;
    }
  }
  
  if (row.downloadReading !== null && row.downloadReading !== undefined) {
    if (typeof row.downloadReading !== 'number' || isNaN(row.downloadReading)) {
      console.warn(`[validateAccuracyRow] downloadReading לא תקין:`, row.downloadReading);
      return false;
    }
  }
  
  // mpe יכול להיות null או מספר חיובי
  if (row.mpe !== null && row.mpe !== undefined) {
    if (typeof row.mpe !== 'number' || row.mpe < 0 || isNaN(row.mpe)) {
      console.warn(`[validateAccuracyRow] mpe לא תקין:`, row.mpe);
      return false;
    }
  }
  
  return true;
}

// ולידציה של שורת טבלת אי מרכזיות (שופרה)
function validateEccentricityRow(row: any): boolean {
  if (!row) {
    console.warn(`[validateEccentricityRow] שורה ריקה`);
    return false;
  }
  
  // load הוא חובה
  if (typeof row.load !== 'number' || row.load < 0 || isNaN(row.load)) {
    console.warn(`[validateEccentricityRow] load לא תקין:`, row.load);
    return false;
  }
  
  // קריאה היא חובה
  if (row.uploadReading !== null && row.uploadReading !== undefined) {
    if (typeof row.uploadReading !== 'number' || isNaN(row.uploadReading)) {
      console.warn(`[validateEccentricityRow] uploadReading לא תקין:`, row.uploadReading);
      return false;
    }
  } else {
    // קריאה היא חובה, אבל אם היא null נדחה
    console.warn(`[validateEccentricityRow] uploadReading חסר`);
    return false;
  }
  
  // mpe יכול להיות null או מספר חיובי
  if (row.mpe !== null && row.mpe !== undefined) {
    if (typeof row.mpe !== 'number' || row.mpe < 0 || isNaN(row.mpe)) {
      console.warn(`[validateEccentricityRow] mpe לא תקין:`, row.mpe);
      return false;
    }
  }
  
  return true;
}

// ולידציה של שורת טבלת הדירות (שופרה)
function validateRepeatabilityRow(row: any): boolean {
  if (!row) {
    console.warn(`[validateRepeatabilityRow] שורה ריקה`);
    return false;
  }
  
  // load הוא חובה
  if (typeof row.load !== 'number' || row.load < 0 || isNaN(row.load)) {
    console.warn(`[validateRepeatabilityRow] load לא תקין:`, row.load);
    return false;
  }
  
  // קריאה היא חובה
  if (row.massReading !== null && row.massReading !== undefined) {
    if (typeof row.massReading !== 'number' || isNaN(row.massReading)) {
      console.warn(`[validateRepeatabilityRow] massReading לא תקין:`, row.massReading);
      return false;
    }
  } else {
    // קריאה היא חובה, אבל אם היא null נדחה
    console.warn(`[validateRepeatabilityRow] massReading חסר`);
    return false;
  }
  
  // mpe יכול להיות null או מספר חיובי
  if (row.mpe !== null && row.mpe !== undefined) {
    if (typeof row.mpe !== 'number' || row.mpe < 0 || isNaN(row.mpe)) {
      console.warn(`[validateRepeatabilityRow] mpe לא תקין:`, row.mpe);
      return false;
    }
  }
  
  return true;
}

// זיהוי משופר של סוג טבלה (תמיכה בתבניות נוספות)
function identifyTableType(headerRow: string): string | null {
  const header = headerRow.toLowerCase();
  
  // ACCURACY - חיפוש מדויק יותר (תמיכה בתבניות נוספות)
  if (
    header.includes('סטיית דיוק') || 
    header.includes('accuracy of reading') ||
    header.includes('accuracy') ||
    (header.includes('upload reading') && header.includes('download reading')) ||
    (header.includes('upload') && header.includes('download')) ||
    (header.includes('קריאה בעליה') && header.includes('קריאה בירידה')) ||
    (header.includes('קריאה בעלייה') && header.includes('קריאה בירידה')) ||
    (header.includes('permissible error') && header.includes('load mass')) ||
    (header.includes('upload error') && header.includes('download error')) ||
    (header.includes('עליה') && header.includes('ירידה') && header.includes('קריאה'))
  ) {
    return 'ACCURACY';
  }
  
  // ECCENTRICITY (תמיכה בתבניות נוספות)
  if (
    header.includes('אי מרכזיות') || 
    header.includes('eccentricity') || 
    header.includes('נקודת העמסה') || 
    header.includes('loading point') ||
    header.includes('פינות') ||
    header.includes('פינה') ||
    (header.includes('position') && header.includes('reading')) ||
    (header.includes('נקודה') && header.includes('קריאה'))
  ) {
    return 'ECCENTRICITY';
  }
  
  // REPEATABILITY (תמיכה בתבניות נוספות)
  if (
    header.includes('הדירות') || 
    header.includes('repeatability') || 
    header.includes('קריאת המסה') || 
    header.includes('mass reading') ||
    (header.includes('reading') && header.includes('repeat')) ||
    (header.includes('קריאה') && header.includes('הדירות'))
  ) {
    return 'REPEATABILITY';
  }
  
  // SENSITIVITY (תמיכה בתבניות נוספות)
  if (
    header.includes('רגישות') || 
    header.includes('sensitivity') || 
    header.includes('discrimination') || 
    header.includes('מסה נוספת') ||
    header.includes('add load mass') ||
    (header.includes('additional') && header.includes('load')) ||
    (header.includes('מסה') && header.includes('נוספת'))
  ) {
    return 'SENSITIVITY';
  }
  
  // TIME (תמיכה בתבניות נוספות)
  if (
    header.includes('זמן') || 
    header.includes('time test') || 
    header.includes('מאיפוס') || 
    header.includes('zero reading') ||
    (header.includes('time') && header.includes('reading')) ||
    (header.includes('זמן') && header.includes('קריאה'))
  ) {
    return 'TIME';
  }
  
  // TARE (תמיכה בתבניות נוספות)
  if (
    header.includes('טרה') || 
    header.includes('tare test') ||
    header.includes('tare') ||
    (header.includes('טרה') && header.includes('קריאה'))
  ) {
    return 'TARE';
  }
  
  return null;
}

// פונקציה משופרת לזיהוי מיקום עמודות לפי כותרות
function findColumnIndex(headerCells: string[], searchTerms: string[]): number {
  // ניקוי תאים - הסרת רווחים מיותרים ותווים מיוחדים (שיפור: שמירה על יותר תווים)
  const cleanedCells = headerCells.map(cell => {
    return cell
      .replace(/\s+/g, ' ')  // רווחים מרובים לרווח אחד
      .replace(/[^\w\s\u0590-\u05FF\u200C\u200D]/g, '')  // הסרת תווים מיוחדים (חוץ מעברית, אותיות, ותווים מיוחדים עבריים)
      .trim()
      .toLowerCase();
  });
  
  // חיפוש מדויק - קודם חיפוש מלא, אחר כך חלקי (שיפור: חיפוש יותר גמיש)
  for (const term of searchTerms) {
    const cleanedTerm = term.toLowerCase().trim();
    
    // חיפוש 1: התאמה מלאה
    for (let i = 0; i < cleanedCells.length; i++) {
      if (cleanedCells[i] === cleanedTerm) {
        return i;
      }
    }
    
    // חיפוש 2: התאמה חלקית (הכותרות מכילות את המונח)
    for (let i = 0; i < cleanedCells.length; i++) {
      if (cleanedCells[i].includes(cleanedTerm) || cleanedTerm.includes(cleanedCells[i])) {
        return i;
      }
    }
    
    // חיפוש 3: חיפוש במילים בודדות (לכותרות מפוצלות)
    const termWords = cleanedTerm.split(/\s+/).filter(w => w.length > 0);
    for (let i = 0; i < cleanedCells.length; i++) {
      const cellWords = cleanedCells[i].split(/\s+/).filter(w => w.length > 0);
      // בדיקה אם כל המילים של המונח נמצאות בתא (שיפור: התאמה יותר גמישה)
      if (termWords.length > 0 && termWords.every(word => 
        cellWords.some(cellWord => 
          cellWord.includes(word) || 
          word.includes(cellWord) ||
          cellWord.startsWith(word) ||
          word.startsWith(cellWord)
        )
      )) {
        return i;
      }
    }
    
    // חיפוש 4: חיפוש לפי תת-מחרוזות (לכותרות ארוכות)
    for (let i = 0; i < cleanedCells.length; i++) {
      // אם המונח הוא חלק מהכותרת או להיפך
      if (cleanedCells[i].length >= cleanedTerm.length * 0.5 && 
          (cleanedCells[i].includes(cleanedTerm) || cleanedTerm.includes(cleanedCells[i]))) {
        return i;
      }
    }
  }
  
  return -1;
}

// פונקציה משופרת לחילוץ מספר מתא (תומך בפורמטים שונים)
function parseCellValue(cell: string): number | null {
  if (!cell || !cell.trim()) return null;
  
  // טיפול בערכים מיוחדים
  let trimmed = cell.trim();
  if (trimmed === '-' || trimmed === '—' || trimmed === '–' || trimmed === '' || trimmed === 'N/A' || trimmed === 'n/a') {
    return null;
  }
  
  // ניקוי התא - הסרת טקסט לא רלוונטי אבל שמירה על מספרים, נקודות, פסיקים, מקפים, ורווחים
  // שיפור: שמירה על סימן מינוס בתחילת המספר
  let cleaned = trimmed.replace(/[^\d.,\-\s\u2212]/g, ' ').trim(); // \u2212 הוא סימן מינוס Unicode
  
  // טיפול במספרים עם רווחים כמו "0. 02" או "150. 5" או "0 5"
  cleaned = cleaned.replace(/(\d)\s+\./g, '$1.');  // "0 . 5" -> "0.5"
  cleaned = cleaned.replace(/\.\s+(\d)/g, '.$1');  // "0. 5" -> "0.5"
  cleaned = cleaned.replace(/(\d)\s+(\d)/g, (match, p1, p2) => {
    // אם יש נקודה עשרונית אחרי, נחבר עם נקודה
    // אחרת, נחבר עם נקודה רק אם זה נראה כמו מספר עשרוני (פחות מ-3 ספרות)
    if (p2.length <= 2 && !cleaned.includes('.')) {
      return `${p1}.${p2}`;
    }
    return match; // נשאיר כמו שהיה
  });
  
  // החלפת פסיקים בנקודות (פורמט אירופאי)
  cleaned = cleaned.replace(/,/g, '.');
  
  // החלפת סימן מינוס Unicode לסימן מינוס רגיל
  cleaned = cleaned.replace(/\u2212/g, '-');
  
  // הסרת רווחים
  cleaned = cleaned.replace(/\s+/g, '');
  
  // טיפול במספרים שליליים - בדיקה אם יש מינוס בתחילה או בסוף
  const isNegative = cleaned.startsWith('-') || cleaned.endsWith('-');
  if (isNegative) {
    cleaned = cleaned.replace(/^-+|-+$/g, '');
    cleaned = '-' + cleaned;
  }
  
  // חילוץ מספר מהתא - תמיכה במספרים עם נקודה עשרונית
  // מחפש: מספר שלם אופציונלי + נקודה + ספרות עשרוניות
  const numMatch = cleaned.match(/^-?(\d+)(\.(\d+))?$/);
  if (numMatch) {
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }
  
  // נסיון נוסף - חילוץ מספר מתוך טקסט (אם יש טקסט לפני/אחרי)
  const fallbackMatch = cleaned.match(/-?\d+\.?\d*/);
  if (fallbackMatch) {
    const num = parseFloat(fallbackMatch[0]);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }
  
  // נסיון אחרון - חילוץ מספר מתוך הטקסט המקורי (לפני ניקוי)
  const originalMatch = trimmed.match(/-?\d+[.,]?\d*/);
  if (originalMatch) {
    let originalNum = originalMatch[0].replace(/,/g, '.');
    const num = parseFloat(originalNum);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }
  
  return null;
}

// חילוץ טבלאות מהמסמך DOCX - גרסה משופרת עם ולידציה
async function extractTablesFromDocx(buffer: Buffer): Promise<any> {
  const tables: any = {
    ACCURACY: { rows: [] },
    ECCENTRICITY: { rows: [] },
    REPEATABILITY: { rows: [] },
    SENSITIVITY: { rows: [] },
    TIME: { rows: [] },
    TARE: { rows: [] }
  };

  try {
    // שימוש ב-mammoth לחילוץ טבלאות
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;
    
    // לוג לבדיקה
    console.log(`[extractTablesFromDocx] HTML length: ${html.length}`);
    
    // חילוץ טבלאות מה-HTML - חיפוש משופר
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    const foundTables: string[] = [];
    
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];
      foundTables.push(tableHtml.substring(0, 200)); // שמירה לדיבוג
      
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const tableRows: string[][] = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const rowCells: string[] = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          // ניקוי HTML מהתא - שיפור לטיפול בתאים ממוזגים ותוכן מורכב
          let cellText = cellMatch[1];
          
          // חילוץ טקסט מתוך תגי <w:t> (אם קיימים - פורמט Word)
          const textMatches = cellText.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi);
          const textParts: string[] = [];
          for (const textMatch of textMatches) {
            textParts.push(textMatch[1]);
          }
          
          // אם לא מצאנו תגי <w:t>, ננסה תגים אחרים
          if (textParts.length === 0) {
            // נסיון עם תגי <span>, <p>, <div>
            const spanMatches = cellText.matchAll(/<(?:span|p|div)[^>]*>([\s\S]*?)<\/(?:span|p|div)>/gi);
            for (const spanMatch of spanMatches) {
              textParts.push(spanMatch[1]);
            }
          }
          
          // אם עדיין לא מצאנו, נחלץ ישירות מה-HTML
          if (textParts.length === 0) {
            // ניקוי HTML - שיפור: שמירה על תווים מיוחדים במספרים
            cellText = cellText
              .replace(/<br\s*\/?>/gi, ' ') // שורות חדשות לרווח
              .replace(/<[^>]+>/g, ' ') // הסרת תגי HTML
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&apos;/g, "'")
              .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10))) // תווים Unicode
              .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16))) // תווים Unicode hex
              .replace(/\s+/g, ' ')
              .trim();
            rowCells.push(cellText);
          } else {
            // שילוב כל חלקי הטקסט - שיפור: ניקוי טוב יותר
            const combinedText = textParts
              .map(t => {
                return t
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
                  .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
                  .trim();
              })
              .filter(t => t.length > 0)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            rowCells.push(combinedText);
          }
        }
        
        // הוספת שורה גם אם יש תאים ריקים (חשוב לשמור על סדר העמודות)
        if (rowCells.length > 0) {
          tableRows.push(rowCells);
        } else {
          // אם אין תאים, נוסיף שורה ריקה כדי לשמור על המבנה
          tableRows.push([]);
        }
      }
      
      if (tableRows.length < 2) continue; // צריך לפחות כותרת ושורה אחת
      
      // זיהוי סוג הטבלה לפי הכותרת - שימוש בפונקציה המשופרת
      const headerRow = tableRows[0].join(' ');
      const testType = identifyTableType(headerRow);
      
      if (!testType) {
        console.log(`[extractTablesFromDocx] טבלה לא מזוהה, כותרת: ${headerRow.substring(0, 100)}`);
        continue;
      }
      
      console.log(`[extractTablesFromDocx] נמצאה טבלה מסוג: ${testType}, ${tableRows.length} שורות`);
      
      // זיהוי מיקום עמודות לפי כותרות
      const headerCells = tableRows[0];
      let columnMap: Record<string, number> = {};
      
      if (testType === 'ACCURACY') {
        // טבלת דיוק: סדר במסמך (מימין לשמאל): סטיה מותרת | סטיה בירידה | קריאה בירידה | סטיה בעליה | קריאה בעליה | מסה מועמסת
        columnMap = {
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance', 'error', 'סטיה']),
          downloadError: findColumnIndex(headerCells, ['סטיה בירידה', 'download error', 'error', 'ירידה']),
          downloadReading: findColumnIndex(headerCells, ['קריאה בירידה', 'download reading', 'reading', 'ירידה']),
          uploadError: findColumnIndex(headerCells, ['סטיה בעליה', 'upload error', 'error', 'עליה']),
          uploadReading: findColumnIndex(headerCells, ['קריאה בעליה', 'upload reading', 'reading', 'עליה']),
          load: findColumnIndex(headerCells, ['מסה מועמסת', 'load mass', 'load', 'mass', 'מסה'])
        };
        console.log(`[extractTablesFromDocx] ACCURACY column map:`, columnMap);
        console.log(`[extractTablesFromDocx] ACCURACY header cells:`, headerCells);
      } else if (testType === 'ECCENTRICITY') {
        // טבלת אי מרכזיות: סדר במסמך (מימין לשמאל): סטיה מותרת | סטיה בעליה | קריאה בעליה | נקודת העמסה
        columnMap = {
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance', 'error', 'סטיה']),
          uploadError: findColumnIndex(headerCells, ['סטיה בעליה', 'upload error', 'error', 'עליה']),
          uploadReading: findColumnIndex(headerCells, ['קריאה בעליה', 'upload reading', 'reading', 'עליה']),
          loadingPoint: findColumnIndex(headerCells, ['נקודת העמסה', 'loading point', 'point', 'position', 'נקודה'])
        };
        console.log(`[extractTablesFromDocx] ECCENTRICITY column map:`, columnMap);
        console.log(`[extractTablesFromDocx] ECCENTRICITY header cells:`, headerCells);
      } else if (testType === 'REPEATABILITY') {
        // טבלת הדירות: סדר במסמך (מימין לשמאל): סטיה מותרת | סטיה בקריאה | קריאת המסה | מסה מועמסת
        columnMap = {
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance', 'error', 'סטיה']),
          readingError: findColumnIndex(headerCells, ['סטיה בקריאה', 'reading error', 'error', 'קריאה']),
          massReading: findColumnIndex(headerCells, ['קריאת המסה', 'mass reading', 'reading', 'קריאה', 'מסה']),
          load: findColumnIndex(headerCells, ['מסה מועמסת', 'load mass', 'load', 'mass', 'מסה'])
        };
        console.log(`[extractTablesFromDocx] REPEATABILITY column map:`, columnMap);
        console.log(`[extractTablesFromDocx] REPEATABILITY header cells:`, headerCells);
      }
      
      // חילוץ נתונים מהשורות לפי מיקום עמודות
      console.log(`[extractTablesFromDocx] מתחיל חילוץ ${tableRows.length - 1} שורות נתונים מטבלת ${testType}`);
      for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        if (row.length === 0) {
          console.log(`[extractTablesFromDocx] שורה ${i} ריקה, מדלג`);
          continue;
        }
        
        // בדיקה אם זו שורה ריקה (רק רווחים או מקפים)
        const isEmpty = row.every(cell => !cell.trim() || cell.trim() === '-' || cell.trim() === '—');
        if (isEmpty) {
          console.log(`[extractTablesFromDocx] שורה ${i} מכילה רק מקפים/רווחים, מדלג`);
          continue;
        }
        
        console.log(`[extractTablesFromDocx] מעבד שורה ${i}/${tableRows.length - 1} של ${testType}, ${row.length} תאים:`, row.map((c, idx) => `[${idx}]=${c.substring(0, 20)}`).join(', '));
        
        // יצירת שורה לפי סוג הטבלה עם ולידציה
        try {
          if (testType === 'ACCURACY') {
            // חילוץ לפי מיקום עמודות מדויק
            const load = columnMap.load >= 0 ? parseCellValue(row[columnMap.load]) : null;
            const uploadReading = columnMap.uploadReading >= 0 ? parseCellValue(row[columnMap.uploadReading]) : null;
            const downloadReading = columnMap.downloadReading >= 0 ? parseCellValue(row[columnMap.downloadReading]) : null;
            const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : null;
            
            console.log(`[extractTablesFromDocx] ACCURACY שורה ${i} - לפי כותרות: load=${load}, uploadReading=${uploadReading}, downloadReading=${downloadReading}, mpe=${mpe}`);
            console.log(`[extractTablesFromDocx] ACCURACY שורה ${i} - תאים מקוריים (${row.length} תאים):`, row.map((c, idx) => `[${idx}]="${c}"`).join(', '));
            
            // אם לא מצאנו לפי כותרות, ננסה לפי סדר (fallback)
            // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בירידה[1], קריאה בירידה[2], סטיה בעליה[3], קריאה בעליה[4], מסה מועמסת[5]
            const finalMpe = mpe !== null ? mpe : (row.length > 0 ? parseCellValue(row[0]) : null);
            const downloadError = columnMap.downloadError >= 0 ? parseCellValue(row[columnMap.downloadError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
            const finalDownloadReading = downloadReading !== null ? downloadReading : (row.length > 2 ? parseCellValue(row[2]) : null);
            const uploadError = columnMap.uploadError >= 0 ? parseCellValue(row[columnMap.uploadError]) : (row.length > 3 ? parseCellValue(row[3]) : null);
            const finalUploadReading = uploadReading !== null ? uploadReading : (row.length > 4 ? parseCellValue(row[4]) : null);
            const finalLoad = load !== null ? load : (row.length > 5 ? parseCellValue(row[5]) : null);
            
            console.log(`[extractTablesFromDocx] ACCURACY שורה ${i} - סופי: load=${finalLoad}, uploadReading=${finalUploadReading}, downloadReading=${finalDownloadReading}, mpe=${finalMpe}`);
            console.log(`[extractTablesFromDocx] ACCURACY שורה ${i} - ערכים מחולצים:`, {
              'row[0] (mpe)': row.length > 0 ? `${row[0]} -> ${finalMpe}` : 'N/A',
              'row[1] (downloadError)': row.length > 1 ? `${row[1]} -> ${downloadError}` : 'N/A',
              'row[2] (downloadReading)': row.length > 2 ? `${row[2]} -> ${finalDownloadReading}` : 'N/A',
              'row[3] (uploadError)': row.length > 3 ? `${row[3]} -> ${uploadError}` : 'N/A',
              'row[4] (uploadReading)': row.length > 4 ? `${row[4]} -> ${finalUploadReading}` : 'N/A',
              'row[5] (load)': row.length > 5 ? `${row[5]} -> ${finalLoad}` : 'N/A'
            });
            
            const rowData = {
              load: finalLoad,
              uploadReading: finalUploadReading,
              downloadReading: finalDownloadReading,
              mpe: finalMpe,
              orderNo: tables.ACCURACY.rows.length + 1
            };
            
            if (validateAccuracyRow(rowData)) {
              tables.ACCURACY.rows.push(rowData);
              console.log(`[extractTablesFromDocx] ACCURACY שורה ${i} נוספה בהצלחה`);
            } else {
              console.warn(`[extractTablesFromDocx] שורת ACCURACY ${i} לא עברה ולידציה:`, rowData, 'תאים מקוריים:', row);
            }
          } else if (testType === 'ECCENTRICITY') {
            // חילוץ לפי מיקום עמודות מדויק
            const loadingPoint = columnMap.loadingPoint >= 0 ? parseCellValue(row[columnMap.loadingPoint]) : (tables.ECCENTRICITY.rows.length + 1);
            const uploadReading = columnMap.uploadReading >= 0 ? parseCellValue(row[columnMap.uploadReading]) : null;
            const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : null;
            const load = 10; // בדרך כלל 10 ק"ג לבדיקת אי מרכזיות
            
            console.log(`[extractTablesFromDocx] ECCENTRICITY שורה ${i} - לפי כותרות: loadingPoint=${loadingPoint}, uploadReading=${uploadReading}, mpe=${mpe}`);
            
            // Fallback אם לא מצאנו לפי כותרות
            // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בעליה[1], קריאה בעליה[2], נקודת העמסה[3]
            const finalMpe = mpe !== null ? mpe : (row.length > 0 ? parseCellValue(row[0]) : null);
            const uploadError = columnMap.uploadError >= 0 ? parseCellValue(row[columnMap.uploadError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
            const finalUploadReading = uploadReading !== null ? uploadReading : (row.length > 2 ? parseCellValue(row[2]) : null);
            const finalLoadingPoint = loadingPoint !== null ? loadingPoint : (row.length > 3 ? parseCellValue(row[3]) : (tables.ECCENTRICITY.rows.length + 1));
            
            console.log(`[extractTablesFromDocx] ECCENTRICITY שורה ${i} - סופי: loadingPoint=${finalLoadingPoint}, uploadReading=${finalUploadReading}, mpe=${finalMpe}`);
            
            const rowData = {
              load,
              loadingPoint: finalLoadingPoint,
              uploadReading: finalUploadReading,
              mpe: finalMpe,
              orderNo: tables.ECCENTRICITY.rows.length + 1
            };
            
            if (validateEccentricityRow(rowData)) {
              tables.ECCENTRICITY.rows.push(rowData);
              console.log(`[extractTablesFromDocx] ECCENTRICITY שורה ${i} נוספה בהצלחה`);
            } else {
              console.warn(`[extractTablesFromDocx] שורת ECCENTRICITY ${i} לא עברה ולידציה:`, rowData, 'תאים מקוריים:', row);
            }
          } else if (testType === 'REPEATABILITY') {
            // חילוץ לפי מיקום עמודות מדויק
            const load = columnMap.load >= 0 ? parseCellValue(row[columnMap.load]) : null;
            const massReading = columnMap.massReading >= 0 ? parseCellValue(row[columnMap.massReading]) : null;
            const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : null;
            
            console.log(`[extractTablesFromDocx] REPEATABILITY שורה ${i} - לפי כותרות: load=${load}, massReading=${massReading}, mpe=${mpe}`);
            
            // Fallback אם לא מצאנו לפי כותרות
            // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בקריאה[1], קריאת המסה[2], מסה מועמסת[3]
            const finalMpe = mpe !== null ? mpe : (row.length > 0 ? parseCellValue(row[0]) : null);
            const readingError = columnMap.readingError >= 0 ? parseCellValue(row[columnMap.readingError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
            const finalMassReading = massReading !== null ? massReading : (row.length > 2 ? parseCellValue(row[2]) : null);
            const finalLoad = load !== null ? load : (row.length > 3 ? parseCellValue(row[3]) : null);
            
            console.log(`[extractTablesFromDocx] REPEATABILITY שורה ${i} - סופי: load=${finalLoad}, massReading=${finalMassReading}, mpe=${finalMpe}`);
            
            const rowData = {
              load: finalLoad,
              massReading: finalMassReading,
              mpe: finalMpe,
              orderNo: tables.REPEATABILITY.rows.length + 1
            };
            
            if (validateRepeatabilityRow(rowData)) {
              tables.REPEATABILITY.rows.push(rowData);
              console.log(`[extractTablesFromDocx] REPEATABILITY שורה ${i} נוספה בהצלחה`);
            } else {
              console.warn(`[extractTablesFromDocx] שורת REPEATABILITY ${i} לא עברה ולידציה:`, rowData, 'תאים מקוריים:', row);
            }
          } else if (testType === 'SENSITIVITY') {
            // טבלת רגישות: מסה מועמסת, מסה נוספת, סטיה בקריאה, סטיה מותרת
            const load = numbers[0] || numbers[numbers.length - 1];
            const addLoadMass = numbers.length >= 2 ? numbers[1] : 0.001;
            const mpe = numbers.length >= 4 ? numbers[3] : (numbers.length >= 2 ? numbers[numbers.length - 1] : null);
            
            const rowData = {
              load,
              addLoadMass,
              readingError: 0,
              mpe: mpe || null,
              orderNo: tables.SENSITIVITY.rows.length + 1
            };
            
            if (rowData.load !== undefined && rowData.load !== null && rowData.load >= 0) {
              tables.SENSITIVITY.rows.push(rowData);
            }
          } else if (testType === 'TIME') {
            // טבלת זמן: זמן הקריאה, מסה מועמסת, סטיה מאיפוס 1, סטיה מאיפוס 2, סטיה מותרת
            const timeOfReading = numbers[0] || numbers[numbers.length - 1];
            const load = numbers.length >= 2 ? numbers[1] : 20;
            const zeroReadingError1 = numbers.length >= 3 ? numbers[2] : 0;
            const zeroReadingError2 = numbers.length >= 4 ? numbers[3] : 0;
            const mpe = numbers.length >= 5 ? numbers[4] : (numbers.length >= 2 ? numbers[numbers.length - 1] : null);
            
            if (timeOfReading !== undefined && timeOfReading !== null) {
              tables.TIME.rows.push({
                timeOfReading,
                load: load || 20,
                zeroReadingError1,
                zeroReadingError2,
                mpe: mpe || null,
                orderNo: tables.TIME.rows.length + 1
              });
            }
          } else if (testType === 'TARE') {
            // טבלת טרה: מסה מועמסת, סטיה מקריאה, סטיה מותרת
            const load = numbers[0] || numbers[numbers.length - 1];
            const readingError = numbers.length >= 2 ? numbers[1] : 0;
            const mpe = numbers.length >= 3 ? numbers[2] : (numbers.length >= 2 ? numbers[numbers.length - 1] : null);
            
            if (load !== undefined && load !== null && load >= 0) {
              tables.TARE.rows.push({
                load,
                readingError,
                mpe: mpe || null,
                orderNo: tables.TARE.rows.length + 1
              });
            }
          }
        } catch (error) {
          console.error(`[extractTablesFromDocx] שגיאה בעיבוד שורה ${i} בטבלה ${testType}:`, error);
          // ממשיכים לשורה הבאה במקום לעצור
        }
      }
    }
  } catch (error) {
    console.error("[extractTablesFromDocx] שגיאה בחילוץ טבלאות:", error);
    return null;
  }
  
  // הסרת טבלאות ריקות
  Object.keys(tables).forEach(key => {
    if (tables[key].rows.length === 0) {
      delete tables[key];
    }
  });
  
  const result = Object.keys(tables).length > 0 ? { tests: tables } : null;
  console.log(`[extractTablesFromDocx] סיכום: נמצאו ${Object.keys(tables).length} טבלאות לא ריקות`);
  if (result) {
    Object.keys(result.tests).forEach(key => {
      console.log(`  - ${key}: ${result.tests[key].rows.length} שורות`);
    });
  }
  
  return result;
}

// חילוץ טבלאות ישירות מה-XML (גיבוי אם mammoth נכשל)
function extractTablesFromDocxXml(docXml: string): any {
  const tables: any = {
    ACCURACY: { rows: [] },
    ECCENTRICITY: { rows: [] },
    REPEATABILITY: { rows: [] },
    SENSITIVITY: { rows: [] },
    TIME: { rows: [] },
    TARE: { rows: [] }
  };

  try {
    // חילוץ טבלאות מה-XML
    const tableRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(docXml)) !== null) {
      const tableXml = tableMatch[1];
      const rowRegex = /<w:tr>([\s\S]*?)<\/w:tr>/g;
      const tableRows: string[][] = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
        const rowXml = rowMatch[1];
        const cellRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
        const rowCells: string[] = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
          // חילוץ טקסט מהתא - חיפוש אחר <w:t> tags (שופר)
          const textMatches = cellMatch[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
          const cellTexts: string[] = [];
          for (const textMatch of textMatches) {
            let text = decodeXmlEntities(textMatch[1]);
            // ניקוי נוסף של תווים מיוחדים
            text = text.replace(/\s+/g, ' ').trim();
            if (text) cellTexts.push(text);
          }
          
          // אם לא מצאנו תגי <w:t>, ננסה תגים אחרים
          if (cellTexts.length === 0) {
            // נסיון עם תגי <w:r> (runs) שמכילים <w:t>
            const runMatches = cellMatch[1].matchAll(/<w:r[^>]*>([\s\S]*?)<\/w:r>/g);
            for (const runMatch of runMatches) {
              const runTextMatches = runMatch[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
              for (const runTextMatch of runTextMatches) {
                let text = decodeXmlEntities(runTextMatch[1]);
                text = text.replace(/\s+/g, ' ').trim();
                if (text) cellTexts.push(text);
              }
            }
          }
          
          // אם עדיין לא מצאנו, ננסה לחלץ ישירות מה-XML
          let cellText = '';
          if (cellTexts.length > 0) {
            cellText = cellTexts.join(' ').trim();
          } else {
            // חילוץ ישיר מה-XML (ללא תגי <w:t>) - שיפור: ניקוי טוב יותר
            cellText = decodeXmlEntities(cellMatch[1])
              .replace(/<w:br\s*\/?>/gi, ' ') // שורות חדשות לרווח
              .replace(/<[^>]+>/g, ' ') // הסרת תגי XML
              .replace(/\s+/g, ' ')
              .trim();
          }
          
          rowCells.push(cellText);
        }
        
        // הוספת שורה גם אם יש תאים ריקים (חשוב לשמור על סדר העמודות)
        if (rowCells.length > 0) {
          tableRows.push(rowCells);
        } else {
          // אם אין תאים, נוסיף שורה ריקה כדי לשמור על המבנה
          tableRows.push([]);
        }
      }
      
      if (tableRows.length < 2) continue; // צריך לפחות כותרת ושורה אחת
      
      // זיהוי סוג הטבלה לפי הכותרת
      const headerRow = tableRows[0].join(' ').toLowerCase();
      let testType: string | null = null;
      
      if (headerRow.includes('סטיית דיוק') || headerRow.includes('accuracy') || 
          (headerRow.includes('upload') && headerRow.includes('download')) ||
          (headerRow.includes('קריאה בעליה') && headerRow.includes('קריאה בירידה'))) {
        testType = 'ACCURACY';
      } else if (headerRow.includes('אי מרכזיות') || headerRow.includes('eccentricity') || 
                 headerRow.includes('נקודת העמסה') || headerRow.includes('loading point')) {
        testType = 'ECCENTRICITY';
      } else if (headerRow.includes('הדירות') || headerRow.includes('repeatability')) {
        testType = 'REPEATABILITY';
      } else if (headerRow.includes('רגישות') || headerRow.includes('sensitivity') || 
                 headerRow.includes('discrimination')) {
        testType = 'SENSITIVITY';
      } else if (headerRow.includes('זמן') || headerRow.includes('time') || 
                 headerRow.includes('מאיפוס')) {
        testType = 'TIME';
      } else if (headerRow.includes('טרה') || headerRow.includes('tare')) {
        testType = 'TARE';
      }
      
      if (!testType) {
        console.log(`[extractTablesFromDocxXml] טבלה לא מזוהה, כותרת: ${headerRow.substring(0, 100)}`);
        continue;
      }
      
      console.log(`[extractTablesFromDocxXml] נמצאה טבלה מסוג: ${testType}, ${tableRows.length} שורות`);
      
      // זיהוי מיקום עמודות לפי כותרות (גם בפונקציה הגיבוי)
      const headerCells = tableRows[0];
      let columnMap: Record<string, number> = {};
      
      if (testType === 'ACCURACY') {
        columnMap = {
          load: findColumnIndex(headerCells, ['מסה מועמסת', 'load mass', 'load']),
          uploadReading: findColumnIndex(headerCells, ['קריאה בעליה', 'upload reading', 'reading']),
          uploadError: findColumnIndex(headerCells, ['סטיה בעליה', 'upload error', 'error']),
          downloadReading: findColumnIndex(headerCells, ['קריאה בירידה', 'download reading']),
          downloadError: findColumnIndex(headerCells, ['סטיה בירידה', 'download error']),
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance'])
        };
      } else if (testType === 'ECCENTRICITY') {
        columnMap = {
          loadingPoint: findColumnIndex(headerCells, ['נקודת העמסה', 'loading point', 'point', 'position']),
          uploadReading: findColumnIndex(headerCells, ['קריאה בעליה', 'upload reading', 'reading']),
          uploadError: findColumnIndex(headerCells, ['סטיה בעליה', 'upload error', 'error']),
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance'])
        };
      } else if (testType === 'REPEATABILITY') {
        columnMap = {
          load: findColumnIndex(headerCells, ['מסה מועמסת', 'load mass', 'load']),
          massReading: findColumnIndex(headerCells, ['קריאת המסה', 'mass reading', 'reading']),
          readingError: findColumnIndex(headerCells, ['סטיה בקריאה', 'reading error', 'error']),
          mpe: findColumnIndex(headerCells, ['סטיה מותרת', 'permissible error', 'mpe', 'tolerance'])
        };
      }
      
      // חילוץ נתונים מהשורות לפי מיקום עמודות
      for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        if (row.length === 0) continue;
        
        // בדיקה אם זו שורה ריקה
        const isEmpty = row.every(cell => !cell.trim() || cell.trim() === '-' || cell.trim() === '—');
        if (isEmpty) continue;
        
        // יצירת שורה לפי סוג הטבלה
        if (testType === 'ACCURACY') {
          // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בירידה[1], קריאה בירידה[2], סטיה בעליה[3], קריאה בעליה[4], מסה מועמסת[5]
          const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : (row.length > 0 ? parseCellValue(row[0]) : null);
          const downloadError = columnMap.downloadError >= 0 ? parseCellValue(row[columnMap.downloadError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
          const downloadReading = columnMap.downloadReading >= 0 ? parseCellValue(row[columnMap.downloadReading]) : (row.length > 2 ? parseCellValue(row[2]) : null);
          const uploadError = columnMap.uploadError >= 0 ? parseCellValue(row[columnMap.uploadError]) : (row.length > 3 ? parseCellValue(row[3]) : null);
          const uploadReading = columnMap.uploadReading >= 0 ? parseCellValue(row[columnMap.uploadReading]) : (row.length > 4 ? parseCellValue(row[4]) : null);
          const load = columnMap.load >= 0 ? parseCellValue(row[columnMap.load]) : (row.length > 5 ? parseCellValue(row[5]) : null);
          
          if (load !== null) {
            tables.ACCURACY.rows.push({
              load,
              uploadReading: uploadReading || null,
              downloadReading: downloadReading || null,
              mpe: mpe || null,
              orderNo: tables.ACCURACY.rows.length + 1
            });
          }
        } else if (testType === 'ECCENTRICITY') {
          // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בעליה[1], קריאה בעליה[2], נקודת העמסה[3]
          const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : (row.length > 0 ? parseCellValue(row[0]) : null);
          const uploadError = columnMap.uploadError >= 0 ? parseCellValue(row[columnMap.uploadError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
          const uploadReading = columnMap.uploadReading >= 0 ? parseCellValue(row[columnMap.uploadReading]) : (row.length > 2 ? parseCellValue(row[2]) : null);
          const loadingPoint = columnMap.loadingPoint >= 0 ? parseCellValue(row[columnMap.loadingPoint]) : (row.length > 3 ? parseCellValue(row[3]) : (tables.ECCENTRICITY.rows.length + 1));
          const load = 10;
          
          if (uploadReading !== null) {
            tables.ECCENTRICITY.rows.push({
              load,
              loadingPoint: loadingPoint || (tables.ECCENTRICITY.rows.length + 1),
              uploadReading,
              mpe: mpe || null,
              orderNo: tables.ECCENTRICITY.rows.length + 1
            });
          }
        } else if (testType === 'REPEATABILITY') {
          // סדר העמודות במסמך המקורי (מימין לשמאל): סטיה מותרת[0], סטיה בקריאה[1], קריאת המסה[2], מסה מועמסת[3]
          const mpe = columnMap.mpe >= 0 ? parseCellValue(row[columnMap.mpe]) : (row.length > 0 ? parseCellValue(row[0]) : null);
          const readingError = columnMap.readingError >= 0 ? parseCellValue(row[columnMap.readingError]) : (row.length > 1 ? parseCellValue(row[1]) : null);
          const massReading = columnMap.massReading >= 0 ? parseCellValue(row[columnMap.massReading]) : (row.length > 2 ? parseCellValue(row[2]) : null);
          const load = columnMap.load >= 0 ? parseCellValue(row[columnMap.load]) : (row.length > 3 ? parseCellValue(row[3]) : null);
          
          if (load !== null && massReading !== null) {
            tables.REPEATABILITY.rows.push({
              load,
              massReading,
              mpe: mpe || null,
              orderNo: tables.REPEATABILITY.rows.length + 1
            });
          }
        } else if (testType === 'SENSITIVITY') {
          const load = row.length > 0 ? parseCellValue(row[0]) : null;
          const addLoadMass = row.length > 1 ? parseCellValue(row[1]) : 0.001;
          const mpe = row.length > 3 ? parseCellValue(row[3]) : null;
          
          if (load !== null) {
            tables.SENSITIVITY.rows.push({
              load,
              addLoadMass: addLoadMass || 0.001,
              readingError: 0,
              mpe: mpe || null,
              orderNo: tables.SENSITIVITY.rows.length + 1
            });
          }
        } else if (testType === 'TIME') {
          const timeOfReading = row.length > 0 ? parseCellValue(row[0]) : null;
          const load = row.length > 1 ? parseCellValue(row[1]) : 20;
          const zeroReadingError1 = row.length > 2 ? parseCellValue(row[2]) : 0;
          const zeroReadingError2 = row.length > 3 ? parseCellValue(row[3]) : 0;
          const mpe = row.length > 4 ? parseCellValue(row[4]) : null;
          
          if (timeOfReading !== null) {
            tables.TIME.rows.push({
              timeOfReading,
              load: load || 20,
              zeroReadingError1: zeroReadingError1 || 0,
              zeroReadingError2: zeroReadingError2 || 0,
              mpe: mpe || null,
              orderNo: tables.TIME.rows.length + 1
            });
          }
        } else if (testType === 'TARE') {
          const load = row.length > 0 ? parseCellValue(row[0]) : null;
          const readingError = row.length > 1 ? parseCellValue(row[1]) : 0;
          const mpe = row.length > 2 ? parseCellValue(row[2]) : null;
          
          if (load !== null) {
            tables.TARE.rows.push({
              load,
              readingError: readingError || 0,
              mpe: mpe || null,
              orderNo: tables.TARE.rows.length + 1
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("[extractTablesFromDocxXml] שגיאה:", error);
    return null;
  }
  
  // הסרת טבלאות ריקות
  Object.keys(tables).forEach(key => {
    if (tables[key].rows.length === 0) {
      delete tables[key];
    }
  });
  
  const result = Object.keys(tables).length > 0 ? { tests: tables } : null;
  console.log(`[extractTablesFromDocxXml] סיכום: נמצאו ${Object.keys(tables).length} טבלאות לא ריקות`);
  if (result) {
    Object.keys(result.tests).forEach(key => {
      console.log(`  - ${key}: ${result.tests[key].rows.length} שורות`);
    });
  }
  
  return result;
}

// חילוץ גבולות העמסה מהטבלאות
function extractLoadLimitsFromTables(html: string): { minLoad?: number; maxLoad?: number } {
  const result: { minLoad?: number; maxLoad?: number } = {};
  
  try {
    // חיפוש טבלת גבולות העמסה
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];
      const headerRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || '';
      const headerText = headerRow
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      
      // בדיקה אם זו טבלת גבולות העמסה
      if (headerText.includes('גבול') && (headerText.includes('עליון') || headerText.includes('תחתון')) && headerText.includes('העמסה')) {
        console.log(`[extractLoadLimitsFromTables] נמצאה טבלת גבולות העמסה`);
        
        // חילוץ שורות מהטבלה
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        const rows: string[][] = [];
        
        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
          const rowHtml = rowMatch[1];
          const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
          const cells: string[] = [];
          let cellMatch;
          
          while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            const cellText = cellMatch[1]
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            cells.push(cellText);
          }
          
          if (cells.length > 0) {
            rows.push(cells);
          }
        }
        
        // חילוץ ערכים מהשורות
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < 2) continue;
          
          // חילוץ מספרים מהתאים
          const numbers: number[] = [];
          for (const cell of row) {
            let cleaned = cell.replace(/[^\d.,\-\s]/g, ' ').trim();
            cleaned = cleaned.replace(/(\d)\s+\./g, '$1.').replace(/\.\s+(\d)/g, '.$1');
            cleaned = cleaned.replace(/,/g, '.');
            cleaned = cleaned.replace(/\s+/g, '');
            
            const numMatches = cleaned.match(/-?\d+\.?\d*/g);
            if (numMatches) {
              for (const numStr of numMatches) {
                const num = parseFloat(numStr);
                if (!isNaN(num) && num > 0) numbers.push(num);
              }
            }
          }
          
          // אם יש שני מספרים, הראשון הוא תחתון והשני עליון
          if (numbers.length >= 2) {
            result.minLoad = numbers[0];
            result.maxLoad = numbers[1];
            console.log(`[extractLoadLimitsFromTables] נמצאו גבולות: תחתון=${result.minLoad}, עליון=${result.maxLoad}`);
            break;
          } else if (numbers.length === 1) {
            // אם יש רק מספר אחד, נבדוק לפי מיקום העמודה
            const headerCells = rows[0];
            if (headerCells.length >= 2) {
              const firstColHeader = headerCells[0].toLowerCase();
              const secondColHeader = headerCells[1].toLowerCase();
              
              if (firstColHeader.includes('תחתון') && row[0]) {
                result.minLoad = numbers[0];
              } else if (firstColHeader.includes('עליון') && row[0]) {
                result.maxLoad = numbers[0];
              }
              
              if (secondColHeader.includes('תחתון') && row[1]) {
                result.minLoad = numbers[0];
              } else if (secondColHeader.includes('עליון') && row[1]) {
                result.maxLoad = numbers[0];
              }
            }
          }
        }
        
        if (result.minLoad || result.maxLoad) {
          break; // מצאנו את הטבלה, נעצור
        }
      }
    }
  } catch (error) {
    console.error("[extractLoadLimitsFromTables] שגיאה:", error);
  }
  
  return result;
}

function cleanSerial(s: string) {
  if (!s) return "";
  // ניקוי מספר סידורי - שומר על אותיות, מספרים, מקפים וסלאשים
  // מסיר רווחים וסימנים מיוחדים אחרים
  return s.replace(/[^\w\-\/]/g, "").trim();
}

function pickFirstMatch(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const result = String(m[1]).trim();
      // הסרת רווחים מיותרים ותווים לא רצויים
      return result.replace(/\s+/g, " ").replace(/^[\s\-:]+|[\s\-:]+$/g, "");
    }
  }
  return undefined;
}

function pickNumber(text: string, patterns: RegExp[]) {
  const s = pickFirstMatch(text, patterns);
  if (!s) return undefined;
  // הסרת רווחים ונקודות/פסיקים - תומך ב-"0. 02" או "0,02"
  // גם תומך ב-"150. 5" או "150,5"
  let cleaned = String(s).trim();
  // החלפת פסיק בנקודה
  cleaned = cleaned.replace(/,/g, ".");
  // הסרת רווחים בין ספרות ונקודות עשרוניות
  cleaned = cleaned.replace(/(\d)\s+\./g, "$1.").replace(/\.\s+(\d)/g, ".$1");
  // הסרת כל הרווחים הנותרים
  cleaned = cleaned.replace(/\s+/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && !isNaN(n) ? n : undefined;
}

function pickUnit(text: string) {
  // ק"ג = kg
  if (text.match(/ק"ג/i)) return "kg";
  const m = text.match(/\b(kg|g|mg)\b/i);
  if (!m) return undefined;
  const u = m[1].toLowerCase();
  if (u === "kg" || u === "g" || u === "mg") return u;
  return undefined;
}

function pickClass(text: string) {
  const cls = pickFirstMatch(text, [
    /\bClass\s*(I{1,3})\b/i,
    /דיוק\s*[:\-]?\s*(I{1,3})/i,
    /\bAccuracy\s*Class\s*[:\-]?\s*(I{1,3})\b/i
  ]);
  if (!cls) return undefined;
  const c = cls.toUpperCase() as any;
  if (c === "I" || c === "II" || c === "III") return c;
  return undefined;
}

function pickDate(text: string) {
  // תאריך בפורמט dd/mm/yyyy או dd.mm.yyyy או dd-mm-yyyy
  const patterns = [
    /\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})\b/,
    /תאריך\s*בדיקה\s*[:\-]\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-]?(\d{2,4})?/i,
    /תאריך\s*[:\-]\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-]?(\d{2,4})?/i
  ];
  
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear();
      
      if (Number.isFinite(d) && Number.isFinite(mo) && Number.isFinite(y)) {
        // בדיקה שהתאריך תקין
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
          const dt = new Date(y, mo - 1, d);
          if (!isNaN(dt.getTime())) return dt;
        }
      }
    }
  }
  return undefined;
}

function parseDocxTextToExtracted(fileName: string, text: string): Extracted {
  // שם לקוח - תבניות משופרות
  const customerName = pickFirstMatch(text, [
    /שם\s*הלקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /שם\s*לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Customer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /שם\s*הלקוח\s*[:\-]\s*([^\n\r]+)/i,
    /שם\s*לקוח\s*[:\-]\s*([^\n\r]+)/i
  ]);

  const customerNo = pickFirstMatch(text, [
    /מס['״]?\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /מספר\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /Customer\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const address = pickFirstMatch(text, [
    /כתובת\s*[:\-]\s*([^\n]+)\n?/i,
    /Address\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const phone = pickFirstMatch(text, [
    /טלפון\s*[:\-]\s*([^\n]+)\n?/i,
    /Phone\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const serialMfg = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*סידורי\s*(?:יצרן)?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מספר\s*סידורי\s*(?:יצרן)?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מס['״]?\s*סידורי\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מספר\s*סידורי\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /Serial\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /S\/N\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /Serial\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
    ]) || ""
  ) || undefined;

  const serialInternal = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /מספר\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /מס['״]?\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /Internal\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
    ]) || ""
  ) || undefined;

  const manufacturer = pickFirstMatch(text, [
    /שם\s*יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Manufacturer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Maker\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /יצרן\s*[:\-]\s*([^\n\r]+)/i
  ]);

  const deviceType = pickFirstMatch(text, [
    /שם\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /סוג\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Device\s*Type\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Type\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /סוג\s*מכשיר\s*[:\-]\s*([^\n\r]+)/i,
    /שם\s*מכשיר\s*[:\-]\s*([^\n\r]+)/i
  ]);

  // דגם יכול להיות גם סוג מכשיר או שם יצרן + סוג מכשיר
  // הוספת חיפוש אחר "שם משקל" ו"דגם משקל"
  const modelName = pickFirstMatch(text, [
    /שם\s*משקל\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*משקל\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Model\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Model\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*[:\-]\s*([^\n\r]+)/i,
    /שם\s*משקל\s*[:\-]\s*([^\n\r]+)/i,
    /דגם\s*משקל\s*[:\-]\s*([^\n\r]+)/i
  ]) || (deviceType ? `${manufacturer || ''} ${deviceType}`.trim() : undefined);

  // כושר העמסה או כושר שקילה - תומך ב-"150" או "150. 5"
  // שני המונחים מטופלים באותה צורה
  const capacity = pickNumber(text, [
    /כושר\s*העמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*שקילה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bMax(?:imum)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bCapacity\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מקסימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // יחידה - ק"ג או kg
  // שני המונחים מטופלים באותה צורה
  let unit = pickFirstMatch(text, [
    /כושר\s*העמסה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר\s*שקילה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /\bMax(?:imum)?\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(kg|g|mg)\b/i,
    /\bCapacity\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(kg|g|mg)\b/i
  ]);
  
  // המרת ק"ג ל-kg
  if (unit && unit.includes("ק")) unit = "kg";
  
  if (!unit) {
    // נסה למצוא יחידה בכל הטקסט
    if (text.match(/ק"ג/i)) unit = "kg";
    else unit = pickUnit(text);
  }

  // ערך חלוקה ממשית ( d ) או d - תומך ב-"0. 02" עם רווח
  const d = pickNumber(text, [
    /ערך\s*חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /ערך\s*חלוקה\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה(?:\s*d)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // ערך חלוקה לכיול ( e ) או e - תומך ב-"0. 2" עם רווח
  const e = pickNumber(text, [
    /ערך\s*חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /ערך\s*חלוקה\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כיול(?:\s*e)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const divisionsN = pickNumber(text, [
    /מספר\s*חלוקות\s*[:\-]\s*(\d+)/i,
    /Divisions\s*[:\-]\s*(\d+)/i,
    /N\s*[:\-]\s*(\d+)/i,
    /divisionsN\s*[:\-]\s*(\d+)/i
  ]);

  // רמת דיוק או דיוק
  const accuracyCls = pickClass(text) || pickFirstMatch(text, [
    /רמת\s*דיוק\s*[:\-]\s*(I{1,3})/i,
    /דרגת\s*דיוק\s*[:\-]\s*(I{1,3})/i,
    /דיוק\s*[:\-]\s*(I{1,3})/i,
    /רמת\s*דיוק\s*(I{1,3})/i,
    /דרגת\s*דיוק\s*(I{1,3})/i,
    /\bClass\s*(I{1,3})\b/i
  ])?.toUpperCase() as any;

  // גבול תחתון להעמסה - חיפוש משופר
  const minLoad = pickNumber(text, [
    /גבול\s*תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*תחתון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*תחתון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Min(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /Lower\s*Limit\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מינימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // גבול עליון להעמסה - חיפוש משופר
  const maxLoad = pickNumber(text, [
    /גבול\s*עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*עליון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*עליון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Max(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /Upper\s*Limit\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מקסימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // תאריך בדיקה - שימוש בפונקציה המשופרת
  const testDate = pickDate(text);

  // דוח מספר: 24-1155 או דו"ח מספר
  const reportNo = pickFirstMatch(text, [
    /דו"ח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /דוח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /מס['״]?\s*דוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Report\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דו"ח\s*מס['״]?\s*[:\-]\s*([^\s\n\r]+)/i,
    /דוח\s*מס['״]?\s*[:\-]\s*([^\s\n\r]+)/i
  ]);

  return {
    fileName,
    customerName,
    customerNo,
    address,
    phone,
    serialMfg,
    serialInternal,
    manufacturer,
    deviceType,
    modelName,
    capacity,
    unit: unit as any,
    d,
    e,
    divisionsN,
    accuracyCls: accuracyCls as any,
    minLoad,
    maxLoad,
    testDate,
    reportNo
  };
}

async function upsertCustomer(ex: Extracted) {
  if (!ex.customerName) return null;

  const name = ex.customerName.trim();
  const customerNo = ex.customerNo ? ex.customerNo.trim() : null;

  const existing = customerNo
    ? await prisma.customer.findFirst({ where: { customerNo } })
    : await prisma.customer.findFirst({ where: { name } });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name,
        customerNo: customerNo ?? existing.customerNo,
        address: ex.address ?? existing.address,
        phone: ex.phone ?? existing.phone
      }
    });
  }

  return prisma.customer.create({
    data: {
      name,
      customerNo,
      address: ex.address ?? null,
      phone: ex.phone ?? null
    }
  });
}

// פונקציה זו הוחלפה ב-scaleMatcher.ts - נשמרת כאן רק לתאימות לאחור
async function upsertScale(ex: Extracted, customerId: string | null, modelId: string | null) {
  return findOrCreateScale(
    {
      serialMfg: ex.serialMfg,
      serialInternal: ex.serialInternal,
      manufacturer: ex.manufacturer,
      modelName: ex.modelName,
      deviceType: ex.deviceType
    },
    customerId,
    modelId
  );
}

async function upsertScaleModel(ex: Extracted) {
  // צריך לפחות manufacturer ו-modelName ליצירת ScaleModel
  // אם אין modelName, ננסה להשתמש ב-deviceType
  const manufacturer = ex.manufacturer?.trim();
  const modelName = ex.modelName?.trim() || ex.deviceType?.trim();
  
  if (!manufacturer || !modelName) {
    return null;
  }

  // אם אין פרמטרים מטרולוגיים, לא נוכל ליצור ScaleModel מלא
  // אבל ננסה למצוא ScaleModel קיים לפי manufacturer + modelName בלבד
  if (ex.capacity == null || ex.d == null || ex.e == null || !ex.unit || !ex.accuracyCls) {
    // חיפוש ScaleModel קיים לפי manufacturer + modelName בלבד
    const existing = await prisma.scaleModel.findFirst({
      where: {
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        modelName: { equals: modelName, mode: "insensitive" }
      }
    });
    return existing || null;
  }

  // חיפוש ScaleModel קיים לפי manufacturer + modelName
  const existing = await prisma.scaleModel.findFirst({
    where: {
      manufacturer: { equals: manufacturer, mode: "insensitive" },
      modelName: { equals: modelName, mode: "insensitive" }
    }
  });

  if (existing) {
    // עדכון ScaleModel קיים - עדכן פרמטרים מטרולוגיים אם השתנו
    // וקשר לפרופיל אם לא היה קישור
    return prisma.scaleModel.update({
      where: { id: existing.id },
      data: {
        maxCapacity: ex.capacity as any,
        unit: ex.unit,
        d: ex.d as any,
        e: ex.e as any,
        accuracyClass: ex.accuracyCls,
        isActive: true
      }
    });
  }

  // יצירת ScaleModel חדש
  return prisma.scaleModel.create({
    data: {
      manufacturer,
      modelName,
      maxCapacity: ex.capacity as any,
      unit: ex.unit,
      d: ex.d as any,
      e: ex.e as any,
      accuracyClass: ex.accuracyCls,
      isActive: true
    }
  });
}

async function createHistoricalCalibration(params: {
  ex: Extracted;
  customerId: string | null;
  scaleId: string | null;
  tablesData?: any;
}) {
  // בדיקה אם כבר קיים כיול - נבדוק לפי מספר אפשרויות:
  // 1. reportNo (אם קיים)
  // 2. שם קובץ (sourceFile)
  // 3. שילוב של לקוח + משקל + תאריך בדיקה
  
  let existingCalibration = null;
  
  // בדיקה 1: לפי reportNo
  if (params.ex.reportNo) {
    existingCalibration = await prisma.calibration.findFirst({
      where: {
        reportNo: params.ex.reportNo,
        notes: { contains: "Imported from" }
      }
    });
    
    if (existingCalibration) {
      console.log(`[createHistoricalCalibration] כיול עם reportNo ${params.ex.reportNo} כבר קיים, מדלג`);
      return null; // לא ניצור כפילות
    }
  }
  
  // בדיקה 2: לפי שם קובץ (sourceFile)
  if (params.ex.fileName) {
    const calibrationsWithSameFile = await prisma.calibration.findMany({
      where: {
        notes: { contains: `Imported from certificate document: ${params.ex.fileName}` }
      }
    });
    
    if (calibrationsWithSameFile.length > 0) {
      console.log(`[createHistoricalCalibration] כיול עם קובץ ${params.ex.fileName} כבר קיים, מדלג`);
      return null; // לא ניצור כפילות
    }
  }
  
  // בדיקה 3: לפי שילוב של לקוח + משקל + תאריך בדיקה (אם כל הנתונים קיימים)
  if (params.customerId && params.scaleId && params.ex.testDate) {
    const testDateStart = new Date(params.ex.testDate);
    testDateStart.setHours(0, 0, 0, 0);
    const testDateEnd = new Date(params.ex.testDate);
    testDateEnd.setHours(23, 59, 59, 999);
    
    existingCalibration = await prisma.calibration.findFirst({
      where: {
        customerId: params.customerId,
        scaleId: params.scaleId,
        testDate: {
          gte: testDateStart,
          lte: testDateEnd
        },
        notes: { contains: "Imported from" }
      }
    });
    
    if (existingCalibration) {
      console.log(`[createHistoricalCalibration] כיול עם לקוח ${params.customerId}, משקל ${params.scaleId}, תאריך ${params.ex.testDate.toISOString()} כבר קיים, מדלג`);
      return null; // לא ניצור כפילות
    }
  }
  
  const testDate = params.ex.testDate ?? new Date();
  const nextDueDate = new Date(new Date(testDate).setFullYear(new Date(testDate).getFullYear() + 1));

  // בניית measurementsJson עם נתונים מחולצים וטבלאות
  const measurementsJson: any = {
    imported: true,
    sourceFile: params.ex.fileName,
    extracted: {
      customerName: params.ex.customerName ?? null,
      serialMfg: params.ex.serialMfg ?? null,
      serialInternal: params.ex.serialInternal ?? null,
      manufacturer: params.ex.manufacturer ?? null,
      deviceType: params.ex.deviceType ?? null,
      modelName: params.ex.modelName ?? null,
      capacity: params.ex.capacity ?? null,
      unit: params.ex.unit ?? null,
      d: params.ex.d ?? null,
      e: params.ex.e ?? null,
      divisionsN: params.ex.divisionsN ?? null,
      accuracyCls: params.ex.accuracyCls ?? null,
      minLoad: params.ex.minLoad ?? null,
      maxLoad: params.ex.maxLoad ?? null,
      testDate: params.ex.testDate ? params.ex.testDate.toISOString() : null,
      reportNo: params.ex.reportNo ?? null
    }
  };

  // הוספת טבלאות אם קיימות
  if (params.tablesData && params.tablesData.tests) {
    measurementsJson.tests = params.tablesData.tests;
  }

  // יצירת כיול עם סטטוס CERTIFICATE_ISSUED (כי אלו תעודות שהונפקו)
  const calibration = await prisma.calibration.create({
    data: {
      reportNo: params.ex.reportNo ?? null,
      status: "CERTIFICATE_ISSUED" as any,
      customerId: params.customerId,
      scaleId: params.scaleId,
      testDate,
      nextDueDate,
      notes: `Imported from certificate document: ${params.ex.fileName}`,
      measurementsJson: measurementsJson as any
    }
  });

  // יצירת תעודה (Certificate) - המסמכים הם תעודות שהונפקו
  // מספר התעודה הוא מספר הדוח (reportNo) או מספר ייחודי מהקובץ
  const certificateNo = params.ex.reportNo || `IMPORT-${calibration.id.slice(0, 8)}`;
  
  // בדיקה אם כבר קיימת תעודה עם אותו מספר
  const existingCert = await prisma.certificate.findUnique({
    where: { certificateNo }
  });

  if (!existingCert) {
    await prisma.certificate.create({
      data: {
        calibrationId: calibration.id,
        certificateNo: certificateNo,
        issuedAt: testDate,
        pdfPath: `imported/${params.ex.fileName}` // נתיב למסמך המקורי
      }
    });
  }
  
  return calibration;
}

async function processDocxFile(buffer: Buffer, filename: string) {
  const inner = new AdmZip(buffer);
  const docXml = inner.getEntry("word/document.xml")?.getData().toString("utf-8");
  if (!docXml) throw new Error("Missing word/document.xml");

  const text = stripXmlTags(docXml);
  const ex = parseDocxTextToExtracted(filename, text);

  // ניקוי ושמירה של נתונים - הסרת רווחים מיותרים
  if (ex.customerName) ex.customerName = ex.customerName.trim();
  if (ex.manufacturer) ex.manufacturer = ex.manufacturer.trim();
  if (ex.modelName) ex.modelName = ex.modelName.trim();
  if (ex.deviceType) ex.deviceType = ex.deviceType.trim();

  // חילוץ טבלאות מהמסמך - נסה עם mammoth ואז עם XML ישירות
  let tablesData = await extractTablesFromDocx(buffer);
  
  // חילוץ גבולות העמסה מהטבלאות
  let loadLimits: { minLoad?: number; maxLoad?: number } = {};
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    loadLimits = extractLoadLimitsFromTables(htmlResult.value);
    
    // עדכון ex עם הערכים מהטבלאות אם לא נמצאו בטקסט
    if (!ex.minLoad && loadLimits.minLoad) {
      ex.minLoad = loadLimits.minLoad;
      console.log(`[processDocxFile] עודכן minLoad מהטבלה: ${ex.minLoad}`);
    }
    if (!ex.maxLoad && loadLimits.maxLoad) {
      ex.maxLoad = loadLimits.maxLoad;
      console.log(`[processDocxFile] עודכן maxLoad מהטבלה: ${ex.maxLoad}`);
    }
  } catch (error) {
    console.error("[processDocxFile] שגיאה בחילוץ גבולות העמסה:", error);
  }
  
  // אם mammoth לא מצא טבלאות, ננסה לחלץ ישירות מה-XML
  if (!tablesData || !tablesData.tests || Object.keys(tablesData.tests).length === 0) {
    console.log(`[processDocxFile] mammoth לא מצא טבלאות, מנסה לחלץ ישירות מה-XML`);
    tablesData = extractTablesFromDocxXml(docXml);
  }

  const customer = await upsertCustomer(ex);
  // יצירת/עדכון ScaleModel לפני יצירת המשקל
  const scaleModel = await upsertScaleModel(ex);
  
  // יצירת/עדכון משקל עם קישור ל-ScaleModel - שימוש ב-scaleMatcher
  const scale = await findOrCreateScale(
    {
      serialMfg: ex.serialMfg,
      serialInternal: ex.serialInternal,
      manufacturer: ex.manufacturer,
      modelName: ex.modelName,
      deviceType: ex.deviceType
    },
    customer?.id ?? null,
    scaleModel?.id ?? null
  );

  // יצירת רשומת DocumentImport
  let documentImport = null;
  try {
    documentImport = await prisma.documentImport.create({
      data: {
        fileName: filename,
        status: "PENDING",
        scaleId: scale?.id ?? null,
      }
    });
  } catch (error) {
    console.error("[processDocxFile] שגיאה ביצירת DocumentImport:", error);
  }

  // יצירת כיול - שימוש ב-calibrationImporter
  const calibrationResult = await createImportedCalibration({
    extracted: {
      fileName: ex.fileName,
      reportNo: ex.reportNo,
      testDate: ex.testDate,
      customerName: ex.customerName,
      serialMfg: ex.serialMfg,
      serialInternal: ex.serialInternal,
      manufacturer: ex.manufacturer,
      deviceType: ex.deviceType,
      modelName: ex.modelName,
      capacity: ex.capacity,
      unit: ex.unit,
      d: ex.d,
      e: ex.e,
      divisionsN: ex.divisionsN,
      accuracyCls: ex.accuracyCls,
      minLoad: ex.minLoad,
      maxLoad: ex.maxLoad
    },
    customerId: customer?.id ?? null,
    scaleId: scale?.id ?? null,
    tablesData
  });

  // עדכון DocumentImport עם תוצאות
  if (documentImport && calibrationResult.calibration) {
    // עדכון סטטוס DocumentImport
    await prisma.documentImport.update({
      where: { id: documentImport.id },
      data: {
        status: calibrationResult.created ? "SUCCESS" : "SUCCESS"
      }
    });
    
    // עדכון Calibration עם קישור ל-DocumentImport
    await prisma.calibration.update({
      where: { id: calibrationResult.calibration.id },
      data: {
        importedFromDocumentId: documentImport.id
      }
    });
  }
  
  // החזרת התוצאה כדי לדעת אם נוצר כיול חדש או שהיה קיים
  return calibrationResult.calibration;
}

documentsRouter.post(
  "/documents",
  requireAuth,
  requireRole(["OFFICE", "ADMIN"]),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    let processed = 0;
    let errors: string[] = [];

    try {
      if (req.file.originalname.endsWith(".zip")) {
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          if (entry.entryName.endsWith(".docx") && !entry.entryName.startsWith("__MACOSX")) {
            try {
              const docBuffer = entry.getData();
              const result = await processDocxFile(docBuffer, entry.entryName);
              if (result) {
                processed++;
              } else {
                // אם processDocxFile החזיר null, זה אומר שהמסמך כבר קיים
                console.log(`[documentsRouter] מסמך ${entry.entryName} כבר קיים, מדלג`);
              }
            } catch (e: any) {
              errors.push(`${entry.entryName}: ${e.message}`);
            }
          }
        }
      } else if (req.file.originalname.endsWith(".docx")) {
        const result = await processDocxFile(req.file.buffer, req.file.originalname);
        if (result) {
          processed = 1;
        } else {
          // אם processDocxFile החזיר null, זה אומר שהמסמך כבר קיים
          console.log(`[documentsRouter] מסמך ${req.file.originalname} כבר קיים, מדלג`);
        }
      } else {
        return res.status(400).json({ error: "File must be ZIP or DOCX" });
      }

      res.json({ processed, errors: errors.length > 0 ? errors : undefined });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// Endpoint לעיבוד מחדש של כיול ספציפי עם קובץ חדש
documentsRouter.post(
  "/reprocess-calibration/:calibrationId",
  requireAuth,
  requireRole(["OFFICE", "ADMIN"]),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    
    const calibrationId = req.params.calibrationId;
    
    try {
      const calibration = await prisma.calibration.findUnique({
        where: { id: calibrationId }
      });
      
      if (!calibration) {
        return res.status(404).json({ error: "Calibration not found" });
      }
      
      // חילוץ טבלאות מהקובץ
      let tablesData = null;
      
      if (req.file.originalname.endsWith(".docx")) {
        tablesData = await extractTablesFromDocx(req.file.buffer);
      } else if (req.file.originalname.endsWith(".zip")) {
        const zip = new AdmZip(req.file.buffer);
        const entries = zip.getEntries().filter(e => 
          !e.isDirectory && e.entryName.toLowerCase().endsWith(".docx")
        );
        
        // נסה למצוא את הקובץ המתאים לפי reportNo או שם קובץ
        const measurementsJson = calibration.measurementsJson as any;
        const sourceFile = measurementsJson?.sourceFile || measurementsJson?.extracted?.sourceFile;
        
        let foundEntry = null;
        if (sourceFile) {
          foundEntry = entries.find(e => 
            e.entryName.includes(sourceFile) || 
            e.entryName.toLowerCase().includes(sourceFile.toLowerCase())
          );
        }
        
        if (!foundEntry && entries.length > 0) {
          foundEntry = entries[0]; // קח את הראשון אם לא מצאנו התאמה
        }
        
        if (foundEntry) {
          const docBuffer = foundEntry.getData();
          tablesData = await extractTablesFromDocx(docBuffer);
        }
      }
      
      if (!tablesData || !tablesData.tests || Object.keys(tablesData.tests).length === 0) {
        return res.status(400).json({ 
          error: "No tables found in the document",
          message: "לא נמצאו טבלאות במסמך. אנא ודא שהמסמך מכיל טבלאות מדידות."
        });
      }
      
      // עדכון measurementsJson עם הטבלאות
      const measurementsJson = calibration.measurementsJson as any || {};
      const updatedMeasurementsJson = {
        ...measurementsJson,
        tests: tablesData.tests
      };
      
      await prisma.calibration.update({
        where: { id: calibrationId },
        data: {
          measurementsJson: updatedMeasurementsJson as any
        }
      });
      
      res.json({ 
        success: true,
        message: `עודכנו ${Object.keys(tablesData.tests).length} טבלאות`,
        tables: Object.keys(tablesData.tests)
      });
    } catch (e: any) {
      console.error("Error reprocessing calibration:", e);
      res.status(500).json({ error: e.message });
    }
  }
);
