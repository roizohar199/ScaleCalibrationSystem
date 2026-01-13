import { prisma } from "../../db/prisma.js";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";

// העתקת הפונקציות הנדרשות
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

// חילוץ טבלאות מהמסמך DOCX - גרסה משופרת עם mammoth
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
    
    console.log(`[extractTablesFromDocx] HTML length: ${html.length}`);
    
    // חילוץ טבלאות מה-HTML
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const tableRows: string[][] = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const rowCells: string[] = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          const cellText = cellMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
          rowCells.push(cellText);
        }
        
        if (rowCells.length > 0) {
          tableRows.push(rowCells);
        }
      }
      
      if (tableRows.length < 2) continue;
      
      const headerRow = tableRows[0].join(' ').toLowerCase();
      let testType: string | null = null;
      
      if (headerRow.includes('סטיית דיוק') || headerRow.includes('accuracy of reading') || 
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
      } else if (headerRow.includes('זמן') || headerRow.includes('time test') || 
                 headerRow.includes('מאיפוס')) {
        testType = 'TIME';
      } else if (headerRow.includes('טרה') || headerRow.includes('tare test')) {
        testType = 'TARE';
      }
      
      if (!testType) continue;
      
      console.log(`[extractTablesFromDocx] נמצאה טבלה מסוג: ${testType}, ${tableRows.length} שורות`);
      
      for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        if (row.length === 0) continue;
        
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
              if (!isNaN(num)) numbers.push(num);
            }
          }
        }
        
        if (numbers.length === 0) continue;
        
        if (testType === 'ACCURACY' && numbers.length >= 2) {
          const load = numbers[numbers.length - 1] || numbers[0];
          const uploadReading = numbers.length >= 2 ? numbers[1] : null;
          const downloadReading = numbers.length >= 4 ? numbers[3] : null;
          const mpe = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
          
          tables.ACCURACY.rows.push({
            load,
            uploadReading: uploadReading || null,
            downloadReading: downloadReading || null,
            mpe: mpe || null,
            orderNo: tables.ACCURACY.rows.length + 1
          });
        } else if (testType === 'ECCENTRICITY' && numbers.length >= 2) {
          const loadingPoint = numbers[0] || tables.ECCENTRICITY.rows.length + 1;
          const uploadReading = numbers[1];
          const mpe = numbers[numbers.length - 1];
          const load = 10;
          
          tables.ECCENTRICITY.rows.push({
            load,
            loadingPoint,
            uploadReading,
            mpe: mpe || null,
            orderNo: tables.ECCENTRICITY.rows.length + 1
          });
        } else if (testType === 'REPEATABILITY' && numbers.length >= 2) {
          const load = numbers[0] || numbers[numbers.length - 1];
          const massReading = numbers[1];
          const mpe = numbers[numbers.length - 1];
          
          tables.REPEATABILITY.rows.push({
            load,
            massReading,
            mpe: mpe || null,
            orderNo: tables.REPEATABILITY.rows.length + 1
          });
        } else if (testType === 'SENSITIVITY' && numbers.length >= 1) {
          const load = numbers[0] || numbers[numbers.length - 1];
          const addLoadMass = numbers.length >= 2 ? numbers[1] : 0.001;
          const mpe = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
          
          tables.SENSITIVITY.rows.push({
            load,
            addLoadMass,
            readingError: 0,
            mpe: mpe || null,
            orderNo: tables.SENSITIVITY.rows.length + 1
          });
        } else if (testType === 'TIME' && numbers.length >= 2) {
          const timeOfReading = numbers[0];
          const load = numbers.length >= 2 ? numbers[1] : 20;
          const zeroReadingError1 = numbers.length >= 3 ? numbers[2] : 0;
          const zeroReadingError2 = numbers.length >= 4 ? numbers[3] : 0;
          const mpe = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
          
          tables.TIME.rows.push({
            timeOfReading,
            load: load || 20,
            zeroReadingError1,
            zeroReadingError2,
            mpe: mpe || null,
            orderNo: tables.TIME.rows.length + 1
          });
        } else if (testType === 'TARE' && numbers.length >= 1) {
          const load = numbers[0] || numbers[numbers.length - 1];
          const readingError = numbers.length >= 2 ? numbers[1] : 0;
          const mpe = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
          
          tables.TARE.rows.push({
            load,
            readingError,
            mpe: mpe || null,
            orderNo: tables.TARE.rows.length + 1
          });
        }
      }
    }
  } catch (error) {
    console.error("[extractTablesFromDocx] שגיאה:", error);
    return null;
  }
  
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

// חילוץ טבלאות ישירות מה-XML (גיבוי)
function extractTablesFromDocxXml(docXml: string): any {
  // ... (קוד זהה ל-extractTablesFromDocxXml מ-documents.ts)
  return null; // נשתמש רק ב-mammoth
}

export async function reprocessCalibrationWithFile(calibrationId: string, fileBuffer: Buffer): Promise<boolean> {
  try {
    const calibration = await prisma.calibration.findUnique({
      where: { id: calibrationId }
    });
    
    if (!calibration) {
      console.error(`[reprocessCalibration] כיול לא נמצא: ${calibrationId}`);
      return false;
    }
    
    const measurementsJson = calibration.measurementsJson as any;
    if (!measurementsJson?.imported) {
      console.log(`[reprocessCalibration] כיול ${calibrationId} לא מיובא, מדלג`);
      return false;
    }
    
    // חילוץ טבלאות מהקובץ
    const tablesData = await extractTablesFromDocx(fileBuffer);
    
    if (!tablesData || !tablesData.tests || Object.keys(tablesData.tests).length === 0) {
      console.log(`[reprocessCalibration] לא נמצאו טבלאות בקובץ עבור כיול ${calibrationId}`);
      return false;
    }
    
    // עדכון measurementsJson עם הטבלאות
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
    
    console.log(`[reprocessCalibration] עודכן כיול ${calibrationId} עם ${Object.keys(tablesData.tests).length} טבלאות`);
    return true;
  } catch (error: any) {
    console.error(`[reprocessCalibration] שגיאה בעיבוד כיול ${calibrationId}:`, error);
    return false;
  }
}











