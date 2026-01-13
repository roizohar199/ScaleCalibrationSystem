import { prisma } from "../db/prisma.js";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";
import type { TestType } from "@prisma/client";

/**
 * סקריפט ללמידה ויצירת פרופילים מטרולוגיים וטבלאות סובלנות
 * בהתבסס על מסמך דוגמה (3טון 500גרם.docx)
 * 
 * המסמך מכיל:
 * - פרטי לקוח
 * - פרטי מאזניים (יצרן, דגם, מס' סידורי, כושר העמסה, חלוקות, d, e, רמת דיוק, גבולות)
 * - תאריכי בדיקה
 * - דוח מספר
 * - טבלאות בדיקות: ACCURACY, ECCENTRICITY, REPEATABILITY, SENSITIVITY, TIME, TARE
 */

interface DocumentProfile {
  capacity: number;
  unit: string;
  d: number;
  e: number;
  accuracyCls: string;
  minLoad?: number;
  maxLoad?: number;
  divisionsN?: number;
}

interface ToleranceRowData {
  load: number;
  mpe: number;
  orderNo: number;
}

interface TestTableData {
  [testType: string]: ToleranceRowData[];
}

// Interface לנתונים מחולצים מהמסמך (כמו ב-documents.ts)
interface Extracted {
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
  accuracyCls?: "I" | "II" | "III" | "IIII";
  minLoad?: number;
  maxLoad?: number;
  testDate?: Date;
  reportNo?: string;
}

function cleanSerial(s: string) {
  if (!s) return "";
  return s.replace(/[^\w\-\/]/g, "").trim();
}

function pickDate(text: string): Date | undefined {
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
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
          const dt = new Date(y, mo - 1, d);
          if (!isNaN(dt.getTime())) return dt;
        }
      }
    }
  }
  return undefined;
}

// פונקציות עזר לחילוץ נתונים מהמסמך
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

function pickNumber(text: string, patterns: RegExp[]): number | undefined {
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

function pickFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const result = String(m[1]).trim();
      return result.replace(/\s+/g, " ").replace(/^[\s\-:]+|[\s\-:]+$/g, "");
    }
  }
  return undefined;
}

function pickUnit(text: string): string | undefined {
  if (text.match(/ק"ג/i)) return "kg";
  const m = text.match(/\b(kg|g|mg)\b/i);
  if (!m) return undefined;
  const u = m[1].toLowerCase();
  if (u === "kg" || u === "g" || u === "mg") return u;
  return undefined;
}

function pickClass(text: string): string | undefined {
  const cls = pickFirstMatch(text, [
    /\bClass\s*(I{1,4})\b/i,
    /דיוק\s*[:\-]?\s*(I{1,4})/i,
    /\bAccuracy\s*Class\s*[:\-]?\s*(I{1,4})\b/i,
    /רמת\s*דיוק\s*[:\-]?\s*(I{1,4})/i
  ]);
  if (!cls) return undefined;
  const c = cls.toUpperCase();
  if (c === "I" || c === "II" || c === "III" || c === "IIII") return c;
  return undefined;
}

/**
 * חילוץ כל המידע מהמסמך (כמו parseDocxTextToExtracted ב-documents.ts)
 */
function parseDocxTextToExtracted(fileName: string, text: string): Extracted {
  const customerName = pickFirstMatch(text, [
    /שם\s*הלקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /שם\s*לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Customer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
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
      /Serial\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
    ]) || ""
  ) || undefined;

  const serialInternal = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /מספר\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /Internal\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
    ]) || ""
  ) || undefined;

  const manufacturer = pickFirstMatch(text, [
    /שם\s*יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Manufacturer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
  ]);

  const deviceType = pickFirstMatch(text, [
    /סוג\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Device\s*Type\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
  ]);

  const modelName = pickFirstMatch(text, [
    /דגם\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Model\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
  ]) || (deviceType ? `${manufacturer || ''} ${deviceType}`.trim() : undefined);

  const capacity = pickNumber(text, [
    /כושר\s*העמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*שקילה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bMax(?:imum)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bCapacity\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  let unit = pickFirstMatch(text, [
    /כושר\s*העמסה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר\s*שקילה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i
  ]);
  if (unit && unit.includes("ק")) unit = "kg";
  if (!unit) {
    if (text.match(/ק"ג/i)) unit = "kg";
    else unit = pickUnit(text);
  }

  const d = pickNumber(text, [
    /ערך\s*חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const e = pickNumber(text, [
    /ערך\s*חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const divisionsN = pickNumber(text, [
    /מספר\s*חלוקות\s*[:\-]\s*(\d+)/i,
    /Divisions\s*[:\-]\s*(\d+)/i
  ]);

  const accuracyCls = pickClass(text) || pickFirstMatch(text, [
    /רמת\s*דיוק\s*[:\-]\s*(I{1,4})/i,
    /דרגת\s*דיוק\s*[:\-]\s*(I{1,4})/i,
    /\bClass\s*(I{1,4})\b/i
  ])?.toUpperCase() as any;

  const minLoad = pickNumber(text, [
    /גבול\s*תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*תחתון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Min(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const maxLoad = pickNumber(text, [
    /גבול\s*עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*עליון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Max(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const testDate = pickDate(text);

  const reportNo = pickFirstMatch(text, [
    /דו"ח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /דוח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /Report\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i
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

/**
 * חילוץ פרופיל מטרולוגי מהטקסט
 */
function extractProfileFromText(text: string): DocumentProfile | null {
  // כושר העמסה
  const capacity = pickNumber(text, [
    /כושר\s*העמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*שקילה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bMax(?:imum)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bCapacity\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // יחידה
  let unit = pickFirstMatch(text, [
    /כושר\s*העמסה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר\s*שקילה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i
  ]);
  if (unit && unit.includes("ק")) unit = "kg";
  if (!unit) {
    if (text.match(/ק"ג/i)) unit = "kg";
    else unit = pickUnit(text);
  }

  // d - ערך חלוקה ממשית
  const d = pickNumber(text, [
    /ערך\s*חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // e - ערך חלוקה לכיול
  const e = pickNumber(text, [
    /ערך\s*חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // רמת דיוק
  const accuracyCls = pickClass(text);

  // גבולות העמסה
  const minLoad = pickNumber(text, [
    /גבול\s*תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*תחתון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Min(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  const maxLoad = pickNumber(text, [
    /גבול\s*עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*עליון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Max(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i
  ]);

  // מספר חלוקות
  const divisionsN = pickNumber(text, [
    /מספר\s*חלוקות\s*[:\-]\s*(\d+)/i,
    /Divisions\s*[:\-]\s*(\d+)/i
  ]);

  if (!capacity || !unit || !d || !e || !accuracyCls) {
    return null;
  }

  return {
    capacity,
    unit,
    d,
    e,
    accuracyCls,
    minLoad,
    maxLoad,
    divisionsN
  };
}

/**
 * חילוץ טבלאות סובלנות מהמסמך
 */
async function extractToleranceTables(buffer: Buffer): Promise<TestTableData> {
  const tables: TestTableData = {};

  try {
    // שימוש ב-mammoth לחילוץ טבלאות
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;

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

      // זיהוי סוג הטבלה לפי הכותרת
      const headerRow = tableRows[0].join(' ').toLowerCase();
      let testType: string | null = null;

      if (headerRow.includes('סטיית דיוק') || headerRow.includes('accuracy of reading') ||
          (headerRow.includes('upload') && headerRow.includes('download')) ||
          (headerRow.includes('permissible error') && headerRow.includes('load mass'))) {
        testType = 'ACCURACY';
      } else if (headerRow.includes('אי מרכזיות') || headerRow.includes('eccentricity') ||
                 headerRow.includes('נקודת העמסה') || headerRow.includes('loading point') ||
                 headerRow.includes('פינות')) {
        testType = 'ECCENTRICITY';
      } else if (headerRow.includes('הדירות') || headerRow.includes('repeatability') ||
                 headerRow.includes('קריאת המסה') || headerRow.includes('mass reading')) {
        testType = 'REPEATABILITY';
      } else if (headerRow.includes('רגישות') || headerRow.includes('sensitivity') ||
                 headerRow.includes('discrimination') || headerRow.includes('מסה נוספת') ||
                 headerRow.includes('add load mass')) {
        testType = 'SENSITIVITY';
      } else if (headerRow.includes('זמן') || headerRow.includes('time test') ||
                 headerRow.includes('מאיפוס') || headerRow.includes('zero reading')) {
        testType = 'TIME';
      } else if (headerRow.includes('טרה') || headerRow.includes('tare test')) {
        testType = 'TARE';
      }

      if (!testType) continue;

      // חילוץ נתונים מהשורות
      const rows: ToleranceRowData[] = [];
      for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        if (row.length === 0) continue;

        // חילוץ מספרים מהתאים
        const numbers: number[] = [];
        for (const cell of row) {
          let cleaned = cell.replace(/[^\d.,\-\s]/g, ' ').trim();
          cleaned = cleaned.replace(/(\d)\s+\./g, '$1.').replace(/\.\s+(\d)/g, '.$1');
          cleaned = cleaned.replace(/,/g, '.');
          cleaned = cleaned.replace(/\s+/g, '');

          const numMatches = cleaned.match(/-?\d+\.?\d*/g);
          if (numMatches && numMatches.length > 0) {
            for (const numStr of numMatches) {
              const num = parseFloat(numStr);
              if (!isNaN(num)) {
                numbers.push(num);
              }
            }
          }
        }

        if (numbers.length === 0) continue;

        // יצירת שורה לפי סוג הטבלה
        if (testType === 'ACCURACY') {
          // טבלת דיוק: LOAD MASS | UPLOAD READING | UPLOAD ERROR | DOWNLOAD READING | DOWNLOAD ERROR | PERMISSIBLE ERROR
          // המסה היא בדרך כלל העמודה הראשונה או האחרונה
          const load = numbers[0] || numbers[numbers.length - 1];
          // MPE הוא בדרך כלל העמודה האחרונה
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (load !== undefined && load !== null && mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        } else if (testType === 'ECCENTRICITY') {
          // טבלת אי מרכזיות: נקודת העמסה, קריאה, סטיה מותרת
          const load = numbers[0] || 10; // בדרך כלל 10 ק"ג או העומס הראשון
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        } else if (testType === 'REPEATABILITY') {
          // טבלת הדירות: מסה מועמסת, קריאת המסה, סטיה מותרת
          const load = numbers[0] || numbers[numbers.length - 1];
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (load !== undefined && load !== null && mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        } else if (testType === 'SENSITIVITY') {
          // טבלת רגישות: מסה מועמסת, מסה נוספת, סטיה מותרת
          const load = numbers[0] || numbers[numbers.length - 1];
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (load !== undefined && load !== null && mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        } else if (testType === 'TIME') {
          // טבלת זמן: זמן הקריאה, מסה מועמסת, סטיה מאיפוס, סטיה מותרת
          const load = numbers[1] || numbers[0] || 20;
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        } else if (testType === 'TARE') {
          // טבלת טרה: מסה מועמסת, סטיה מקריאה, סטיה מותרת
          const load = numbers[0] || numbers[numbers.length - 1];
          const mpe = numbers[numbers.length - 1] || numbers[numbers.length - 2];

          if (load !== undefined && load !== null && mpe !== undefined && mpe !== null) {
            rows.push({
              load,
              mpe,
              orderNo: rows.length + 1
            });
          }
        }
      }

      if (rows.length > 0) {
        tables[testType] = rows;
      }
    }
  } catch (error) {
    console.error("[extractToleranceTables] שגיאה:", error);
  }

  return tables;
}

/**
 * יצירת פרופיל מטרולוגי וטבלאות סובלנות
 */
async function createProfileFromDocument(profile: DocumentProfile, tables: TestTableData) {
  console.log(`\n📋 יוצר פרופיל מטרולוגי:`);
  console.log(`   קיבולת: ${profile.capacity} ${profile.unit}`);
  console.log(`   d=${profile.d}, e=${profile.e}`);
  console.log(`   דרגת דיוק: ${profile.accuracyCls}`);
  if (profile.minLoad) console.log(`   גבול תחתון: ${profile.minLoad}`);
  if (profile.maxLoad) console.log(`   גבול עליון: ${profile.maxLoad}`);

  // בדיקה אם הפרופיל כבר קיים
  const existing = await prisma.metrologicalProfile.findFirst({
    where: {
      capacity: profile.capacity as any,
      unit: profile.unit,
      d: profile.d as any,
      e: profile.e as any,
      accuracyCls: profile.accuracyCls
    }
  });

  let profileId: string;

  if (existing) {
    console.log(`   ✅ פרופיל קיים נמצא, מעדכן...`);
    profileId = existing.id;
    await prisma.metrologicalProfile.update({
      where: { id: profileId },
      data: {
        minLoad: profile.minLoad != null ? profile.minLoad as any : existing.minLoad,
        maxLoad: profile.maxLoad != null ? profile.maxLoad as any : existing.maxLoad,
        divisionsN: profile.divisionsN ?? existing.divisionsN ?? null,
        toleranceMode: "HUB_REFERENCE" as any,
        hubKey: `DOC_${profile.capacity}_${profile.unit}_${profile.d}_${profile.e}_${profile.accuracyCls}`
      }
    });
  } else {
    console.log(`   ✨ יוצר פרופיל חדש...`);
    const newProfile = await prisma.metrologicalProfile.create({
      data: {
        capacity: profile.capacity as any,
        unit: profile.unit,
        d: profile.d as any,
        e: profile.e as any,
        divisionsN: profile.divisionsN ?? null,
        accuracyCls: profile.accuracyCls,
        minLoad: profile.minLoad != null ? profile.minLoad as any : null,
        maxLoad: profile.maxLoad != null ? profile.maxLoad as any : null,
        toleranceMode: "HUB_REFERENCE" as any,
        hubKey: `DOC_${profile.capacity}_${profile.unit}_${profile.d}_${profile.e}_${profile.accuracyCls}`
      }
    });
    profileId = newProfile.id;
  }

  // מחיקת טבלאות קיימות
  await prisma.toleranceRow.deleteMany({ where: { profileId } });
  await prisma.testPoint.deleteMany({ where: { profileId } });

  // יצירת טבלאות סובלנות ונקודות בדיקה
  let totalRows = 0;
  let totalPoints = 0;

  for (const [testType, rows] of Object.entries(tables)) {
    if (rows.length === 0) continue;

    console.log(`\n   📊 יוצר טבלת ${testType} עם ${rows.length} שורות...`);

    // יצירת שורות סובלנות
    await prisma.toleranceRow.createMany({
      data: rows.map(row => ({
        profileId,
        testType: testType as TestType,
        load: row.load as any,
        mpe: row.mpe as any,
        unit: profile.unit,
        orderNo: row.orderNo
      }))
    });
    totalRows += rows.length;

    // יצירת נקודות בדיקה
    await prisma.testPoint.createMany({
      data: rows.map(row => ({
        profileId,
        testType: testType as TestType,
        load: row.load as any,
        orderNo: row.orderNo
      }))
    });
    totalPoints += rows.length;
  }

  console.log(`\n✅ הושלם! נוצרו ${totalRows} שורות סובלנות ו-${totalPoints} נקודות בדיקה`);

  return profileId;
}

// פונקציות ליצירת/עדכון לקוחות, משקלות, וכו' (מ-documents.ts)
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

async function upsertScale(ex: Extracted, customerId: string | null, modelId: string | null) {
  const sMfg = ex.serialMfg?.trim() || null;
  const sInt = ex.serialInternal?.trim() || null;
  
  if (!sMfg && !sInt) return null;

  const existing = await prisma.scale.findFirst({
    where: {
      OR: [
        ...(sMfg ? [{ serialMfg: { equals: sMfg, mode: "insensitive" } as any }] : []),
        ...(sInt ? [{ serialInternal: { equals: sInt, mode: "insensitive" } as any }] : [])
      ]
    }
  });

  if (existing) {
    return prisma.scale.update({
      where: { id: existing.id },
      data: {
        customerId: customerId ?? existing.customerId,
        modelId: modelId ?? existing.modelId,
        serialMfg: sMfg ?? existing.serialMfg,
        serialInternal: sInt ?? existing.serialInternal,
        manufacturer: ex.manufacturer?.trim() || existing.manufacturer,
        deviceType: ex.deviceType?.trim() || existing.deviceType,
        modelName: ex.modelName?.trim() || existing.modelName
      }
    });
  }

  return prisma.scale.create({
    data: {
      customerId,
      modelId,
      serialMfg: sMfg,
      serialInternal: sInt,
      manufacturer: ex.manufacturer?.trim() || null,
      deviceType: ex.deviceType?.trim() || null,
      modelName: ex.modelName?.trim() || null
    }
  });
}

async function upsertScaleModel(ex: Extracted, profileId: string | null) {
  const manufacturer = ex.manufacturer?.trim();
  const modelName = ex.modelName?.trim() || ex.deviceType?.trim();
  
  if (!manufacturer || !modelName) {
    return null;
  }

  if (ex.capacity == null || ex.d == null || ex.e == null || !ex.unit || !ex.accuracyCls) {
    const existing = await prisma.scaleModel.findFirst({
      where: {
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        modelName: { equals: modelName, mode: "insensitive" }
      }
    });
    return existing || null;
  }

  const existing = await prisma.scaleModel.findFirst({
    where: {
      manufacturer: { equals: manufacturer, mode: "insensitive" },
      modelName: { equals: modelName, mode: "insensitive" }
    }
  });

  if (existing) {
    return prisma.scaleModel.update({
      where: { id: existing.id },
      data: {
        maxCapacity: ex.capacity as any,
        unit: ex.unit,
        d: ex.d as any,
        e: ex.e as any,
        accuracyClass: ex.accuracyCls,
        defaultProfileId: profileId ?? existing.defaultProfileId,
        isActive: true
      }
    });
  }

  return prisma.scaleModel.create({
    data: {
      manufacturer,
      modelName,
      maxCapacity: ex.capacity as any,
      unit: ex.unit,
      d: ex.d as any,
      e: ex.e as any,
      accuracyClass: ex.accuracyCls,
      defaultProfileId: profileId ?? null,
      isActive: true
    }
  });
}

async function createHistoricalCalibration(params: {
  ex: Extracted;
  customerId: string | null;
  scaleId: string | null;
  profileId: string | null;
  tablesData?: any;
}) {
  if (params.ex.reportNo) {
    const existing = await prisma.calibration.findFirst({
      where: {
        reportNo: params.ex.reportNo,
        notes: { contains: "Imported from" }
      }
    });
    
    if (existing) {
      return null;
    }
  }
  
  if (params.ex.fileName) {
    const calibrationsWithSameFile = await prisma.calibration.findMany({
      where: {
        notes: { contains: `Imported from certificate document: ${params.ex.fileName}` }
      }
    });
    
    if (calibrationsWithSameFile.length > 0) {
      return null;
    }
  }
  
  const testDate = params.ex.testDate ?? new Date();
  const nextDueDate = new Date(new Date(testDate).setFullYear(new Date(testDate).getFullYear() + 1));

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

  if (params.tablesData && params.tablesData.tests) {
    measurementsJson.tests = params.tablesData.tests;
  }

  const calibration = await prisma.calibration.create({
    data: {
      reportNo: params.ex.reportNo ?? null,
      status: "CERTIFICATE_ISSUED" as any,
      customerId: params.customerId,
      scaleId: params.scaleId,
      profileId: params.profileId,
      testDate,
      nextDueDate,
      notes: `Imported from certificate document: ${params.ex.fileName}`,
      measurementsJson: measurementsJson as any
    }
  });

  const certificateNo = params.ex.reportNo || `IMPORT-${calibration.id.slice(0, 8)}`;
  
  const existingCert = await prisma.certificate.findUnique({
    where: { certificateNo }
  });

  if (!existingCert) {
    await prisma.certificate.create({
      data: {
        calibrationId: calibration.id,
        certificateNo: certificateNo,
        issuedAt: testDate,
        pdfPath: `imported/${params.ex.fileName}`
      }
    });
  }
  
  return calibration;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--file="));
  let filePath = arg ? arg.split("=", 2)[1] : "";
  
  // אם לא צוין קובץ, ננסה למצוא את הקובץ הדוגמה
  if (!filePath) {
    // נסה למצוא את הקובץ בתיקיית השורש
    const possiblePaths = [
      path.resolve("../../3טון 500גרם.docx"),
      path.resolve("../../../3טון 500גרם.docx"),
      path.resolve("C:/Scaling Calibration HUB/3טון 500גרם.docx")
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        console.log(`📁 נמצא קובץ: ${filePath}`);
        break;
      }
    }
  }
  
  if (!filePath) {
    console.error('Usage: npm run learn:document -- --file=path/to/document.docx');
    console.error('Example: npm run learn:document -- --file=../../3טון 500גרם.docx');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  
  if (!fs.existsSync(absPath)) {
    console.error(`❌ הקובץ לא נמצא: ${absPath}`);
    process.exit(1);
  }

  console.log(`📖 קורא מסמך: ${absPath}\n`);

  try {
    const buffer = fs.readFileSync(absPath);
    const zip = new AdmZip(buffer);
    const docXml = zip.getEntry("word/document.xml")?.getData().toString("utf-8");
    
    if (!docXml) {
      throw new Error("Missing word/document.xml");
    }

    const text = stripXmlTags(docXml);
    
    // חילוץ פרופיל מטרולוגי
    const profile = extractProfileFromText(text);
    
    if (!profile) {
      console.error("❌ לא ניתן לחלץ פרופיל מטרולוגי מהמסמך");
      console.error("   נדרשים: capacity, unit, d, e, accuracyCls");
      process.exit(1);
    }

    // חילוץ טבלאות סובלנות
    console.log("📊 מחלץ טבלאות סובלנות מהמסמך...");
    const tables = await extractToleranceTables(buffer);

    console.log(`\n📋 נמצאו ${Object.keys(tables).length} טבלאות:`);
    for (const [testType, rows] of Object.entries(tables)) {
      console.log(`   - ${testType}: ${rows.length} שורות`);
    }

    // חילוץ כל המידע מהמסמך (לקוחות, משקלות, וכו')
    const extracted = parseDocxTextToExtracted(path.basename(absPath), text);
    
    console.log("\n📋 מידע מחולץ מהמסמך:");
    if (extracted.customerName) console.log(`   לקוח: ${extracted.customerName}`);
    if (extracted.manufacturer) console.log(`   יצרן: ${extracted.manufacturer}`);
    if (extracted.modelName) console.log(`   דגם: ${extracted.modelName}`);
    if (extracted.serialMfg) console.log(`   מס' סידורי: ${extracted.serialMfg}`);
    if (extracted.reportNo) console.log(`   דוח מספר: ${extracted.reportNo}`);
    if (extracted.testDate) console.log(`   תאריך בדיקה: ${extracted.testDate.toLocaleDateString('he-IL')}`);

    // יצירת פרופיל וטבלאות במסד הנתונים
    const profileId = await createProfileFromDocument(profile, tables);

    // יצירת/עדכון לקוח
    let customer = null;
    if (extracted.customerName) {
      console.log("\n👤 יוצר/מעדכן לקוח...");
      customer = await upsertCustomer(extracted);
      if (customer) {
        console.log(`   ✅ לקוח: ${customer.name} (${customer.id.slice(0, 8)})`);
      }
    }

    // יצירת/עדכון מודל משקלת
    let scaleModel = null;
    if (extracted.manufacturer && extracted.modelName && profile) {
      console.log("\n⚖️  יוצר/מעדכן מודל משקלת...");
      scaleModel = await upsertScaleModel(extracted, profileId);
      if (scaleModel) {
        console.log(`   ✅ מודל: ${scaleModel.manufacturer} ${scaleModel.modelName} (${scaleModel.id.slice(0, 8)})`);
      }
    }

    // יצירת/עדכון משקלת
    let scale = null;
    if ((extracted.serialMfg || extracted.serialInternal) && customer) {
      console.log("\n📏 יוצר/מעדכן משקלת...");
      scale = await upsertScale(extracted, customer.id, scaleModel?.id ?? null);
      if (scale) {
        console.log(`   ✅ משקלת: ${scale.serialMfg || scale.serialInternal} (${scale.id.slice(0, 8)})`);
      }
    }

    // יצירת כיול היסטורי (אם יש תאריך בדיקה)
    if (extracted.testDate && scale) {
      console.log("\n📝 יוצר כיול היסטורי...");
      const calibration = await createHistoricalCalibration({
        ex: extracted,
        customerId: customer?.id ?? null,
        scaleId: scale?.id ?? null,
        profileId: profileId,
        tablesData: Object.keys(tables).length > 0 ? { tests: tables } : undefined
      });
      if (calibration) {
        console.log(`   ✅ כיול: ${calibration.reportNo || calibration.id.slice(0, 8)}`);
      } else {
        console.log(`   ⚠️  כיול כבר קיים, מדלג`);
      }
    }

    console.log("\n✅ הושלם בהצלחה! כל המידע מהמסמך הוכנס למערכת.");
    
  } catch (error: any) {
    console.error("❌ שגיאה:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

