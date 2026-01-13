import { prisma } from "../../db/prisma.js";

export type ExtractedCalibrationData = {
  fileName: string;
  reportNo?: string;
  testDate?: Date;
  customerName?: string;
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
};

export type TablesData = {
  tests?: {
    ACCURACY?: { rows: any[] };
    ECCENTRICITY?: { rows: any[] };
    REPEATABILITY?: { rows: any[] };
    SENSITIVITY?: { rows: any[] };
    TIME?: { rows: any[] };
    TARE?: { rows: any[] };
  };
};

/**
 * מנוע שמירת כיולים - יוצר כיול עם מדידות מהטבלאות
 */
export async function createImportedCalibration(params: {
  extracted: ExtractedCalibrationData;
  customerId: string | null;
  scaleId: string | null;
  tablesData?: TablesData;
}) {
  // בדיקה אם כבר קיים כיול - נבדוק לפי מספר אפשרויות:
  // 1. reportNo (אם קיים)
  // 2. שם קובץ (sourceFile)
  // 3. שילוב של לקוח + משקל + תאריך בדיקה
  
  let existingCalibration = null;
  
  // בדיקה 1: לפי reportNo
  if (params.extracted.reportNo) {
    existingCalibration = await prisma.calibration.findFirst({
      where: {
        reportNo: params.extracted.reportNo,
        notes: { contains: "Imported from" }
      }
    });
    
    if (existingCalibration) {
      console.log(`[calibrationImporter] כיול עם reportNo ${params.extracted.reportNo} כבר קיים, מדלג`);
      return { calibration: existingCalibration, created: false };
    }
  }
  
  // בדיקה 2: לפי שם קובץ (sourceFile)
  if (params.extracted.fileName) {
    const calibrationsWithSameFile = await prisma.calibration.findMany({
      where: {
        notes: { contains: `Imported from certificate document: ${params.extracted.fileName}` }
      }
    });
    
    if (calibrationsWithSameFile.length > 0) {
      console.log(`[calibrationImporter] כיול עם קובץ ${params.extracted.fileName} כבר קיים, מדלג`);
      return { calibration: calibrationsWithSameFile[0], created: false };
    }
  }
  
  // בדיקה 3: לפי שילוב של לקוח + משקל + תאריך בדיקה (אם כל הנתונים קיימים)
  if (params.customerId && params.scaleId && params.extracted.testDate) {
    const testDateStart = new Date(params.extracted.testDate);
    testDateStart.setHours(0, 0, 0, 0);
    const testDateEnd = new Date(params.extracted.testDate);
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
      console.log(`[calibrationImporter] כיול עם לקוח ${params.customerId}, משקל ${params.scaleId}, תאריך ${params.extracted.testDate.toISOString()} כבר קיים, מדלג`);
      return { calibration: existingCalibration, created: false };
    }
  }
  
  const testDate = params.extracted.testDate ?? new Date();
  const nextDueDate = new Date(new Date(testDate).setFullYear(new Date(testDate).getFullYear() + 1));

  // בניית measurementsJson עם נתונים מחולצים וטבלאות
  const measurementsJson: any = {
    imported: true,
    sourceFile: params.extracted.fileName,
    extracted: {
      customerName: params.extracted.customerName ?? null,
      serialMfg: params.extracted.serialMfg ?? null,
      serialInternal: params.extracted.serialInternal ?? null,
      manufacturer: params.extracted.manufacturer ?? null,
      deviceType: params.extracted.deviceType ?? null,
      modelName: params.extracted.modelName ?? null,
      capacity: params.extracted.capacity ?? null,
      unit: params.extracted.unit ?? null,
      d: params.extracted.d ?? null,
      e: params.extracted.e ?? null,
      divisionsN: params.extracted.divisionsN ?? null,
      accuracyCls: params.extracted.accuracyCls ?? null,
      minLoad: params.extracted.minLoad ?? null,
      maxLoad: params.extracted.maxLoad ?? null,
      testDate: params.extracted.testDate ? params.extracted.testDate.toISOString() : null,
      reportNo: params.extracted.reportNo ?? null
    }
  };

  // הוספת טבלאות אם קיימות
  if (params.tablesData && params.tablesData.tests) {
    measurementsJson.tests = params.tablesData.tests;
    
    // המרת טבלאות לפורמט measurements
    const measurements: any = {
      accuracy: [],
      eccentricity: [],
      repeatability: [],
      sensitivity: [],
      time: [],
      tare: []
    };
    
    // המרת טבלת ACCURACY
    // MeasurementTable מצפה ל-reading1 (upload) ו-reading3 (download)
    if (params.tablesData.tests.ACCURACY?.rows) {
      measurements.accuracy = params.tablesData.tests.ACCURACY.rows.map((row: any) => ({
        load: row.load,
        reading1: row.uploadReading ?? null,  // קריאה בעליה
        reading3: row.downloadReading ?? null,  // קריאה בירידה
        uploadReading: row.uploadReading ?? null,  // שמירה גם בשם הישן לתאימות
        downloadReading: row.downloadReading ?? null,  // שמירה גם בשם הישן לתאימות
        uploadError: row.uploadReading !== null && row.load !== null ? (row.uploadReading - row.load) : null,
        downloadError: row.downloadReading !== null && row.load !== null ? (row.downloadReading - row.load) : null,
        tolerance: row.mpe ?? null
      }));
    }
    
    // המרת טבלת ECCENTRICITY
    // MeasurementTable מצפה ל-reading1 או reading
    if (params.tablesData.tests.ECCENTRICITY?.rows) {
      measurements.eccentricity = params.tablesData.tests.ECCENTRICITY.rows.map((row: any) => ({
        load: row.load ?? 10,
        loadingPoint: row.loadingPoint ?? null,
        position: row.loadingPoint?.toString() ?? null,  // MeasurementTable מצפה ל-position
        reading1: row.uploadReading ?? null,  // MeasurementTable מצפה ל-reading1
        reading: row.uploadReading ?? null,  // גם reading לתאימות
        uploadReading: row.uploadReading ?? null,  // שמירה גם בשם הישן לתאימות
        uploadError: row.uploadReading !== null && row.load !== null ? (row.uploadReading - row.load) : null,
        tolerance: row.mpe ?? null
      }));
    }
    
    // המרת טבלת REPEATABILITY
    // MeasurementTable מצפה ל-reading עבור massReading
    if (params.tablesData.tests.REPEATABILITY?.rows) {
      measurements.repeatability = params.tablesData.tests.REPEATABILITY.rows.map((row: any) => ({
        load: row.load,
        reading: row.massReading ?? null,  // MeasurementTable מצפה ל-reading
        massReading: row.massReading ?? null,  // שמירה גם בשם הישן לתאימות
        readingError: row.massReading !== null && row.load !== null ? (row.massReading - row.load) : null,
        tolerance: row.mpe ?? null
      }));
    }
    
    // המרת טבלת SENSITIVITY
    if (params.tablesData.tests.SENSITIVITY?.rows) {
      measurements.sensitivity = params.tablesData.tests.SENSITIVITY.rows.map((row: any) => ({
        load: row.load,
        addLoadMass: row.addLoadMass ?? 0.001,
        readingError: row.readingError ?? 0,
        tolerance: row.mpe ?? null
      }));
    }
    
    // המרת טבלת TIME
    if (params.tablesData.tests.TIME?.rows) {
      measurements.time = params.tablesData.tests.TIME.rows.map((row: any) => ({
        timeOfReading: row.timeOfReading ?? null,
        load: row.load ?? 20,
        zeroReadingError1: row.zeroReadingError1 ?? 0,
        zeroReadingError2: row.zeroReadingError2 ?? 0,
        tolerance: row.mpe ?? null
      }));
    }
    
    // המרת טבלת TARE
    if (params.tablesData.tests.TARE?.rows) {
      measurements.tare = params.tablesData.tests.TARE.rows.map((row: any) => ({
        load: row.load,
        readingError: row.readingError ?? 0,
        tolerance: row.mpe ?? null
      }));
    }
    
    measurementsJson.measurements = measurements;
  }

  // יצירת כיול עם סטטוס IMPORTED (אם יש enum) או CERTIFICATE_ISSUED
  const calibration = await prisma.calibration.create({
    data: {
      reportNo: params.extracted.reportNo ?? null,
      status: "CERTIFICATE_ISSUED" as any, // המסמכים הם תעודות שהונפקו
      customerId: params.customerId,
      scaleId: params.scaleId,
      testDate,
      nextDueDate,
      notes: `Imported from certificate document: ${params.extracted.fileName}`,
      measurementsJson: measurementsJson as any
    }
  });

  // יצירת תעודה (Certificate) - המסמכים הם תעודות שהונפקו
  // מספר התעודה הוא מספר הדוח (reportNo) או מספר ייחודי מהקובץ
  const certificateNo = params.extracted.reportNo || `IMPORT-${calibration.id.slice(0, 8)}`;
  
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
        pdfPath: `imported/${params.extracted.fileName}` // נתיב למסמך המקורי
      }
    });
  }
  
  return { calibration, created: true };
}

