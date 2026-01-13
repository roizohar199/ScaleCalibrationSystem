import { Router } from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth/middleware.js";
import { auditLog } from "../audit/log.js";
import { getIo } from "../../socket.js";
import { generateCertificatePDF } from "../pdf/certificatePdf.js";

export const calibrationsRouter = Router();

// Get count of pending approvals (SUBMITTED or IN_REVIEW)
calibrationsRouter.get("/pending-count", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const count = await prisma.calibration.count({
    where: {
      status: {
        in: ["SUBMITTED", "IN_REVIEW"]
      }
    }
  });
  res.json({ count });
});

// List by status (office view) or mine (technician)
calibrationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const status = String(req.query.status || "").trim() as any;
  const mine = String(req.query.mine || "").trim() === "1";
  const scaleId = String(req.query.scaleId || "").trim();
  const customerName = String(req.query.customerName || "").trim();

  const where: any = {};
  const baseConditions: any = {};
  
  // סינון לפי טכנאי - זה חשוב מאוד שתמיד יעבוד כש-mine=1
  if (mine) {
    baseConditions.technicianId = req.auth!.userId;
  }
  
  if (status) baseConditions.status = status;
  if (scaleId) baseConditions.scaleId = scaleId;
  
  if (customerName) {
    // חיפוש לפי שם לקוח - יכול להיות ב-customerId ישיר או דרך scale->customer או scale->site->customer
    const customerSearchCondition = {
      OR: [
        { customer: { name: { contains: customerName, mode: "insensitive" } } },
        { scale: { customer: { name: { contains: customerName, mode: "insensitive" } } } },
        { scale: { site: { customer: { name: { contains: customerName, mode: "insensitive" } } } } }
      ]
    };
    
    // אם יש תנאים אחרים, נשלב אותם עם AND
    if (Object.keys(baseConditions).length > 0) {
      where.AND = [
        ...Object.entries(baseConditions).map(([k, v]) => ({ [k]: v })),
        customerSearchCondition
      ];
    } else {
      // אם אין תנאים אחרים, נשתמש רק בחיפוש הלקוח
      Object.assign(where, customerSearchCondition);
    }
  } else {
    // אם אין חיפוש לקוח, נשתמש בתנאים הבסיסיים
    Object.assign(where, baseConditions);
  }

  const rows = await prisma.calibration.findMany({
    where,
    include: {
      customer: true,
      site: true,
      scale: {
        include: {
          model: true
        }
      },
      approvals: true,
      certificate: true,
      technician: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 100
  });

  res.json(rows);
});

// Get single calibration by ID
calibrationsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const cal = await prisma.calibration.findUnique({
    where: { id },
    include: {
      customer: true,
      site: true,
      scale: {
        include: {
          model: true
        }
      },
      approvals: true,
      certificate: true,
      technician: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!cal) return res.status(404).json({ error: "Not found" });
  
  // Log measurementsJson for debugging
  console.log(`[API GET /calibrations/${id}] Raw measurementsJson from DB:`, cal.measurementsJson);
  console.log(`[API GET /calibrations/${id}] measurementsJson type:`, typeof cal.measurementsJson);
  if (cal.measurementsJson) {
    try {
      const parsed = typeof cal.measurementsJson === 'string' 
        ? JSON.parse(cal.measurementsJson) 
        : cal.measurementsJson;
      console.log(`[API GET /calibrations/${id}] Parsed measurementsJson keys:`, Object.keys(parsed));
      console.log(`[API GET /calibrations/${id}] Has accuracy:`, !!parsed.accuracy, Array.isArray(parsed.accuracy) ? parsed.accuracy.length : 'not array');
      console.log(`[API GET /calibrations/${id}] Has eccentricity:`, !!parsed.eccentricity, Array.isArray(parsed.eccentricity) ? parsed.eccentricity.length : 'not array');
      console.log(`[API GET /calibrations/${id}] Has repeatability:`, !!parsed.repeatability, Array.isArray(parsed.repeatability) ? parsed.repeatability.length : 'not array');
      if (Array.isArray(parsed.accuracy) && parsed.accuracy.length > 0) {
        console.log(`[API GET /calibrations/${id}] First accuracy measurement:`, parsed.accuracy[0]);
      }
    } catch (error) {
      console.error(`[API GET /calibrations/${id}] Error parsing measurementsJson:`, error);
    }
  } else {
    console.log(`[API GET /calibrations/${id}] measurementsJson is null or undefined`);
  }
  
  res.json(cal);
});

// Create draft (technician)
calibrationsRouter.post("/", requireAuth, requireRole(["TECHNICIAN", "ADMIN"]), async (req: AuthedRequest, res) => {
  const { customerId, siteId, scaleId, testDate, notes, reportNo, measurementsJson, overallStatus } = req.body;

  console.log('[API POST /calibrations] Creating calibration:', {
    hasMeasurementsJson: measurementsJson !== undefined,
    measurementsJsonType: typeof measurementsJson,
    measurementsJsonKeys: measurementsJson ? Object.keys(measurementsJson) : null,
    measurementsJsonString: measurementsJson ? JSON.stringify(measurementsJson).substring(0, 200) : null,
    overallStatus
  });

  const created = await prisma.calibration.create({
    data: {
      customerId: customerId ?? null,
      siteId: siteId ?? null,
      scaleId: scaleId ?? null,
      reportNo: reportNo ?? null,
      technicianId: req.auth!.userId,
      testDate: testDate ? new Date(testDate) : new Date(),
      notes: notes ?? null,
      measurementsJson: measurementsJson ?? null,
      overallStatus: overallStatus ?? null,
      status: "DRAFT"
    }
  });

  console.log('[API POST /calibrations] Calibration created:', {
    id: created.id,
    hasMeasurementsJson: created.measurementsJson !== null,
    measurementsJsonType: typeof created.measurementsJson,
    measurementsJsonValue: created.measurementsJson ? JSON.stringify(created.measurementsJson).substring(0, 200) : null
  });

  res.json(created);
});

// Update draft (technician) - measurementsJson + visual + overallStatus
calibrationsRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const cal = await prisma.calibration.findUnique({ where: { id } });
  if (!cal) return res.status(404).json({ error: "Not found" });

  // Technician can only edit own draft/returned
  if (req.auth!.role === "TECHNICIAN") {
    if (cal.technicianId !== req.auth!.userId) return res.status(403).json({ error: "Forbidden" });
    if (!["DRAFT", "RETURNED_FOR_FIX"].includes(cal.status)) return res.status(409).json({ error: "Locked" });
  }

  const { measurementsJson, visualCheck, overallStatus, notes, testDate } = req.body;

  console.log('Updating calibration:', {
    id,
    hasMeasurementsJson: measurementsJson !== undefined,
    measurementsJsonType: typeof measurementsJson,
    measurementsJsonKeys: measurementsJson ? Object.keys(measurementsJson) : null,
    measurementsJsonString: measurementsJson ? JSON.stringify(measurementsJson).substring(0, 200) : null,
    overallStatus
  });

  const updateData: any = {};
  
  // measurementsJson - תמיד נעדכן אם הוא נשלח (אפילו אם null או ריק)
  if (measurementsJson !== undefined) {
    updateData.measurementsJson = measurementsJson;
    // לוג מפורט של המדידות
    if (measurementsJson && typeof measurementsJson === 'object') {
      const acc = (measurementsJson as any).accuracy;
      const ecc = (measurementsJson as any).eccentricity;
      const rep = (measurementsJson as any).repeatability;
      console.log('Measurements to save:', {
        accuracyCount: Array.isArray(acc) ? acc.length : 0,
        eccentricityCount: Array.isArray(ecc) ? ecc.length : 0,
        repeatabilityCount: Array.isArray(rep) ? rep.length : 0,
        firstAccuracy: Array.isArray(acc) && acc.length > 0 ? acc[0] : null
      });
    }
  }
  
  if (visualCheck !== undefined) updateData.visualCheck = visualCheck;
  if (overallStatus !== undefined) updateData.overallStatus = overallStatus;
  if (notes !== undefined) updateData.notes = notes;
  if (testDate !== undefined) updateData.testDate = testDate ? new Date(testDate) : null;

  const updated = await prisma.calibration.update({
    where: { id },
    data: updateData
  });

  console.log('Calibration updated:', {
    id: updated.id,
    hasMeasurementsJson: updated.measurementsJson !== null,
    measurementsJsonType: typeof updated.measurementsJson,
    measurementsJsonValue: updated.measurementsJson ? JSON.stringify(updated.measurementsJson).substring(0, 200) : null
  });

  res.json(updated);
});

// Submit to office (technician)
calibrationsRouter.post("/:id/submit", requireAuth, requireRole(["TECHNICIAN", "ADMIN"]), async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const cal = await prisma.calibration.findUnique({ where: { id } });
  if (!cal) return res.status(404).json({ error: "Not found" });
  if (cal.technicianId !== req.auth!.userId && req.auth!.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  if (cal.status !== "DRAFT" && cal.status !== "RETURNED_FOR_FIX") return res.status(409).json({ error: "Invalid status" });

  // compute nextDueDate = testDate + 1 year (if testDate exists)
  const nextDueDate =
    cal.testDate ? new Date(new Date(cal.testDate).setFullYear(new Date(cal.testDate).getFullYear() + 1)) : null;

  const updated = await prisma.calibration.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date(), nextDueDate }
  });

  // emit pending count update to connected clients (if socket enabled)
  try {
    const io = getIo();
    if (io) {
      const count = await prisma.calibration.count({
        where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } }
      });
      io.emit('pendingCalibrationsCount', { count });
    }
  } catch (err) {
    console.error('Error emitting pending count:', err);
  }

  res.json(updated);
});

// Office: set IN_REVIEW
calibrationsRouter.post("/:id/review", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const updated = await prisma.calibration.update({
    where: { id },
    data: { status: "IN_REVIEW" }
  });
  try {
    const io = getIo();
    if (io) {
      const count = await prisma.calibration.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
      io.emit('pendingCalibrationsCount', { count });
    }
  } catch (err) {
    console.error('Error emitting pending count on review:', err);
  }

  res.json(updated);
});

// Office: patch with audit (office corrections)
calibrationsRouter.patch("/:id/office-edit", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const { patch, reason } = req.body as { patch: Record<string, any>; reason: string };

  const cal = await prisma.calibration.findUnique({ where: { id } });
  if (!cal) return res.status(404).json({ error: "Not found" });
  if (!["SUBMITTED", "IN_REVIEW"].includes(cal.status)) return res.status(409).json({ error: "Not editable in this status" });

  const before: any = cal;
  const updated = await prisma.calibration.update({ where: { id }, data: patch });

  // audit each changed field
  for (const [k, v] of Object.entries(patch)) {
    const oldVal = before[k] === undefined ? null : String(before[k]);
    const newVal = v === undefined ? null : String(v);
    if (oldVal !== newVal) {
      await auditLog({
        entity: "Calibration",
        entityId: id,
        field: k,
        oldValue: oldVal,
        newValue: newVal,
        changedById: req.auth!.userId,
        reason: reason || "Office correction"
      });
    }
  }

  res.json(updated);
});

// Office: return to technician
calibrationsRouter.post("/:id/return", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const { reason } = req.body as { reason: string };
  const updated = await prisma.calibration.update({
    where: { id },
    data: { status: "RETURNED_FOR_FIX", notes: reason ? `[RETURNED] ${reason}` : undefined }
  });

  await auditLog({
    entity: "Calibration",
    entityId: id,
    field: "status",
    oldValue: "SUBMITTED/IN_REVIEW",
    newValue: "RETURNED_FOR_FIX",
    changedById: req.auth!.userId,
    reason: reason || "Returned for fix"
  });

  // emit pending count update to connected clients
  try {
    const io = getIo();
    if (io) {
      const count = await prisma.calibration.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
      io.emit('pendingCalibrationsCount', { count });
    }
  } catch (err) {
    console.error('Error emitting pending count on return:', err);
  }

  res.json(updated);
});

// Generate PDF report
calibrationsRouter.get("/:id/report-pdf", requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const cal = await prisma.calibration.findUnique({
    where: { id },
    include: {
      customer: true,
      site: true,
      scale: {
        include: {
          model: true
        }
      }
    }
  });

  if (!cal) return res.status(404).json({ error: "Not found" });

  try {
    const pdfBuffer = await generateCertificatePDF(cal);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="דוח_${cal.reportNo || cal.id.slice(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Send report via email
calibrationsRouter.post("/:id/send-report-email", requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const { email } = req.body as { email: string };

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const cal = await prisma.calibration.findUnique({
    where: { id },
    include: {
      customer: true,
      site: true,
      scale: {
        include: {
          model: true
        }
      }
    }
  });

  if (!cal) return res.status(404).json({ error: "Not found" });

  try {
    // Generate PDF using Playwright
    const pdfBuffer = await generateCertificatePDF(cal);

    // Configure email transporter (using environment variables or defaults)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      }
    });

    // If no SMTP configured, return error
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({ 
        error: "Email service not configured. Please set SMTP_USER and SMTP_PASS environment variables." 
      });
    }

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `דוח כיול - ${cal.reportNo || cal.id.slice(0, 8)}`,
      text: `שלום,\n\nנשלח אליך דוח כיול מספר ${cal.reportNo || cal.id.slice(0, 8)}.\n\nפרטים:\nלקוח: ${cal.customer?.name || '-'}\nמשקל: ${cal.scale?.model?.modelName || cal.scale?.deviceType || '-'}\nתאריך בדיקה: ${cal.testDate ? new Date(cal.testDate).toLocaleDateString("he-IL") : "-"}\n\nבברכה,\nמערכת כיולים`,
      html: `
        <div dir="rtl">
          <h2>דוח כיול</h2>
          <p>שלום,</p>
          <p>נשלח אליך דוח כיול מספר <strong>${cal.reportNo || cal.id.slice(0, 8)}</strong>.</p>
          <h3>פרטים:</h3>
          <ul>
            <li>לקוח: ${cal.customer?.name || '-'}</li>
            <li>משקל: ${cal.scale?.model?.modelName || cal.scale?.deviceType || '-'}</li>
            <li>תאריך בדיקה: ${cal.testDate ? new Date(cal.testDate).toLocaleDateString("he-IL") : "-"}</li>
          </ul>
          <p>בברכה,<br>מערכת כיולים</p>
        </div>
      `,
      attachments: [
        {
          filename: `דוח_${cal.reportNo || cal.id.slice(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({ success: true, message: "Report sent successfully" });
  } catch (error: any) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

// Utility hash for approval
export function hashCalibrationSnapshot(cal: any) {
  const stable = {
    customerId: cal.customerId,
    siteId: cal.siteId,
    scaleId: cal.scaleId,
    reportNo: cal.reportNo,
    testDate: cal.testDate,
    nextDueDate: cal.nextDueDate,
    visualCheck: cal.visualCheck,
    overallStatus: cal.overallStatus,
    measurementsJson: cal.measurementsJson
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

