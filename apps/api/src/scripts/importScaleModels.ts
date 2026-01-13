import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { prisma } from "../db/prisma.js";

/**
 * Script ליבוא דגמי משקלים מ-CSV
 * 
 * פורמט CSV:
 * manufacturer,modelName,maxCapacity,unit,d,e,accuracyClass,defaultProfileId
 * 
 * דוגמה:
 * Mettler Toledo,PB200,200,kg,0.1,0.1,III,
 * Sartorius,15קג 0.2גרם,15,kg,0.2,0.2,III,
 */

interface ScaleModelRow {
  manufacturer: string;
  modelName: string;
  maxCapacity: string;
  unit: string;
  d: string;
  e: string;
  accuracyClass: string;
  defaultProfileId?: string;
}

async function importScaleModels(filePath: string) {
  console.log(`קורא קובץ CSV: ${filePath}`);

  const fileContent = readFileSync(filePath, "utf-8");
  const records: ScaleModelRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  console.log(`נמצאו ${records.length} שורות לייבוא`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const [index, row] of records.entries()) {
    try {
      const manufacturer = (row.manufacturer || "").trim();
      const modelName = (row.modelName || "").trim();
      const maxCapacity = parseFloat(row.maxCapacity);
      const unit = (row.unit || "kg").trim().toLowerCase();
      const d = parseFloat(row.d);
      const e = parseFloat(row.e);
      const accuracyClass = (row.accuracyClass || "").trim().toUpperCase();
      const defaultProfileId = row.defaultProfileId?.trim() || null;

      // ולידציה
      if (!manufacturer || !modelName) {
        console.error(`שורה ${index + 2}: חסרים שדות חובה (manufacturer, modelName)`);
        errors++;
        continue;
      }

      if (!Number.isFinite(maxCapacity) || !Number.isFinite(d) || !Number.isFinite(e)) {
        console.error(`שורה ${index + 2}: ערכים מספריים לא תקינים`);
        errors++;
        continue;
      }

      if (!["I", "II", "III"].includes(accuracyClass)) {
        console.error(`שורה ${index + 2}: דרגת דיוק לא תקינה (חייב להיות I, II, או III)`);
        errors++;
        continue;
      }

      if (!["g", "kg", "mg"].includes(unit)) {
        console.error(`שורה ${index + 2}: יחידת מידה לא תקינה (חייב להיות g, kg, או mg)`);
        errors++;
        continue;
      }

      // בדיקה אם הפרופיל קיים (אם צוין)
      if (defaultProfileId) {
        const profile = await prisma.metrologicalProfile.findUnique({
          where: { id: defaultProfileId },
        });
        if (!profile) {
          console.warn(`שורה ${index + 2}: פרופיל ${defaultProfileId} לא נמצא, מתעלם`);
        }
      }

      // חיפוש דגם קיים לפי manufacturer + modelName
      const existing = await prisma.scaleModel.findFirst({
        where: {
          manufacturer: { equals: manufacturer, mode: "insensitive" },
          modelName: { equals: modelName, mode: "insensitive" },
        },
      });

      if (existing) {
        // עדכון דגם קיים
        await prisma.scaleModel.update({
          where: { id: existing.id },
          data: {
            maxCapacity: maxCapacity as any,
            unit,
            d: d as any,
            e: e as any,
            accuracyClass,
            defaultProfileId: defaultProfileId || null,
            isActive: true,
          },
        });
        updated++;
        console.log(`עודכן: ${manufacturer} ${modelName}`);
      } else {
        // יצירת דגם חדש
        await prisma.scaleModel.create({
          data: {
            manufacturer,
            modelName,
            maxCapacity: maxCapacity as any,
            unit,
            d: d as any,
            e: e as any,
            accuracyClass,
            defaultProfileId: defaultProfileId || null,
            isActive: true,
          },
        });
        created++;
        console.log(`נוצר: ${manufacturer} ${modelName}`);
      }
    } catch (error: any) {
      console.error(`שורה ${index + 2}: שגיאה - ${error.message}`);
      errors++;
    }
  }

  console.log("\n=== סיכום ===");
  console.log(`נוצרו: ${created}`);
  console.log(`עודכנו: ${updated}`);
  console.log(`שגיאות: ${errors}`);
  console.log(`סה"כ: ${records.length}`);
}

// הרצה
const filePath = process.argv[2];
if (!filePath) {
  console.error("שימוש: node importScaleModels.ts <path-to-csv-file>");
  process.exit(1);
}

importScaleModels(filePath)
  .then(() => {
    console.log("היבוא הושלם");
    process.exit(0);
  })
  .catch((error) => {
    console.error("שגיאה ביבוא:", error);
    process.exit(1);
  });

