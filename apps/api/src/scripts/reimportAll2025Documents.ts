import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { prisma } from "../db/prisma.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// שימוש בפונקציות משופרות מ-documents.ts
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
  minLoad?: number;
  maxLoad?: number;
  testDate?: Date;
  reportNo?: string;
};

function cleanText(s: string | undefined | null): string {
  if (!s) return "";
  // ניקוי מדויק - הסרת רווחים מיותרים, תווים מיוחדים, שמירה על עברית
  return s
    .trim()
    .replace(/\s+/g, " ") // רווחים מרובים לרווח אחד
    .replace(/^[\s\-:]+|[\s\-:]+$/g, "") // הסרת מקפים וקולונים בקצוות
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // הסרת zero-width characters
    .trim();
}

function cleanSerial(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[^\w\-\/]/g, "").trim();
}

function pickFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const result = cleanText(m[1]);
      if (result) return result;
    }
  }
  return undefined;
}

function pickNumber(text: string, patterns: RegExp[]): number | undefined {
  const s = pickFirstMatch(text, patterns);
  if (!s) return undefined;
  let cleaned = String(s).trim();
  cleaned = cleaned.replace(/,/g, ".");
  cleaned = cleaned.replace(/(\d)\s+\./g, "$1.").replace(/\.\s+(\d)/g, ".$1");
  cleaned = cleaned.replace(/\s+/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && !isNaN(n) ? n : undefined;
}

function pickUnit(text: string): "kg" | "g" | "mg" | undefined {
  if (text.match(/ק"ג/i)) return "kg";
  const m = text.match(/\b(kg|g|mg)\b/i);
  if (!m) return undefined;
  const u = m[1].toLowerCase();
  if (u === "kg" || u === "g" || u === "mg") return u;
  return undefined;
}

function pickClass(text: string): "I" | "II" | "III" | undefined {
  const cls = pickFirstMatch(text, [
    /\bClass\s*(I{1,3})\b/i,
    /דיוק\s*[:\-]?\s*(I{1,3})/i,
    /\bAccuracy\s*Class\s*[:\-]?\s*(I{1,3})\b/i,
    /רמת\s*דיוק\s*[:\-]?\s*(I{1,3})/i,
    /דרגת\s*דיוק\s*[:\-]?\s*(I{1,3})/i,
  ]);
  if (!cls) return undefined;
  const c = cls.toUpperCase();
  if (c === "I" || c === "II" || c === "III") return c as any;
  return undefined;
}

function pickDate(text: string): Date | undefined {
  const patterns = [
    /\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})\b/,
    /תאריך\s*בדיקה\s*[:\-]\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-]?(\d{2,4})?/i,
    /תאריך\s*[:\-]\s*(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-]?(\d{2,4})?/i,
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

function parseDocxTextToExtracted(fileName: string, text: string): Extracted {
  // שם לקוח - חיפוש משופר
  const customerName = pickFirstMatch(text, [
    /שם\s*הלקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /שם\s*לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /לקוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Customer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /שם\s*הלקוח\s*[:\-]\s*([^\n\r]+)/i,
    /שם\s*לקוח\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  const customerNo = pickFirstMatch(text, [
    /מס['״]?\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /מספר\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /Customer\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i,
  ]);

  const address = pickFirstMatch(text, [
    /כתובת\s*[:\-]\s*([^\n]+)\n?/i,
    /Address\s*[:\-]\s*([^\n]+)\n?/i,
  ]);

  const phone = pickFirstMatch(text, [
    /טלפון\s*[:\-]\s*([^\n]+)\n?/i,
    /Phone\s*[:\-]\s*([^\n]+)\n?/i,
  ]);

  const serialMfg = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*סידורי\s*(?:יצרן)?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מספר\s*סידורי\s*(?:יצרן)?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מס['״]?\s*סידורי\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /מספר\s*סידורי\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /Serial\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /S\/N\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
      /Serial\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    ]) || ""
  ) || undefined;

  const serialInternal = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /מספר\s*סידורי\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /מס['״]?\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /Internal\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i,
    ]) || ""
  ) || undefined;

  const manufacturer = pickFirstMatch(text, [
    /שם\s*יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /יצרן\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Manufacturer\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Maker\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /יצרן\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  const deviceType = pickFirstMatch(text, [
    /סוג\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Device\s*Type\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Type\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /סוג\s*מכשיר\s*[:\-]\s*([^\n\r]+)/i,
  ]);

  const modelName = pickFirstMatch(text, [
    /דגם\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*מכשיר\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Model\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Model\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דגם\s*[:\-]\s*([^\n\r]+)/i,
  ]) || (deviceType ? `${manufacturer || ""} ${deviceType}`.trim() : undefined);

  const capacity = pickNumber(text, [
    /כושר\s*העמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*שקילה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /כושר\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bMax(?:imum)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bCapacity\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מקסימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
  ]);

  let unit = pickFirstMatch(text, [
    /כושר\s*העמסה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר\s*שקילה\s*[:\-]\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(ק"ג|kg|g|mg)\b/i,
    /\bMax(?:imum)?\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(kg|g|mg)\b/i,
    /\bCapacity\s*[:\-]?\s*\d+(?:[.,\s]\d+)?\s*(kg|g|mg)\b/i,
  ]);

  if (unit && unit.includes("ק")) unit = "kg";

  if (!unit) {
    if (text.match(/ק"ג/i)) unit = "kg";
    else unit = pickUnit(text);
  }

  const d = pickNumber(text, [
    /ערך\s*חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*ממשית\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /ערך\s*חלוקה\s*\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\(?\s*d\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה(?:\s*d)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\bd\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
  ]);

  const e = pickNumber(text, [
    /ערך\s*חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /חלוקה\s*לכיול\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /ערך\s*חלוקה\s*\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\(?\s*e\s*\)?\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:=]\s*(\d+(?:[.,\s]\d+)?)/i,
    /כיול(?:\s*e)?\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /\be\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
  ]);

  const divisionsN = pickNumber(text, [
    /מספר\s*חלוקות\s*[:\-]\s*(\d+)/i,
    /Divisions\s*[:\-]\s*(\d+)/i,
    /N\s*[:\-]\s*(\d+)/i,
    /divisionsN\s*[:\-]\s*(\d+)/i,
  ]);

  const accuracyCls = pickClass(text) || (pickFirstMatch(text, [
    /רמת\s*דיוק\s*[:\-]\s*(I{1,3})/i,
    /דרגת\s*דיוק\s*[:\-]\s*(I{1,3})/i,
    /דיוק\s*[:\-]\s*(I{1,3})/i,
    /רמת\s*דיוק\s*(I{1,3})/i,
    /דרגת\s*דיוק\s*(I{1,3})/i,
    /\bClass\s*(I{1,3})\b/i,
  ])?.toUpperCase() as any);

  const minLoad = pickNumber(text, [
    /גבול\s*תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*תחתון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /תחתון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Min(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /Lower\s*Limit\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מינימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
  ]);

  const maxLoad = pickNumber(text, [
    /גבול\s*עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /גבול\s*עליון\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /עליון\s*להעמסה\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
    /Max(?:imum)?\s*Load\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /Upper\s*Limit\s*[:\-]?\s*(\d+(?:[.,\s]\d+)?)/i,
    /מקסימום\s*[:\-]\s*(\d+(?:[.,\s]\d+)?)/i,
  ]);

  const testDate = pickDate(text);

  const reportNo = pickFirstMatch(text, [
    /דו"ח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /דוח\s*מספר\s*[:\-]\s*([^\s\n\r]+)/i,
    /מס['״]?\s*דוח\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /Report\s*No\.?\s*[:\-]\s*([^\n\r]+?)(?:\n|$)/i,
    /דו"ח\s*מס['״]?\s*[:\-]\s*([^\s\n\r]+)/i,
    /דוח\s*מס['״]?\s*[:\-]\s*([^\s\n\r]+)/i,
  ]);

  return {
    fileName,
    customerName: customerName ? cleanText(customerName) : undefined,
    customerNo: customerNo ? cleanText(customerNo) : undefined,
    address: address ? cleanText(address) : undefined,
    phone: phone ? cleanText(phone) : undefined,
    serialMfg,
    serialInternal,
    manufacturer: manufacturer ? cleanText(manufacturer) : undefined,
    deviceType: deviceType ? cleanText(deviceType) : undefined,
    modelName: modelName ? cleanText(modelName) : undefined,
    capacity,
    unit: unit as any,
    d,
    e,
    divisionsN: divisionsN ? Math.round(divisionsN) : undefined,
    accuracyCls,
    minLoad,
    maxLoad,
    testDate,
    reportNo: reportNo ? cleanText(reportNo) : undefined,
  };
}

async function upsertCustomer(ex: Extracted) {
  if (!ex.customerName) return null;

  const name = cleanText(ex.customerName);
  const customerNo = ex.customerNo ? cleanText(ex.customerNo) : null;

  const existing = customerNo
    ? await prisma.customer.findFirst({
        where: {
          OR: [
            { customerNo, name: { equals: name, mode: "insensitive" } },
            { name: { equals: name, mode: "insensitive" } },
          ],
        },
      })
    : await prisma.customer.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name,
        customerNo: customerNo ?? existing.customerNo,
        address: ex.address ? cleanText(ex.address) : existing.address,
        phone: ex.phone ? cleanText(ex.phone) : existing.phone,
      },
    });
  }

  return prisma.customer.create({
    data: {
      name,
      customerNo,
      address: ex.address ? cleanText(ex.address) : null,
      phone: ex.phone ? cleanText(ex.phone) : null,
    },
  });
}

async function matchOrCreateProfile(ex: Extracted) {
  if (ex.capacity == null || ex.d == null || ex.e == null || !ex.unit || !ex.accuracyCls) {
    return null;
  }

  const profile = await prisma.metrologicalProfile.findFirst({
    where: {
      toleranceMode: "HUB_REFERENCE" as any,
      capacity: ex.capacity as any,
      unit: ex.unit,
      d: ex.d as any,
      e: ex.e as any,
      accuracyCls: ex.accuracyCls,
    },
  });

  if (profile) {
    const updateData: any = {};
    if (ex.minLoad != null) updateData.minLoad = ex.minLoad as any;
    if (ex.maxLoad != null) updateData.maxLoad = ex.maxLoad as any;

    if (Object.keys(updateData).length > 0) {
      return prisma.metrologicalProfile.update({
        where: { id: profile.id },
        data: updateData,
      });
    }
    return profile;
  }

  return prisma.metrologicalProfile.create({
    data: {
      capacity: ex.capacity as any,
      unit: ex.unit,
      d: ex.d as any,
      e: ex.e as any,
      divisionsN: ex.divisionsN ?? null,
      accuracyCls: ex.accuracyCls,
      minLoad: ex.minLoad != null ? ex.minLoad as any : null,
      maxLoad: ex.maxLoad != null ? ex.maxLoad as any : null,
      toleranceMode: "HUB_REFERENCE" as any,
    },
  });
}

async function upsertScaleModel(ex: Extracted, profileId: string | null) {
  const manufacturer = ex.manufacturer ? cleanText(ex.manufacturer) : null;
  const modelName = ex.modelName ? cleanText(ex.modelName) : (ex.deviceType ? cleanText(ex.deviceType) : null);

  if (!manufacturer || !modelName) {
    return null;
  }

  if (ex.capacity == null || ex.d == null || ex.e == null || !ex.unit || !ex.accuracyCls) {
    const existing = await prisma.scaleModel.findFirst({
      where: {
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        modelName: { equals: modelName, mode: "insensitive" },
      },
    });
    return existing || null;
  }

  const existing = await prisma.scaleModel.findFirst({
    where: {
      manufacturer: { equals: manufacturer, mode: "insensitive" },
      modelName: { equals: modelName, mode: "insensitive" },
    },
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
        isActive: true,
      },
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
      isActive: true,
    },
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
        ...(sInt ? [{ serialInternal: { equals: sInt, mode: "insensitive" } as any }] : []),
      ],
    },
  });

  if (existing) {
    return prisma.scale.update({
      where: { id: existing.id },
      data: {
        customerId: customerId ?? existing.customerId,
        modelId: modelId ?? existing.modelId,
        serialMfg: sMfg ?? existing.serialMfg,
        serialInternal: sInt ?? existing.serialInternal,
        manufacturer: ex.manufacturer ? cleanText(ex.manufacturer) : existing.manufacturer,
        deviceType: ex.deviceType ? cleanText(ex.deviceType) : existing.deviceType,
        modelName: ex.modelName ? cleanText(ex.modelName) : existing.modelName,
      },
    });
  }

  return prisma.scale.create({
    data: {
      customerId,
      modelId,
      serialMfg: sMfg,
      serialInternal: sInt,
      manufacturer: ex.manufacturer ? cleanText(ex.manufacturer) : null,
      deviceType: ex.deviceType ? cleanText(ex.deviceType) : null,
      modelName: ex.modelName ? cleanText(ex.modelName) : null,
    },
  });
}

async function processDocxFile(filePath: string): Promise<{ success: boolean; error?: string; calibration?: any }> {
  try {
    const buffer = fs.readFileSync(filePath);
    const inner = new AdmZip(buffer);
    const docXml = inner.getEntry("word/document.xml")?.getData().toString("utf-8");
    if (!docXml) {
      return { success: false, error: "Missing word/document.xml" };
    }

    const text = docXml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\s*\/>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();

    const fileName = path.basename(filePath);
    const ex = parseDocxTextToExtracted(fileName, text);

    // בדיקה אם כבר קיים כיול עם אותו reportNo
    let existingCalibration = null;
    if (ex.reportNo) {
      existingCalibration = await prisma.calibration.findFirst({
        where: {
          reportNo: ex.reportNo,
          notes: { contains: "Imported from" },
        },
      });
    }

    if (existingCalibration) {
      // עדכון כיול קיים
      const customer = await upsertCustomer(ex);
      const profile = await matchOrCreateProfile(ex);
      const scaleModel = await upsertScaleModel(ex, profile?.id ?? null);
      const scale = await upsertScale(ex, customer?.id ?? null, scaleModel?.id ?? null);

      await prisma.calibration.update({
        where: { id: existingCalibration.id },
        data: {
          customerId: customer?.id ?? existingCalibration.customerId,
          scaleId: scale?.id ?? existingCalibration.scaleId,
          profileId: profile?.id ?? existingCalibration.profileId,
          testDate: ex.testDate ?? existingCalibration.testDate,
        },
      });

      return { success: true, calibration: existingCalibration };
    }

    // יצירת כיול חדש
    const customer = await upsertCustomer(ex);
    const profile = await matchOrCreateProfile(ex);
    const scaleModel = await upsertScaleModel(ex, profile?.id ?? null);
    const scale = await upsertScale(ex, customer?.id ?? null, scaleModel?.id ?? null);

    const testDate = ex.testDate ?? new Date();
    const nextDueDate = new Date(new Date(testDate).setFullYear(new Date(testDate).getFullYear() + 1));

    const measurementsJson: any = {
      imported: true,
      sourceFile: fileName,
      extracted: {
        customerName: ex.customerName ?? null,
        serialMfg: ex.serialMfg ?? null,
        serialInternal: ex.serialInternal ?? null,
        manufacturer: ex.manufacturer ?? null,
        deviceType: ex.deviceType ?? null,
        modelName: ex.modelName ?? null,
        capacity: ex.capacity ?? null,
        unit: ex.unit ?? null,
        d: ex.d ?? null,
        e: ex.e ?? null,
        divisionsN: ex.divisionsN ?? null,
        accuracyCls: ex.accuracyCls ?? null,
        minLoad: ex.minLoad ?? null,
        maxLoad: ex.maxLoad ?? null,
        testDate: ex.testDate ? ex.testDate.toISOString() : null,
        reportNo: ex.reportNo ?? null,
      },
    };

    const calibration = await prisma.calibration.create({
      data: {
        reportNo: ex.reportNo ?? null,
        status: "CERTIFICATE_ISSUED" as any,
        customerId: customer?.id ?? null,
        scaleId: scale?.id ?? null,
        profileId: profile?.id ?? null,
        testDate,
        nextDueDate,
        notes: `Imported from certificate document: ${fileName}`,
        measurementsJson: measurementsJson as any,
      },
    });

    // יצירת תעודה
    const certificateNo = ex.reportNo || `IMPORT-${calibration.id.slice(0, 8)}`;
    const existingCert = await prisma.certificate.findUnique({
      where: { certificateNo },
    });

    if (!existingCert) {
      await prisma.certificate.create({
        data: {
          calibrationId: calibration.id,
          certificateNo: certificateNo,
          issuedAt: testDate,
          pdfPath: `imported/${fileName}`,
        },
      });
    }

    return { success: true, calibration };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function main() {
  // התיקייה 2025 נמצאת ברמה העליונה של הפרויקט
  const docsDir = path.resolve(__dirname, "../../../../../2025");
  
  if (!fs.existsSync(docsDir)) {
    console.error(`❌ התיקייה ${docsDir} לא נמצאה`);
    process.exit(1);
  }

  console.log(`📁 סריקת תיקיית: ${docsDir}\n`);

  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith(".docx") && !f.startsWith("~$") && !f.startsWith(".~"))
    .map((f) => path.join(docsDir, f));

  console.log(`📄 נמצאו ${files.length} מסמכים לעיבוד\n`);

  let processed = 0;
  let updated = 0;
  let created = 0;
  let errors: Array<{ file: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = path.basename(file);
    const progress = `[${i + 1}/${files.length}]`;

    try {
      const result = await processDocxFile(file);
      if (result.success) {
        processed++;
        if (result.calibration) {
          // בדיקה אם זה כיול חדש או עדכון לפי reportNo
          if (result.calibration.reportNo) {
            const existingBefore = await prisma.calibration.findFirst({
              where: { reportNo: result.calibration.reportNo },
            });
            if (existingBefore && existingBefore.id !== result.calibration.id) {
              updated++;
              console.log(`🔄 ${progress} ${fileName} - עודכן כיול קיים`);
            } else {
              created++;
              console.log(`✅ ${progress} ${fileName} - נוצר כיול חדש`);
            }
          } else {
            created++;
            console.log(`✅ ${progress} ${fileName} - נוצר כיול חדש`);
          }
        }
      } else {
        errors.push({ file: fileName, error: result.error || "Unknown error" });
        console.log(`❌ ${progress} ${fileName} - ${result.error}`);
      }
    } catch (error: any) {
      errors.push({ file: fileName, error: error.message });
      console.log(`❌ ${progress} ${fileName} - ${error.message}`);
    }

    // הצגת התקדמות כל 10 קבצים
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 התקדמות: ${i + 1}/${files.length} (${Math.round(((i + 1) / files.length) * 100)}%)\n`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 סיכום:`);
  console.log(`  ✅ סה"כ מעובדים: ${processed}`);
  console.log(`  🆕 כיולים חדשים: ${created}`);
  console.log(`  🔄 כיולים מעודכנים: ${updated}`);
  console.log(`  ❌ שגיאות: ${errors.length}`);
  console.log(`${"=".repeat(60)}\n`);

  if (errors.length > 0) {
    console.log(`\n❌ שגיאות:`);
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.file}: ${e.error}`);
    });
  }
}

main()
  .catch((e) => {
    console.error("❌ שגיאה:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

