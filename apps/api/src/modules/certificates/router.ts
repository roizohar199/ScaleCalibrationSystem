import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth/middleware.js";
import nodemailer from "nodemailer";
import { generateCertificatePDF } from "../pdf/certificatePdf.js";
import { preprocessHebrewText } from '../../utils/hebrewBidi.js';

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

  const fileName = `תעודה_${certificate.certificateNo}.pdf`;
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
    // Import docx library dynamically
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign } = await import("docx");
    
    // Helper function to format numbers
    const formatNumber = (value: any, decimals: number = 3): string => {
      if (value == null || value === '') return '-';
      const num = Number(value);
      if (!Number.isFinite(num)) return '-';
      return num.toFixed(decimals).replace(/\.?0+$/, '');
    };
    
    // Parse measurements
    const measurementsJson = cal.measurementsJson ? (
      typeof cal.measurementsJson === 'string' 
        ? JSON.parse(cal.measurementsJson)
        : cal.measurementsJson
    ) : null;
    
    const measurements = measurementsJson?.measurements 
      ? measurementsJson.measurements
      : (measurementsJson || { accuracy: [], eccentricity: [], repeatability: [] });

    // Create document
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              orientation: "portrait",
              width: 11906, // A4 width in TWIP (1/20th of a point)
              height: 16838  // A4 height in TWIP
            },
            margin: {
              top: 1440,    // 1 inch = 1440 TWIP
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: [
          // Title
          new Paragraph({
            text: preprocessHebrewText("דו\"ח בדיקת מאזניים"),
            alignment: AlignmentType.CENTER,
            heading: "Heading1",
            spacing: { after: 200 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`דו\"ח מספר: ${cal.reportNo || certificate.certificateNo || 'ללא'}`),
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Customer details
          new Paragraph({
            text: preprocessHebrewText("פרטי הלקוח"),
            heading: "Heading2",
            spacing: { before: 200, after: 200 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`שם הלקוח:\t${cal.customer?.name ?? "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`מס' לקוח:\t${cal.customer?.customerNo ?? "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`כתובת:\t${cal.customer?.address ?? "-"}`),
            spacing: { after: 400 }
          }),
          
          // Scale details
          new Paragraph({
            text: preprocessHebrewText("פרטי המאזניים"),
            heading: "Heading2",
            spacing: { before: 200, after: 200 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`שם יצרן:\t${(cal.scale?.model?.manufacturer || cal.scale?.manufacturer) ?? "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`סוג מכשיר:\t${(cal.scale?.model?.modelName || cal.scale?.deviceType) ?? "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`מס' סידורי יצרן:\t${cal.scale?.serialMfg ?? "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`כושר העמסה:\t${cal.scale?.model?.maxCapacity ? formatNumber(Number(cal.scale.model.maxCapacity), 0) : "-"} ${cal.scale?.model?.unit === 'kg' ? 'ק"ג' : cal.scale?.model?.unit || ''}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`מספר חלוקות:\t${cal.scale?.model?.maxCapacity && cal.scale?.model?.e ? Math.floor(Number(cal.scale.model.maxCapacity) / Number(cal.scale.model.e)) : "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`ערך חלוקה ממשית (d):\t${cal.scale?.model?.d ? formatNumber(Number(cal.scale.model.d), 3) : "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`ערך חלוקה לכיול (e):\t${cal.scale?.model?.e ? formatNumber(Number(cal.scale.model.e), 3) : "-"}`),
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: preprocessHebrewText(`רמת דיוק:\t${cal.scale?.model?.accuracyClass ?? "-"}`),
            spacing: { after: 200 }
          }),
          
          // Test dates
          ...(cal.testDate ? [
            new Paragraph({
              text: `תאריך בדיקה:\t${new Date(cal.testDate).toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric', year: '2-digit' })}`,
              spacing: { after: 100 }
            }),
            ...(cal.nextDueDate ? [
              new Paragraph({
                text: `תאריך בדיקה הבאה:\t${new Date(cal.nextDueDate).toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric', year: '2-digit' })}`,
                spacing: { after: 400 }
              })
            ] : [])
          ] : []),
          
          // Accuracy table
          ...(measurements.accuracy && measurements.accuracy.length > 0 ? [
            new Paragraph({
              text: "סטיית דיוק הסקלה וסטיה מאיפוס",
              heading: "Heading2",
              spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
              text: "ACCURACY OF READING AND ZERO DEVIATION",
              spacing: { after: 200 }
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
              },
              rows: [
                // Header row
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        text: "מסה מועמסת",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "קריאה בעליה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה בעליה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "קריאה בירידה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה בירידה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה מותרת",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    })
                  ]
                }),
                // Data rows - סדר: מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת
                ...measurements.accuracy.map((row: any) => {
                  const load = row.load != null ? Number(row.load) : null;
                  const reading1 = row.reading1 != null ? Number(row.reading1) : null;
                  const reading3 = row.reading3 != null ? Number(row.reading3) : null;
                  const error1 = reading1 != null && load != null ? reading1 - load : null;
                  const error3 = reading3 != null && load != null ? reading3 - load : null;
                  const tolerance = row.tolerance != null ? Number(row.tolerance) : null;
                  
                  return new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(load, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(reading1, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(error1, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(reading3, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(error3, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(tolerance, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      })
                    ]
                  });
                })
              ]
            })
          ] : []),
          
          // Eccentricity table
          ...(measurements.eccentricity && measurements.eccentricity.length > 0 ? [
            new Paragraph({
              text: "בדיקת אי מרכזיות העמסה (פינות)",
              heading: "Heading2",
              spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
              text: "ECCENTRICITY TEST",
              spacing: { after: 200 }
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
              },
              rows: [
                // Header row
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        text: "נקודת העמסה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "קריאה בעליה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה בעליה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה מותרת",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    })
                  ]
                }),
                // Data rows
                ...measurements.eccentricity.map((row: any) => {
                  const position = row.position || row.load || null;
                  const load = row.load != null ? Number(row.load) : (position ? 5 : null);
                  const reading = row.reading || row.reading1;
                  const readingValue = reading != null ? Number(reading) : null;
                  const error = readingValue != null && load != null ? readingValue - load : null;
                  const tolerance = row.tolerance != null ? Number(row.tolerance) : null;
                  
                  return new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          text: position ? String(position) : '-',
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(readingValue, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(error, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(tolerance, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      })
                    ]
                  });
                })
              ]
            })
          ] : []),
          
          // Repeatability table
          ...(measurements.repeatability && measurements.repeatability.length > 0 ? [
            new Paragraph({
              text: "בדיקת הדירות",
              heading: "Heading2",
              spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
              text: "REPEATABILITY TEST",
              spacing: { after: 200 }
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
              },
              rows: [
                // Header row
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        text: "מסה מועמסת",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "קריאת המסה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה בקריאה",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        text: "סטיה מותרת",
                        alignment: AlignmentType.CENTER
                      })],
                      shading: { fill: "E0E0E0", type: ShadingType.SOLID },
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      verticalAlign: VerticalAlign.CENTER
                    })
                  ]
                }),
                // Data rows
                ...measurements.repeatability.map((row: any) => {
                  const load = row.load != null ? Number(row.load) : null;
                  const reading = row.reading || row.readings?.[0];
                  const readingValue = reading != null ? Number(reading) : null;
                  const error = readingValue != null && load != null ? readingValue - load : null;
                  const tolerance = row.tolerance != null ? Number(row.tolerance) : null;
                  
                  return new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(load, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(readingValue, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(error, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          text: formatNumber(tolerance, 3),
                          alignment: AlignmentType.CENTER
                        })],
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                        verticalAlign: VerticalAlign.CENTER
                      })
                    ]
                  });
                })
              ]
            })
          ] : []),
          
          // Visual check and status
          new Paragraph({
            text: `בדיקה חזותית: ${cal.visualCheck ?? 'תקין'}`,
            spacing: { before: 400, after: 100 }
          }),
          new Paragraph({
            text: `סטטוס הבדיקה: ${cal.overallStatus ?? 'שמיש'}`,
            spacing: { after: 400 }
          }),
          
          // Footer notes
          new Paragraph({
            text: "המאזניים נבדקו בעזרת משקולות המאושרות ומכויילות ע\"י משרד התעשייה והמסחר מפרט עבודה תואם תקן בינלאומי 111 - R  O.I.M.L.",
            spacing: { before: 400, after: 100 }
          }),
          new Paragraph({
            text: `כל המידות נמדדו ב${cal.scale?.model?.unit === 'kg' ? 'ק"ג' : cal.scale?.model?.unit === 'g' ? 'גרם' : cal.scale?.model?.unit || 'ק"ג'}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: "כל הזמנים נמדדו בשניות.",
            spacing: { after: 200 }
          })
        ]
      }]
    });

    // Ensure all text nodes are preprocessed for Hebrew (wrap with RLE if needed)
    const walkAndWrap = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walkAndWrap);
      if (typeof node === 'object') {
        for (const k of Object.keys(node)) {
          try {
            if (k === 'text' && typeof node[k] === 'string') {
              node[k] = preprocessHebrewText(node[k]);
            } else {
              walkAndWrap(node[k]);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    };
    try {
      walkAndWrap(doc);
    } catch (e) {}

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    
    const fileName = `תעודה_${certificate.certificateNo}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
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
    res.setHeader('Content-Disposition', `inline; filename="תעודה_${certificate.certificateNo}.pdf"`);
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
        { filename: `תעודה_${certificate.certificateNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
      ]
    });

    res.json({ success: true, message: 'Certificate sent' });
  } catch (error: any) {
    console.error('Error sending certificate email:', error);
    res.status(500).json({ error: error.message || 'Failed to send certificate' });
  }
});
