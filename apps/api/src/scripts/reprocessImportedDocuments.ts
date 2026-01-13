import { prisma } from "../db/prisma.js";

/**
 * סקריפט לעיבוד מחדש של כל המסמכים המיובאים
 * קורא את הנתונים מה-measurementsJson.extracted ומעדכן את כל הנתונים החסרים
 */

async function upsertCustomerFromExtracted(extracted: any) {
  if (!extracted.customerName) return null;
  
  const name = extracted.customerName.trim();
  const customerNo = extracted.customerNo ? extracted.customerNo.trim() : null;
  
  const existing = customerNo
    ? await prisma.customer.findFirst({ where: { customerNo } })
    : await prisma.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name,
        customerNo: customerNo ?? existing.customerNo,
        address: extracted.address?.trim() ?? existing.address,
        phone: extracted.phone?.trim() ?? existing.phone
      }
    });
  }
  
  return prisma.customer.create({
    data: {
      name,
      customerNo,
      address: extracted.address?.trim() || null,
      phone: extracted.phone?.trim() || null
    }
  });
}

async function matchOrCreateProfile(extracted: any) {
  if (extracted.capacity == null || extracted.d == null || extracted.e == null || !extracted.unit || !extracted.accuracyCls) {
    return null;
  }
  
  const profile = await prisma.metrologicalProfile.findFirst({
    where: {
      capacity: extracted.capacity as any,
      unit: extracted.unit,
      d: extracted.d as any,
      e: extracted.e as any,
      accuracyCls: extracted.accuracyCls
    }
  });
  
  if (profile) {
    // עדכון פרופיל קיים עם minLoad ו-maxLoad אם קיימים
    if (extracted.minLoad != null || extracted.maxLoad != null) {
      const updateData: any = {};
      if (extracted.minLoad != null) updateData.minLoad = extracted.minLoad as any;
      if (extracted.maxLoad != null) updateData.maxLoad = extracted.maxLoad as any;
      
      return prisma.metrologicalProfile.update({
        where: { id: profile.id },
        data: updateData
      });
    }
    return profile;
  }
  
  return prisma.metrologicalProfile.create({
    data: {
      capacity: extracted.capacity as any,
      unit: extracted.unit,
      d: extracted.d as any,
      e: extracted.e as any,
      divisionsN: extracted.divisionsN ?? null,
      accuracyCls: extracted.accuracyCls,
      minLoad: extracted.minLoad != null ? extracted.minLoad as any : null,
      maxLoad: extracted.maxLoad != null ? extracted.maxLoad as any : null,
      toleranceMode: "HUB_REFERENCE" as any
    }
  });
}

async function upsertScaleModel(extracted: any, profileId: string | null) {
  const manufacturer = extracted.manufacturer?.trim();
  const modelName = extracted.modelName?.trim() || extracted.deviceType?.trim();
  
  if (!manufacturer || !modelName) return null;
  
  if (extracted.capacity == null || extracted.d == null || extracted.e == null || !extracted.unit || !extracted.accuracyCls) {
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
        maxCapacity: extracted.capacity as any,
        unit: extracted.unit,
        d: extracted.d as any,
        e: extracted.e as any,
        accuracyClass: extracted.accuracyCls,
        defaultProfileId: profileId ?? existing.defaultProfileId,
        isActive: true
      }
    });
  }
  
  return prisma.scaleModel.create({
    data: {
      manufacturer,
      modelName,
      maxCapacity: extracted.capacity as any,
      unit: extracted.unit,
      d: extracted.d as any,
      e: extracted.e as any,
      accuracyClass: extracted.accuracyCls,
      defaultProfileId: profileId ?? null,
      isActive: true
    }
  });
}

async function upsertScale(extracted: any, customerId: string | null, modelId: string | null) {
  const sMfg = extracted.serialMfg?.trim() || null;
  const sInt = extracted.serialInternal?.trim() || null;
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
    const updates: any = {};
    
    // עדכון רק אם הנתון החדש קיים והקיים חסר או שונה
    if (customerId && existing.customerId !== customerId) updates.customerId = customerId;
    if (modelId && existing.modelId !== modelId) updates.modelId = modelId;
    if (sMfg && existing.serialMfg !== sMfg) updates.serialMfg = sMfg;
    if (sInt && existing.serialInternal !== sInt) updates.serialInternal = sInt;
    if (extracted.manufacturer?.trim() && !existing.manufacturer) updates.manufacturer = extracted.manufacturer.trim();
    if (extracted.deviceType?.trim() && !existing.deviceType) updates.deviceType = extracted.deviceType.trim();
    if (extracted.modelName?.trim() && !existing.modelName) updates.modelName = extracted.modelName.trim();
    
    if (Object.keys(updates).length > 0) {
      return prisma.scale.update({
        where: { id: existing.id },
        data: updates
      });
    }
    return existing;
  }
  
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

async function updateCalibrationFromExtracted(calibration: any, extracted: any) {
  const updates: string[] = [];
  const calUpdates: any = {};
  
  // עדכון/יצירת לקוח
  const customer = await upsertCustomerFromExtracted(extracted);
  if (customer && (!calibration.customerId || calibration.customerId !== customer.id)) {
    calUpdates.customerId = customer.id;
    updates.push(`לקוח: ${extracted.customerName}`);
  }
  
  // יצירת/עדכון פרופיל מטרולוגי
  const profile = await matchOrCreateProfile(extracted);
  if (profile) {
    if (!calibration.profileId || calibration.profileId !== profile.id) {
      calUpdates.profileId = profile.id;
      updates.push(`פרופיל מטרולוגי`);
    }
    
    // עדכון minLoad ו-maxLoad בפרופיל אם קיימים
    if (extracted.minLoad != null || extracted.maxLoad != null) {
      const profileUpdates: any = {};
      if (extracted.minLoad != null) profileUpdates.minLoad = extracted.minLoad as any;
      if (extracted.maxLoad != null) profileUpdates.maxLoad = extracted.maxLoad as any;
      
      if (Object.keys(profileUpdates).length > 0) {
        await prisma.metrologicalProfile.update({
          where: { id: profile.id },
          data: profileUpdates
        });
        updates.push(`גבולות העמסה`);
      }
    }
  }
  
  // יצירת/עדכון ScaleModel
  const scaleModel = await upsertScaleModel(extracted, profile?.id ?? null);
  
  // יצירת/עדכון משקל
  const scale = await upsertScale(extracted, customer?.id ?? null, scaleModel?.id ?? null);
  if (scale && (!calibration.scaleId || calibration.scaleId !== scale.id)) {
    calUpdates.scaleId = scale.id;
    updates.push(`משקל`);
  }
  
  // עדכון reportNo אם חסר או שונה
  if (extracted.reportNo && (!calibration.reportNo || extracted.reportNo !== calibration.reportNo)) {
    calUpdates.reportNo = extracted.reportNo;
    updates.push(`מספר דוח: ${extracted.reportNo}`);
  }
  
  // עדכון testDate אם חסר
  if (extracted.testDate && !calibration.testDate) {
    const testDate = new Date(extracted.testDate);
    if (!isNaN(testDate.getTime())) {
      calUpdates.testDate = testDate;
      updates.push(`תאריך בדיקה`);
    }
  }
  
  // עדכון כל השינויים בבת אחת
  let wasUpdated = false;
  if (Object.keys(calUpdates).length > 0) {
    await prisma.calibration.update({
      where: { id: calibration.id },
      data: calUpdates
    });
    
    if (updates.length > 0) {
      console.log(`  ✓ עודכן: ${updates.join(', ')}`);
    }
    wasUpdated = true;
  }
  
  // יצירת תעודה אם חסרה - המסמכים הם תעודות שהונפקו
  if (calibration.status === "CERTIFICATE_ISSUED" && !calibration.certificate) {
    const certificateNo = extracted.reportNo || `IMPORT-${calibration.id.slice(0, 8)}`;
    
    // בדיקה אם כבר קיימת תעודה עם אותו מספר
    const existingCert = await prisma.certificate.findUnique({
      where: { certificateNo }
    });
    
    if (!existingCert) {
      // בדיקה אם יש תעודה קשורה לכיול הזה
      const existingCalCert = await prisma.certificate.findUnique({
        where: { calibrationId: calibration.id }
      });
      
      if (!existingCalCert) {
        await prisma.certificate.create({
          data: {
            calibrationId: calibration.id,
            certificateNo: certificateNo,
            issuedAt: calibration.testDate || new Date(),
            pdfPath: `imported/${extracted.reportNo || calibration.id}.pdf`
          }
        });
        console.log(`  ✓ נוצרה תעודה: ${certificateNo}`);
        wasUpdated = true;
      }
    }
  }
  
  return wasUpdated;
}

async function main() {
  console.log("מתחיל עיבוד מחדש של מסמכים מיובאים...\n");
  
  // מציאת כל הכיולים המיובאים
  const importedCalibrations = await prisma.calibration.findMany({
    where: {
      notes: { contains: "Imported from document" }
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
  
  for (const cal of importedCalibrations) {
    try {
      const measurementsJson = cal.measurementsJson as any;
      const extracted = measurementsJson?.extracted;
      
      if (!extracted) {
        console.log(`⚠ כיול ${cal.id.slice(0, 8)}...: אין נתונים מחולצים`);
        continue;
      }
      
      console.log(`עיבוד כיול ${cal.id.slice(0, 8)}... (דוח: ${extracted.reportNo || 'ללא'}, לקוח: ${extracted.customerName || 'ללא'})`);
      
      const wasUpdated = await updateCalibrationFromExtracted(cal, extracted);
      if (wasUpdated) {
        updatedCount++;
      }
    } catch (error: any) {
      console.error(`✗ שגיאה בעיבוד כיול ${cal.id.slice(0, 8)}...: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`סיכום:`);
  console.log(`  סה"כ כיולים: ${importedCalibrations.length}`);
  console.log(`  עודכנו: ${updatedCount}`);
  console.log(`  שגיאות: ${errorCount}`);
  console.log(`${'='.repeat(50)}\n`);
}

main()
  .catch((e) => {
    console.error("שגיאה:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

