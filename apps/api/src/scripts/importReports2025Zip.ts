import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "../db/prisma.js";

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
  testDate?: Date;
  reportNo?: string;
};

function decodeXmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripXmlTags(xml: string) {
  // keep paragraph/line breaks
  const withBreaks = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " ");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(stripped).replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

function cleanSerial(s: string) {
  return s.replace(/[^\w\-\/]/g, "").trim();
}

function pickFirstMatch(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return String(m[1]).trim();
  }
  return undefined;
}

function pickNumber(text: string, patterns: RegExp[]) {
  const s = pickFirstMatch(text, patterns);
  if (!s) return undefined;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function pickUnit(text: string) {
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
  // supports: 12/05/2025 or 12.05.2025
  const m = text.match(/\b(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})\b/);
  if (!m) return undefined;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return undefined;
  const dt = new Date(y, mo - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

function parseDocxTextToExtracted(fileName: string, text: string): Extracted {
  // Heuristic: search near likely labels
  const customerName = pickFirstMatch(text, [
    /שם\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /לקוח\s*[:\-]\s*([^\n]+)\n?/i,
    /Customer\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const customerNo = pickFirstMatch(text, [
    /מס['״]?\s*לקוח\s*[:\-]\s*([^\n]+)\n?/i,
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
      /מס['״]?\s*סידורי\s*[:\-]\s*([^\n]+)\n?/i,
      /Serial\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i,
      /S\/N\s*[:\-]\s*([^\n]+)\n?/i
    ]) || ""
  ) || undefined;

  const serialInternal = cleanSerial(
    pickFirstMatch(text, [
      /מס['״]?\s*פנימי\s*[:\-]\s*([^\n]+)\n?/i,
      /Internal\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
    ]) || ""
  ) || undefined;

  const manufacturer = pickFirstMatch(text, [
    /יצרן\s*[:\-]\s*([^\n]+)\n?/i,
    /Manufacturer\s*[:\-]\s*([^\n]+)\n?/i,
    /Maker\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const deviceType = pickFirstMatch(text, [
    /סוג\s*מכשיר\s*[:\-]\s*([^\n]+)\n?/i,
    /Device\s*Type\s*[:\-]\s*([^\n]+)\n?/i,
    /Type\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  const modelName = pickFirstMatch(text, [
    /דגם\s*[:\-]\s*([^\n]+)\n?/i,
    /Model\s*[:\-]\s*([^\n]+)\n?/i,
    /Model\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
  ]);

  // metrological fields
  const capacity = pickNumber(text, [
    /\bMax(?:imum)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /\bCapacity\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i
  ]);

  const unit = (pickFirstMatch(text, [
    /\bMax(?:imum)?\s*[:\-]?\s*\d+(?:[.,]\d+)?\s*(kg|g|mg)\b/i,
    /כושר(?:\s*שקילה)?\s*[:\-]?\s*\d+(?:[.,]\d+)?\s*(kg|g|mg)\b/i,
    /\bCapacity\s*[:\-]?\s*\d+(?:[.,]\d+)?\s*(kg|g|mg)\b/i
  ]) as any) || pickUnit(text);

  const d = pickNumber(text, [
    /\bd\s*[:=]\s*(\d+(?:[.,]\d+)?)/i,
    /חלוקה(?:\s*d)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i
  ]);

  const e = pickNumber(text, [
    /\be\s*[:=]\s*(\d+(?:[.,]\d+)?)/i,
    /כיול(?:\s*e)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i
  ]);

  const accuracyCls = pickClass(text);

  const divisionsN = pickNumber(text, [
    /מספר\s*חלוקות\s*[:\-]\s*(\d+)/i,
    /Divisions\s*[:\-]\s*(\d+)/i,
    /N\s*[:\-]\s*(\d+)/i,
    /divisionsN\s*[:\-]\s*(\d+)/i
  ]);

  const testDate = pickDate(text);

  const reportNo = pickFirstMatch(text, [
    /מס['״]?\s*דוח\s*[:\-]\s*([^\n]+)\n?/i,
    /Report\s*No\.?\s*[:\-]\s*([^\n]+)\n?/i
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
    testDate,
    reportNo
  };
}

async function upsertCustomer(ex: Extracted) {
  if (!ex.customerName) return null;

  const name = ex.customerName.trim();
  const customerNo = ex.customerNo ? ex.customerNo.trim() : null;

  // prefer match by customerNo if available else by name
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

async function upsertScale(ex: Extracted, customerId: string | null) {
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
        serialMfg: sMfg ?? existing.serialMfg,
        serialInternal: sInt ?? existing.serialInternal,
        manufacturer: ex.manufacturer?.trim() ?? existing.manufacturer,
        deviceType: ex.deviceType?.trim() ?? existing.deviceType,
        modelName: ex.modelName?.trim() ?? existing.modelName
      }
    });
  }

  return prisma.scale.create({
    data: {
      customerId,
      serialMfg: sMfg,
      serialInternal: sInt,
      manufacturer: ex.manufacturer?.trim() || null,
      deviceType: ex.deviceType?.trim() || null,
      modelName: ex.modelName?.trim() || null
    }
  });
}

async function matchProfile(ex: Extracted) {
  if (
    ex.capacity == null ||
    ex.d == null ||
    ex.e == null ||
    !ex.unit ||
    !ex.accuracyCls
  ) {
    return null;
  }

  const profile = await prisma.metrologicalProfile.findFirst({
    where: {
      toleranceMode: "HUB_REFERENCE" as any,
      capacity: ex.capacity as any,
      unit: ex.unit,
      d: ex.d as any,
      e: ex.e as any,
      accuracyCls: ex.accuracyCls
    }
  });

  return profile;
}

async function createHistoricalCalibration(params: {
  ex: Extracted;
  customerId: string | null;
  scaleId: string | null;
  profileId: string | null;
}) {
  // create minimal calibration record for lookup "last profile"
  const testDate = params.ex.testDate ?? new Date();
  const nextDueDate = new Date(new Date(testDate).setFullYear(new Date(testDate).getFullYear() + 1));

  await prisma.calibration.create({
    data: {
      reportNo: params.ex.reportNo ?? null,
      status: "CERTIFICATE_ISSUED" as any,
      customerId: params.customerId,
      scaleId: params.scaleId,
      profileId: params.profileId,
      testDate,
      nextDueDate,
      notes: `Imported from 2025.zip report: ${params.ex.fileName}`,
      measurementsJson: {
        imported: true,
        sourceFile: params.ex.fileName,
        extracted: {
          customerName: params.ex.customerName ?? null,
          serialMfg: params.ex.serialMfg ?? null,
          serialInternal: params.ex.serialInternal ?? null,
          capacity: params.ex.capacity ?? null,
          unit: params.ex.unit ?? null,
          d: params.ex.d ?? null,
          e: params.ex.e ?? null,
          accuracyCls: params.ex.accuracyCls ?? null,
          testDate: params.ex.testDate ? params.ex.testDate.toISOString() : null,
          reportNo: params.ex.reportNo ?? null
        }
      } as any
    }
  });
}

async function main() {
  const zipArg = process.argv.find(a => a.startsWith("--zip="));
  const createHistory = !process.argv.includes("--no-history");

  if (!zipArg) {
    throw new Error("Usage: npm --prefix apps/api run import:reports2025 -- --zip=/path/to/2025.zip [--no-history]");
  }

  const zipPath = path.resolve(zipArg.split("=", 2)[1]);
  if (!fs.existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith(".docx"));

  let total = 0;
  let customersUpserted = 0;
  let scalesUpserted = 0;
  let profilesMatched = 0;
  let historyCreated = 0;
  const unresolved: Extracted[] = [];

  for (const e of entries) {
    total++;
    const fileName = path.basename(e.entryName);

    try {
      const inner = new AdmZip(e.getData());
      const docXml = inner.getEntry("word/document.xml")?.getData().toString("utf-8");
      if (!docXml) throw new Error("Missing word/document.xml");

      const text = stripXmlTags(docXml);
      const ex = parseDocxTextToExtracted(fileName, text);

      const customer = await upsertCustomer(ex);
      if (customer) customersUpserted++;

      const scale = await upsertScale(ex, customer?.id ?? null);
      if (scale) scalesUpserted++;

      // Try to match or create profile
      let profile = await matchProfile(ex);
      if (!profile && ex.capacity != null && ex.d != null && ex.e != null && ex.unit && ex.accuracyCls) {
        // Create profile if doesn't exist
        profile = await prisma.metrologicalProfile.create({
          data: {
            capacity: ex.capacity as any,
            unit: ex.unit,
            d: ex.d as any,
            e: ex.e as any,
            divisionsN: ex.divisionsN ?? null,
            accuracyCls: ex.accuracyCls,
            toleranceMode: "HUB_REFERENCE" as any
          }
        });
      }
      if (profile) profilesMatched++;

      if (createHistory && (customer || scale)) {
        await createHistoricalCalibration({
          ex,
          customerId: customer?.id ?? null,
          scaleId: scale?.id ?? null,
          profileId: profile?.id ?? null
        });
        historyCreated++;
      }

      // unresolved if missing key fields
      if (!ex.customerName || (!ex.serialMfg && !ex.serialInternal) || !profile?.id) {
        unresolved.push(ex);
      }
    } catch (err) {
      unresolved.push({ fileName } as Extracted);
    }
  }

  // write unresolved report to storage for manual review
  const outDir = path.resolve("storage/imports");
  fs.mkdirSync(outDir, { recursive: true });

  const unresolvedPath = path.join(outDir, `unresolved_2025_${Date.now()}.json`);
  fs.writeFileSync(unresolvedPath, JSON.stringify(unresolved, null, 2), "utf-8");

  console.log("IMPORT DONE");
  console.log({
    totalDocx: total,
    customersUpserted,
    scalesUpserted,
    profilesMatched,
    historyCreated,
    unresolvedCount: unresolved.length,
    unresolvedPath
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

