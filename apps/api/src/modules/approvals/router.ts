import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth/middleware.js";
import { auditLog } from "../audit/log.js";
import { hashCalibrationSnapshot } from "../calibrations/router.js";
import { getIo } from "../../socket.js";

export const approvalsRouter = Router();

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function nextCertificateNo() {
  // MVP: timestamp-based; בהמשך: רץ לפי רצף שנתי
  const now = new Date();
  const y = now.getFullYear();
  const stamp = String(now.getTime()).slice(-6);
  return `${y}-${stamp}`;
}

async function issueCertificate(calibrationId: string) {
  console.log(`[issueCertificate] Starting certificate issuance for calibration ${calibrationId}`);
  
  try {
    const cal = await prisma.calibration.findUnique({
      where: { id: calibrationId },
      include: { 
        customer: true, 
        site: true, 
        scale: {
          include: {
            model: true
          }
        }, 
        approvals: true 
      }
    });

    if (!cal) {
      const error = "Calibration not found";
      console.error(`[issueCertificate] ${error}: ${calibrationId}`);
      throw new Error(error);
    }
    
    if (cal.status !== "APPROVED") {
      const error = `Must be APPROVED, current status: ${cal.status}`;
      console.error(`[issueCertificate] ${error} for calibration ${calibrationId}`);
      throw new Error(error);
    }

    console.log(`[issueCertificate] Calibration ${calibrationId} found with status ${cal.status}`);

    // בדיקה אם תעודה כבר קיימת
    const existing = await prisma.certificate.findUnique({ where: { calibrationId } });
    if (existing) {
      console.log(`[issueCertificate] Certificate already exists for calibration ${calibrationId}: ${existing.certificateNo}`);
      return existing;
    }

    const certificateNo = nextCertificateNo();
    console.log(`[issueCertificate] Generated certificate number: ${certificateNo}`);
    
    const outDir = path.resolve("storage/certificates");
    ensureDir(outDir);
    const pdfPath = path.join(outDir, `${certificateNo}.pdf`);
    console.log(`[issueCertificate] PDF will be saved to: ${pdfPath}`);

    // שימוש ב-generateCertificatePDF שיוצר PDF מלא עם תמיכה בעברית וטבלאות (Playwright)
    console.log(`[issueCertificate] Generating PDF for calibration ${calibrationId}...`);
    let pdfBuffer: Buffer;
    try {
      const { generateCertificatePDF } = await import("../pdf/certificatePdf.js");
      pdfBuffer = await generateCertificatePDF({
        ...cal,
        reportNo: certificateNo,
        certificate: { certificateNo }
      });
      console.log(`[issueCertificate] PDF generated successfully, size: ${pdfBuffer.length} bytes`);
    } catch (pdfError: any) {
      console.error(`[issueCertificate] Error generating PDF for calibration ${calibrationId}:`, pdfError);
      throw new Error(`Failed to generate PDF: ${pdfError.message || pdfError}`);
    }

    // שמירת ה-PDF לקובץ
    try {
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log(`[issueCertificate] PDF saved to file: ${pdfPath}`);
    } catch (fileError: any) {
      console.error(`[issueCertificate] Error saving PDF file for calibration ${calibrationId}:`, fileError);
      throw new Error(`Failed to save PDF file: ${fileError.message || fileError}`);
    }

    // יצירת תעודה ב-DB
    let cert;
    try {
      cert = await prisma.certificate.create({
        data: {
          calibrationId,
          certificateNo,
          pdfPath,
          issuedAt: new Date()
        }
      });
      console.log(`[issueCertificate] Certificate created in DB: ${cert.id} (${cert.certificateNo})`);
    } catch (dbError: any) {
      console.error(`[issueCertificate] Error creating certificate in DB for calibration ${calibrationId}:`, dbError);
      // אם יש שגיאה ב-DB, ננסה למחוק את קובץ ה-PDF שנוצר
      try {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`[issueCertificate] Cleaned up PDF file after DB error: ${pdfPath}`);
        }
      } catch (cleanupError) {
        console.error(`[issueCertificate] Error cleaning up PDF file:`, cleanupError);
      }
      throw new Error(`Failed to create certificate in database: ${dbError.message || dbError}`);
    }

    // עדכון סטטוס הכיול
    try {
      await prisma.calibration.update({ where: { id: calibrationId }, data: { status: "CERTIFICATE_ISSUED" } });
      console.log(`[issueCertificate] Calibration ${calibrationId} status updated to CERTIFICATE_ISSUED`);
    } catch (updateError: any) {
      console.error(`[issueCertificate] Error updating calibration status for ${calibrationId}:`, updateError);
      // לא נזרוק שגיאה כאן כי התעודה כבר נוצרה
    }

    console.log(`[issueCertificate] Certificate issuance completed successfully for calibration ${calibrationId}`);
    return cert;
  } catch (error: any) {
    console.error(`[issueCertificate] Fatal error issuing certificate for calibration ${calibrationId}:`, error);
    throw error;
  }
}

approvalsRouter.post("/:calibrationId/approve", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const calibrationId = req.params.calibrationId;
  const { comment } = req.body as { comment?: string };

  const cal = await prisma.calibration.findUnique({ where: { id: calibrationId } });
  if (!cal) return res.status(404).json({ error: "Not found" });
  if (!["SUBMITTED", "IN_REVIEW"].includes(cal.status)) return res.status(409).json({ error: "Invalid status for approval" });

  const dataHash = hashCalibrationSnapshot(cal);

  const approval = await prisma.approval.upsert({
    where: { calibrationId },
    update: { approvedById: req.auth!.userId, approvedAt: new Date(), dataHash, comment: comment ?? null },
    create: { calibrationId, approvedById: req.auth!.userId, dataHash, comment: comment ?? null }
  });

  await prisma.calibration.update({
    where: { id: calibrationId },
    data: { status: "APPROVED", approvedAt: new Date() }
  });

  await auditLog({
    entity: "Calibration",
    entityId: calibrationId,
    field: "status",
    oldValue: cal.status,
    newValue: "APPROVED",
    changedById: req.auth!.userId,
    reason: "Office approval"
  });

    // הנפקת תעודה אוטומטית לאחר אישור
  try {
    const certificate = await issueCertificate(calibrationId);
    console.log(`[Auto-issue] Certificate issued automatically for calibration ${calibrationId}: ${certificate.certificateNo}`);
    
    await auditLog({
      entity: "Calibration",
      entityId: calibrationId,
      field: "status",
      oldValue: "APPROVED",
      newValue: "CERTIFICATE_ISSUED",
      changedById: req.auth!.userId,
      reason: "Certificate auto-issued after approval"
    });

    res.json({ approval, certificate });
      // emit pending count update
      try {
        const io = getIo();
        if (io) {
          const count = await prisma.calibration.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
          io.emit('pendingCalibrationsCount', { count });
        }
      } catch (e) {
        console.error('Error emitting pending count after approval:', e);
      }
    } catch (error: any) {
    console.error(`[Auto-issue] Error issuing certificate for calibration ${calibrationId}:`, error);
    console.error(`[Auto-issue] Error stack:`, error.stack);
    // אם יש שגיאה בהנפקת תעודה, נחזיר רק את האישור (לא נכשיל את כל התהליך)
    const errorMessage = error.message || String(error);
    const errorDetails = error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '';
    res.json({ 
      approval, 
      certificateError: errorMessage,
      certificateErrorDetails: errorDetails
    });
      // even on error issuing certificate, emit pending count
      try {
        const io = getIo();
        if (io) {
          const count = await prisma.calibration.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
          io.emit('pendingCalibrationsCount', { count });
        }
      } catch (e) {
        console.error('Error emitting pending count after approval (error path):', e);
      }
    }
});
