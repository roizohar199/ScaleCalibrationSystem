import { Router } from "express";
import { buildCertificateHtml } from "./htmlTemplate.js";
import { renderHtmlToPdfBuffer } from "./renderPdf.js";

export const pdfRouter = Router();

/**
 * GET /api/pdf/certificate/demo
 * Demo endpoint to prove: Hebrew RTL + correct spacing.
 */
pdfRouter.get("/certificate/demo", async (req, res) => {
  try {
    const html = buildCertificateHtml({
      title: 'דו"ח בדיקת מאזניים',
      certificateNo: "2026-727159",
      customerName: "מטרו מרקט בע״מ",
      customerId: "56756",
      scaleManufacturer: "Mettler Toledo",
      scaleModel: "electronic",
      scaleSerial: "123456",
      location: "אשדוד",
      date: "13.01.2026",
      blocks: [
        { label: "סוג בדיקה", value: "דיוק קריאה ואפס" },
        { label: "הערות", value: "עברית RTL תקינה עם רווחים בין מילים.\nכולל ירידת שורה ושמירה על רווחים." },
        { label: "שילוב", value: "דגם (X100) 2026 - בדיקה" },
      ],
      tables: [
        {
          title: "ACCURACY OF READING AND ZERO DEVIATION",
          columns: ["LOAD MASS", "UPLOAD READING", "UPLOAD ERROR", "PERMISSIBLE ERROR"],
          rows: [
            [0, 0, 0, 0.001],
            [0.5, 0.5, 0, 0.001],
            [1, 1, 0, 0.001],
            [5, 5, 0, 0.001],
            [10, 10, 0, 0.001],
            [15, 15, 0, 0.001],
          ],
        },
      ],
    });

    const pdfBuffer = await renderHtmlToPdfBuffer(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="certificate-demo.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error("[pdf/certificate/demo] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate PDF" });
  }
});
