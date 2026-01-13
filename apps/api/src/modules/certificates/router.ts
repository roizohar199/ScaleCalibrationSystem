import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth/middleware.js";
import nodemailer from "nodemailer";
import { generateCertificatePDF } from "../pdf/certificatePdf.js";

export const certificatesRouter = Router();

// Get all certificates
certificatesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const certificates = await prisma.certificate.findMany({
    include: {
      calibration: {
        include: {
          customer: true,
          scale: {
            include: {
              model: true
            }
          }
        }
      }
    },
    orderBy: {
      issuedAt: "desc"
    },
    take: 500
  });

  res.json(certificates);
});

// Get single certificate by ID
certificatesRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      calibration: {
        include: {
          customer: true,
          scale: {
            include: {
              model: true
            }
          }
        }
      }
    }
  });

  if (!certificate) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  res.json(certificate);
});

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

certificatesRouter.post("/:calibrationId/issue", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const calibrationId = req.params.calibrationId;

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

  if (!cal) return res.status(404).json({ error: "Not found" });
  if (cal.status !== "APPROVED") return res.status(409).json({ error: "Must be APPROVED" });

  const existing = await prisma.certificate.findUnique({ where: { calibrationId } });
  if (existing) return res.json(existing);

  const certificateNo = nextCertificateNo();
  const outDir = path.resolve("storage/certificates");
  ensureDir(outDir);
  const pdfPath = path.join(outDir, `${certificateNo}.pdf`);

  // שימוש ב-generateCertificatePDF שיוצר PDF מלא עם תמיכה בעברית וטבלאות (Playwright)
  const pdfBuffer = await generateCertificatePDF({
    ...cal,
    reportNo: certificateNo,
    certificate: { certificateNo }
  });

  // שמירת ה-PDF לקובץ
  fs.writeFileSync(pdfPath, pdfBuffer);

  const cert = await prisma.certificate.create({
    data: {
      calibrationId,
      certificateNo,
      pdfPath,
      issuedAt: new Date()
    }
  });

  await prisma.calibration.update({ where: { id: calibrationId }, data: { status: "CERTIFICATE_ISSUED" } });

  res.json(cert);
});

// Download PDF certificate
certificatesRouter.get("/:id/download-pdf", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      calibration: {
        include: {
          customer: true,
          scale: {
            include: {
              model: true
            }
          }
        }
      }
    }
  });

  if (!certificate) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  // Check if PDF file exists
  if (!fs.existsSync(certificate.pdfPath)) {
    return res.status(404).json({ error: "PDF file not found" });
  }

  const fileName = `${certificate.certificateNo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.sendFile(path.resolve(certificate.pdfPath));
});

// Generate and download DOCX certificate
certificatesRouter.get("/:id/download-docx", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      calibration: {
        include: {
          customer: true,
          site: true,
          scale: {
            include: {
              model: true
            }
          }
        }
      }
    }
  });

  if (!certificate) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  const cal = certificate.calibration;
  if (!cal) {
    return res.status(404).json({ error: "Calibration not found" });
  }

  try {
    // Generate DOCX using HTML template (same as PDF)
    const { generateCertificateDOCX } = await import("../pdf/certificateDocx.js");
    const docxBuffer = await generateCertificateDOCX({
      ...cal,
      reportNo: certificate.certificateNo,
      certificate: certificate
    });
    
    const fileName = `${certificate.certificateNo}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(docxBuffer);
  } catch (error: any) {
    console.error("Error generating DOCX:", error);
    res.status(500).json({ error: "Failed to generate DOCX: " + (error.message || "Unknown error") });
  }
});

// Print certificate (generates PDF for printing)
certificatesRouter.get("/:id/print", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      calibration: {
        include: {
          customer: true,
          site: true,
          scale: {
            include: {
              model: true
            }
          }
        }
      }
    }
  });

  if (!certificate) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  const cal = certificate.calibration;
  if (!cal) {
    return res.status(404).json({ error: "Calibration not found" });
  }

  try {
    // Generate PDF with all details using Playwright
    const pdfBuffer = await generateCertificatePDF({
      ...cal,
      reportNo: certificate.certificateNo,
      certificate: certificate
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${certificate.certificateNo}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("Error generating print PDF:", error);
    res.status(500).json({ error: "Failed to generate print PDF: " + (error.message || "Unknown error") });
  }
});

// Send certificate PDF via email
certificatesRouter.post("/:id/send-email", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { email } = req.body as { email?: string };

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email address' });

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      calibration: {
        include: {
          customer: true,
          site: true,
          scale: { include: { model: true } }
        }
      }
    }
  });

  if (!certificate) return res.status(404).json({ error: 'Certificate not found' });

  try {
    let pdfBuffer: Buffer | null = null;
    // if stored PDF exists, use it; otherwise generate fresh PDF
    if (certificate.pdfPath && fs.existsSync(certificate.pdfPath)) {
      pdfBuffer = fs.readFileSync(certificate.pdfPath);
    } else {
      const cal = certificate.calibration;
      if (!cal) return res.status(404).json({ error: 'Calibration not found for certificate' });
      pdfBuffer = await generateCertificatePDF({ ...cal, reportNo: certificate.certificateNo, certificate });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    });

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({ error: 'Email service not configured. Please set SMTP_USER and SMTP_PASS environment variables.' });
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `תעודת כיול - ${certificate.certificateNo}`,
      text: `שלום,\n\nמצורפת תעודת כיול מספר ${certificate.certificateNo}.\n\nבברכה,\nמערכת כיולים`,
      html: `<div dir="rtl"><p>שלום,</p><p>מצורפת תעודת כיול מספר <strong>${certificate.certificateNo}</strong>.</p><p>בברכה,<br/>מערכת כיולים</p></div>`,
      attachments: [
        { filename: `${certificate.certificateNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
      ]
    });

    res.json({ success: true, message: 'Certificate sent' });
  } catch (error: any) {
    console.error('Error sending certificate email:', error);
    res.status(500).json({ error: error.message || 'Failed to send certificate' });
  }
});
