import { prisma } from "../db/prisma.js";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

// העתקת הפונקציות הנדרשות מ-documents.ts
function decodeXmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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

function pickNumber(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      let cleaned = String(m[1]).trim();
      cleaned = cleaned.replace(/,/g, ".");
      cleaned = cleaned.replace(/(\d)\s+\./g, "$1.").replace(/\.\s+(\d)/g, ".$1");
      cleaned = cleaned.replace(/\s+/g, "");
      const n = Number(cleaned);
      if (Number.isFinite(n) && !isNaN(n)) return n;
    }
  }
  return undefined;
}

// חילוץ טבלאות מהמסמך DOCX
function extractTablesFromDocx(docXml: string): any {
  const tables: any = {
    ACCURACY: { rows: [] },
    ECCENTRICITY: { rows: [] },
    REPEATABILITY: { rows: [] },
    SENSITIVITY: { rows: [] },
    TIME: { rows: [] },
    TARE: { rows: [] }
  };

  // חילוץ טבלאות מה-XML
  const tableMatches = Array.from(docXml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g));
  
  for (const tableMatch of tableMatches) {
    const tableXml = tableMatch[1];
    const rows = Array.from(tableXml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g));
    const tableRows: string[][] = [];
    
    for (const rowMatch of rows) {
      const rowXml = rowMatch[1];
      const cells = Array.from(rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g));
      const rowCells: string[] = [];
      
      for (const cellMatch of cells) {
        const cellText = stripXmlTags(cellMatch[1]).trim();
        rowCells.push(cellText);
      }
      
      if (rowCells.length > 0) {
        tableRows.push(rowCells);
      }
    }
    
    if (tableRows.length < 2) continue; // צריך לפחות כותרת ושורה אחת
    
    // זיהוי סוג הטבלה לפי הכותרת
    const headerRow = tableRows[0].join(' ').toLowerCase();
    let testType: string | null = null;
    
    if (headerRow.includes('סטיית דיוק') || headerRow.includes('accuracy') || headerRow.includes('upload') || headerRow.includes('download')) {
      testType = 'ACCURACY';
    } else if (headerRow.includes('אי מרכזיות') || headerRow.includes('eccentricity') || headerRow.includes('נקודת העמסה') || headerRow.includes('loading point')) {
      testType = 'ECCENTRICITY';
    } else if (headerRow.includes('הדירות') || headerRow.includes('repeatability') || headerRow.includes('קריאת המסה')) {
      testType = 'REPEATABILITY';
    } else if (headerRow.includes('רגישות') || headerRow.includes('sensitivity') || headerRow.includes('discrimination') || headerRow.includes('מסה נוספת')) {
      testType = 'SENSITIVITY';
    } else if (headerRow.includes('זמן') || headerRow.includes('time') || headerRow.includes('מאיפוס')) {
      testType = 'TIME';
    } else if (headerRow.includes('טרה') || headerRow.includes('tare')) {
      testType = 'TARE';
    }
    
    if (!testType) continue;
    
    // חילוץ נתונים מהשורות
    for (let i = 1; i < tableRows.length; i++) {
      const row = tableRows[i];
      if (row.length === 0) continue;
      
      // ניסיון לחלץ מספרים מהשורה
      const numbers = row.map(cell => {
        const cleaned = cell.replace(/[^\d.,\-\s]/g, '').trim();
        const num = pickNumber(cleaned, [/^([\d.,\-\s]+)$/]);
        return num;
      }).filter(n => n !== undefined) as number[];
      
      if (numbers.length === 0) continue;
      
      // יצירת שורה לפי סוג הטבלה
      if (testType === 'ACCURACY' && row.length >= 6) {
        const load = numbers[0] ?? numbers[numbers.length - 1];
        const uploadReading = numbers[1] ?? numbers[2];
        const downloadReading = numbers[3] ?? numbers[4];
        const mpe = numbers[numbers.length - 1] ?? numbers[numbers.length - 2];
        
        if (load !== undefined) {
          tables.ACCURACY.rows.push({
            load,
            uploadReading: uploadReading ?? null,
            downloadReading: downloadReading ?? null,
            mpe: mpe ?? null,
            orderNo: tables.ACCURACY.rows.length + 1
          });
        }
      } else if (testType === 'ECCENTRICITY' && row.length >= 4) {
        const loadingPoint = numbers[0] ?? tables.ECCENTRICITY.rows.length + 1;
        const uploadReading = numbers[1] ?? numbers[2];
        const mpe = numbers[numbers.length - 1];
        const load = 10; // בדרך כלל 10 ק"ג לבדיקת אי מרכזיות
        
        if (uploadReading !== undefined) {
          tables.ECCENTRICITY.rows.push({
            load,
            loadingPoint,
            uploadReading,
            mpe: mpe ?? null,
            orderNo: tables.ECCENTRICITY.rows.length + 1
          });
        }
      } else if (testType === 'REPEATABILITY' && row.length >= 4) {
        const load = numbers[0] ?? numbers[numbers.length - 1];
        const massReading = numbers[1] ?? numbers[2];
        const mpe = numbers[numbers.length - 1];
        
        if (load !== undefined && massReading !== undefined) {
          tables.REPEATABILITY.rows.push({
            load,
            massReading,
            mpe: mpe ?? null,
            orderNo: tables.REPEATABILITY.rows.length + 1
          });
        }
      } else if (testType === 'SENSITIVITY' && row.length >= 4) {
        const load = numbers[0] ?? numbers[numbers.length - 1];
        const addLoadMass = numbers[1] ?? 0.001;
        const mpe = numbers[numbers.length - 1];
        
        if (load !== undefined) {
          tables.SENSITIVITY.rows.push({
            load,
            addLoadMass,
            readingError: 0,
            mpe: mpe ?? null,
            orderNo: tables.SENSITIVITY.rows.length + 1
          });
        }
      } else if (testType === 'TIME' && row.length >= 5) {
        const timeOfReading = numbers[0] ?? numbers[numbers.length - 1];
        const load = numbers[1] ?? numbers[2];
        const zeroReadingError1 = numbers[2] ?? 0;
        const zeroReadingError2 = numbers[3] ?? 0;
        const mpe = numbers[numbers.length - 1];
        
        if (timeOfReading !== undefined) {
          tables.TIME.rows.push({
            timeOfReading,
            load: load ?? 20,
            zeroReadingError1,
            zeroReadingError2,
            mpe: mpe ?? null,
            orderNo: tables.TIME.rows.length + 1
          });
        }
      } else if (testType === 'TARE' && row.length >= 3) {
        const load = numbers[0] ?? numbers[numbers.length - 1];
        const readingError = numbers[1] ?? 0;
        const mpe = numbers[numbers.length - 1];
        
        if (load !== undefined) {
          tables.TARE.rows.push({
            load,
            readingError,
            mpe: mpe ?? null,
            orderNo: tables.TARE.rows.length + 1
          });
        }
      }
    }
  }
  
  // הסרת טבלאות ריקות
  Object.keys(tables).forEach(key => {
    if (tables[key].rows.length === 0) {
      delete tables[key];
    }
  });
  
  return Object.keys(tables).length > 0 ? { tests: tables } : null;
}

async function main() {
  console.log("מתחיל חילוץ טבלאות מהמסמכים המיובאים...\n");
  
  // מציאת כל הכיולים המיובאים
  const importedCalibrations = await prisma.calibration.findMany({
    where: {
      notes: { contains: "Imported from" }
    },
    include: {
      customer: true,
      scale: {
        include: {
          model: true
        }
      },
      profile: true
    }
  });
  
  console.log(`נמצאו ${importedCalibrations.length} כיולים מיובאים\n`);
  
  let updatedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  for (const cal of importedCalibrations) {
    try {
      const measurementsJson = cal.measurementsJson as any;
      
      // אם כבר יש טבלאות, דלג
      if (measurementsJson?.tests && Object.keys(measurementsJson.tests).length > 0) {
        skippedCount++;
        continue;
      }
      
      // נסה למצוא את קובץ המסמך המקורי
      const sourceFile = measurementsJson?.sourceFile || measurementsJson?.extracted?.sourceFile;
      if (!sourceFile) {
        console.log(`⚠ כיול ${cal.id.slice(0, 8)}: אין שם קובץ מקורי`);
        skippedCount++;
        continue;
      }
      
      // נסה לקרוא את הקובץ מהזיכרון או מהדיסק
      // אם הקובץ לא נמצא, נדלג
      console.log(`  מנסה לחלץ טבלאות מ-${sourceFile}...`);
      
      // הערה: כאן צריך לקרוא את הקובץ המקורי
      // כרגע נדלג על זה כי אין לנו גישה לקבצים המקוריים
      // אבל נוכל להוסיף את זה בהמשך אם הקבצים נשמרים
      
      console.log(`  ⚠ כיול ${cal.id.slice(0, 8)}: לא ניתן לקרוא את הקובץ המקורי (קבצים לא נשמרים)`);
      skippedCount++;
      
    } catch (error: any) {
      console.error(`✗ שגיאה בעיבוד כיול ${cal.id.slice(0, 8)}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`סיכום:`);
  console.log(`  סה"כ כיולים: ${importedCalibrations.length}`);
  console.log(`  עודכנו: ${updatedCount}`);
  console.log(`  דולגו: ${skippedCount}`);
  console.log(`  שגיאות: ${errorCount}`);
  console.log(`${'='.repeat(50)}\n`);
  
  console.log("הערה: כדי לחלץ טבלאות מהמסמכים המקוריים, יש צורך:");
  console.log("1. לשמור את קבצי DOCX המקוריים בשרת");
  console.log("2. או להעלות מחדש את המסמכים עם הפונקציונליות החדשה");
}

main()
  .catch((e) => {
    console.error("שגיאה:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

