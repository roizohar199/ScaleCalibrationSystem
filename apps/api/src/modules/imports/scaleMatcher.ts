import { prisma } from "../../db/prisma.js";

export type ExtractedScaleData = {
  serialMfg?: string;
  serialInternal?: string;
  manufacturer?: string;
  modelName?: string;
  deviceType?: string;
};

/**
 * מנוע התאמת משקלות - מחפש משקל קיים או יוצר חדש
 */
export async function findOrCreateScale(
  extracted: ExtractedScaleData,
  customerId: string | null,
  modelId: string | null
) {
  const sMfg = extracted.serialMfg?.trim() || null;
  const sInt = extracted.serialInternal?.trim() || null;
  
  // אם אין מספר סידורי כלל, לא נוכל ליצור משקל
  if (!sMfg && !sInt) {
    console.warn("[scaleMatcher] אין מספר סידורי, לא ניתן ליצור משקל");
    return null;
  }

  // חיפוש משקל קיים לפי מספר סידורי
  const existing = await prisma.scale.findFirst({
    where: {
      OR: [
        ...(sMfg ? [{ serialMfg: { equals: sMfg, mode: "insensitive" } as any }] : []),
        ...(sInt ? [{ serialInternal: { equals: sInt, mode: "insensitive" } as any }] : [])
      ]
    }
  });

  if (existing) {
    // עדכון משקל קיים - עדכן נתונים אם יש חדשים
    console.log(`[scaleMatcher] נמצא משקל קיים: ${existing.id}, מעדכן פרטים`);
    return prisma.scale.update({
      where: { id: existing.id },
      data: {
        customerId: customerId ?? existing.customerId,
        modelId: modelId ?? existing.modelId,
        serialMfg: sMfg ?? existing.serialMfg,
        serialInternal: sInt ?? existing.serialInternal,
        manufacturer: extracted.manufacturer?.trim() || existing.manufacturer,
        deviceType: extracted.deviceType?.trim() || existing.deviceType,
        modelName: extracted.modelName?.trim() || existing.modelName
      }
    });
  }

  // אם לא נמצא לפי מספר סידורי, ננסה לחפש לפי יצרן + דגם
  if (extracted.manufacturer && extracted.modelName) {
    const manufacturer = extracted.manufacturer.trim();
    const modelName = extracted.modelName.trim();
    
    const existingByModel = await prisma.scale.findFirst({
      where: {
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        modelName: { equals: modelName, mode: "insensitive" },
        // רק אם אין מספר סידורי אחר
        serialMfg: null,
        serialInternal: null
      }
    });
    
    if (existingByModel) {
      console.log(`[scaleMatcher] נמצא משקל לפי יצרן+דגם: ${existingByModel.id}, מעדכן מספר סידורי`);
      return prisma.scale.update({
        where: { id: existingByModel.id },
        data: {
          customerId: customerId ?? existingByModel.customerId,
          modelId: modelId ?? existingByModel.modelId,
          serialMfg: sMfg ?? existingByModel.serialMfg,
          serialInternal: sInt ?? existingByModel.serialInternal,
          manufacturer: manufacturer,
          deviceType: extracted.deviceType?.trim() || existingByModel.deviceType,
          modelName: modelName
        }
      });
    }
  }

  // יצירת משקל חדש
  console.log(`[scaleMatcher] יוצר משקל חדש: serialMfg=${sMfg}, serialInternal=${sInt}`);
  return prisma.scale.create({
    data: {
      customerId,
      modelId,
      serialMfg: sMfg,
      serialInternal: sInt,
      manufacturer: extracted.manufacturer?.trim() || null,
      deviceType: extracted.deviceType?.trim() || null,
      modelName: extracted.modelName?.trim() || null
    }
  });
}

