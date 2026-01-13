import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { documentsRouter } from "./documents.js";

export const importsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// שימוש ב-documentsRouter
importsRouter.use("/documents", documentsRouter);

// Upload customers.csv
importsRouter.post(
  "/customers",
  requireAuth,
  requireRole(["OFFICE", "ADMIN"]),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const records: Array<any> = [];
    const parser = parse(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true });

    for await (const r of parser) records.push(r);

    let created = 0;
    let updated = 0;

    for (const r of records) {
      const name = (r.customer_name || r.name || "").trim();
      if (!name) continue;

      const customerNo = (r.customer_id || r.customerNo || "").trim() || null;
      const address = (r.address || "").trim() || null;
      const contact = (r.contact || "").trim() || null;
      const phone = (r.phone || "").trim() || null;

      // upsert on (name + customerNo) when customerNo exists, else on name only
      const existing = await prisma.customer.findFirst({
        where: customerNo ? { name, customerNo } : { name }
      });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { address, contact, phone }
        });
        updated++;
      } else {
        await prisma.customer.create({
          data: { name, customerNo, address, contact, phone }
        });
        created++;
      }
    }

    res.json({ created, updated, total: records.length });
  }
);
