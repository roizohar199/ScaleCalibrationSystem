import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export const customersRouter = Router();

// פונקציה ליצירת מספר לקוח אוטומטי
async function nextCustomerNo(): Promise<string> {
  // קח את כל הלקוחות שיש להם מספר לקוח
  const customersWithNumber = await prisma.customer.findMany({
    where: {
      customerNo: { not: null }
    },
    select: {
      customerNo: true
    }
  });
  
  if (customersWithNumber.length === 0) {
    // אם אין לקוחות, התחל מ-1
    return "1";
  }
  
  // מצא את המספר הגבוה ביותר (ממיר למספר כדי למיין נכון)
  const numbers = customersWithNumber
    .map(c => {
      const num = parseInt(c.customerNo || "0", 10);
      return isNaN(num) ? 0 : num;
    })
    .sort((a, b) => b - a);
  
  const maxNumber = numbers[0] || 0;
  return String(maxNumber + 1);
}

customersRouter.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const customers = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { customerNo: { contains: q } }] }
      : undefined,
    take: 200, // הגדלנו כדי להחזיר יותר לקוחות
    orderBy: { name: "asc" }
  });
  res.json(customers);
});

customersRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sites: {
        orderBy: { name: "asc" }
      },
      scales: {
        include: {
          model: {
            select: {
              id: true,
              manufacturer: true,
              modelName: true,
              maxCapacity: true,
              unit: true
            }
          }
        },
        orderBy: { updatedAt: "desc" }
      },
      _count: {
        select: {
          scales: true,
          sites: true,
          calibrations: true
        }
      }
    }
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

customersRouter.post("/", requireAuth, requireRole(["TECHNICIAN", "OFFICE", "ADMIN"]), async (req, res) => {
  try {
    const { name, taxId, address, contact, phone } = req.body;
    
    // ולידציה לשדות חובה
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "שם לקוח נדרש" });
    }
    if (!taxId || !taxId.trim()) {
      return res.status(400).json({ error: "ח.פ/ע.מ נדרש" });
    }
    // ולידציה לח.פ/ע.מ - מספרי בלבד, בדיוק 9 ספרות
    const taxIdClean = taxId.trim().replace(/-/g, '');
    if (!/^\d{9}$/.test(taxIdClean)) {
      return res.status(400).json({ error: "ח.פ/ע.מ חייב להכיל בדיוק 9 ספרות מספריות" });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ error: "כתובת נדרש" });
    }
    if (!contact || !contact.trim()) {
      return res.status(400).json({ error: "איש קשר נדרש" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: "טלפון נדרש" });
    }
    // ולידציה לטלפון - מספרי בלבד, 3 ספרות קידומת + 7 ספרות (10 ספרות סה"כ)
    const phoneClean = phone.trim().replace(/-/g, '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(phoneClean)) {
      return res.status(400).json({ error: "טלפון חייב להכיל בדיוק 10 ספרות מספריות (3 ספרות קידומת + 7 ספרות)" });
    }

    // בדיקה אם הלקוח כבר קיים
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" }
      }
    });

    if (existingCustomer) {
      return res.status(409).json({ error: `לקוח בשם "${name.trim()}" כבר קיים במערכת` });
    }

    // צור מספר לקוח אוטומטית
    const finalCustomerNo = await nextCustomerNo();

    const created = await prisma.customer.create({ 
      data: { 
        name: name.trim(),
        taxId: taxIdClean,
        customerNo: finalCustomerNo,
        address: address.trim(),
        contact: contact.trim(),
        phone: phoneClean
      } 
    });
    res.json(created);
  } catch (error: any) {
    console.error('Error creating customer:', error);
    // שגיאות Prisma
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'לקוח עם שם זה כבר קיים במערכת' });
    }
    res.status(500).json({ error: error.message || 'שגיאה ביצירת לקוח' });
  }
});

customersRouter.put("/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;
  const { name, taxId, address, contact, phone } = req.body;
  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(taxId !== undefined && { taxId }),
        ...(address !== undefined && { address }),
        ...(contact !== undefined && { contact }),
        ...(phone !== undefined && { phone })
      }
    });
    res.json(updated);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(400).json({ error: error.message || "Failed to update customer" });
  }
});

customersRouter.delete("/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.customer.delete({ where: { id } });
    res.json({ message: "Customer deleted" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(400).json({ error: error.message || "Failed to delete customer" });
  }
});

// Sites endpoints
customersRouter.get("/:customerId/sites", requireAuth, async (req, res) => {
  const { customerId } = req.params;
  const sites = await prisma.site.findMany({
    where: { customerId },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          scales: true,
          calibrations: true
        }
      }
    }
  });
  res.json(sites);
});

customersRouter.post("/:customerId/sites", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { customerId } = req.params;
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const created = await prisma.site.create({
      data: { customerId, name, address: address || null }
    });
    res.json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to create site" });
  }
});

customersRouter.put("/sites/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;
  const { name, address } = req.body;
  try {
    const updated = await prisma.site.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address })
      }
    });
    res.json(updated);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Site not found" });
    }
    res.status(400).json({ error: error.message || "Failed to update site" });
  }
});

customersRouter.delete("/sites/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.site.delete({ where: { id } });
    res.json({ message: "Site deleted" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Site not found" });
    }
    res.status(400).json({ error: error.message || "Failed to delete site" });
  }
});

