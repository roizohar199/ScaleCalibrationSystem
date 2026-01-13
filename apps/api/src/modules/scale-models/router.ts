import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export const scaleModelsRouter = Router();

/**
 * GET /scale-models
 * רשימת דגמי משקלים עם חיפוש וסינון
 */
scaleModelsRouter.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const manufacturer = String(req.query.manufacturer || "").trim();
  const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;

  const where: any = {};

  if (q) {
    where.OR = [
      { manufacturer: { contains: q, mode: "insensitive" } },
      { modelName: { contains: q, mode: "insensitive" } }
    ];
  }

  if (manufacturer) {
    where.manufacturer = { contains: manufacturer, mode: "insensitive" };
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const scaleModels = await prisma.scaleModel.findMany({
    where,
    include: {
      defaultProfile: {
        select: {
          id: true,
          capacity: true,
          unit: true,
          d: true,
          e: true,
          accuracyCls: true
        }
      },
      _count: {
        select: {
          scales: true
        }
      }
    },
    orderBy: [
      { manufacturer: "asc" },
      { modelName: "asc" }
    ],
    take: 100
  });

  res.json(scaleModels);
});

/**
 * GET /scale-models/:id
 * פרטי דגם משקל ספציפי
 */
scaleModelsRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const scaleModel = await prisma.scaleModel.findUnique({
    where: { id },
    include: {
      defaultProfile: true,
      scales: {
        take: 10,
        include: {
          customer: {
            select: { id: true, name: true }
          },
          site: {
            select: { id: true, name: true }
          }
        }
      }
    }
  });

  if (!scaleModel) {
    return res.status(404).json({ error: "Scale model not found" });
  }

  res.json(scaleModel);
});

/**
 * POST /scale-models
 * יצירת דגם משקל חדש (כל המשתמשים המאושרים - כולל טכנאים)
 */
scaleModelsRouter.post("/", requireAuth, async (req, res) => {
  const {
    manufacturer,
    modelName,
    maxCapacity,
    unit,
    d,
    e,
    accuracyClass,
    defaultProfileId
  } = req.body;

  if (!manufacturer || !modelName || maxCapacity === undefined || !unit || d === undefined || e === undefined || !accuracyClass) {
    return res.status(400).json({ error: "Missing required fields: manufacturer, modelName, maxCapacity, unit, d, e, accuracyClass" });
  }

  try {
    const created = await prisma.scaleModel.create({
      data: {
        manufacturer,
        modelName,
        maxCapacity: maxCapacity as any,
        unit,
        d: d as any,
        e: e as any,
        accuracyClass,
        defaultProfileId: defaultProfileId || null
      },
      include: {
        defaultProfile: true
      }
    });

    res.json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to create scale model" });
  }
});

/**
 * PUT /scale-models/:id
 * עדכון דגם משקל
 */
scaleModelsRouter.put("/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;
  const {
    manufacturer,
    modelName,
    maxCapacity,
    unit,
    d,
    e,
    accuracyClass,
    defaultProfileId,
    isActive
  } = req.body;

  try {
    const updated = await prisma.scaleModel.update({
      where: { id },
      data: {
        ...(manufacturer !== undefined && { manufacturer }),
        ...(modelName !== undefined && { modelName }),
        ...(maxCapacity !== undefined && { maxCapacity: maxCapacity as any }),
        ...(unit !== undefined && { unit }),
        ...(d !== undefined && { d: d as any }),
        ...(e !== undefined && { e: e as any }),
        ...(accuracyClass !== undefined && { accuracyClass }),
        ...(defaultProfileId !== undefined && { defaultProfileId: defaultProfileId || null }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        defaultProfile: true
      }
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Scale model not found" });
    }
    res.status(400).json({ error: error.message || "Failed to update scale model" });
  }
});

/**
 * DELETE /scale-models/:id
 * מחיקת דגם משקל (soft delete - משנה isActive ל-false)
 */
scaleModelsRouter.delete("/:id", requireAuth, requireRole(["OFFICE", "ADMIN"]), async (req, res) => {
  const { id } = req.params;

  try {
    // Soft delete - משנה isActive ל-false
    const updated = await prisma.scaleModel.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: "Scale model deactivated", scaleModel: updated });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Scale model not found" });
    }
    res.status(400).json({ error: error.message || "Failed to delete scale model" });
  }
});

/**
 * GET /scale-models/:id/suggest-profile
 * הצעת פרופיל מטרולוגי לדגם משקל
 */
scaleModelsRouter.get("/:id/suggest-profile", requireAuth, async (req, res) => {
  const { id } = req.params;

  const scaleModel = await prisma.scaleModel.findUnique({
    where: { id },
    include: {
      defaultProfile: true
    }
  });

  if (!scaleModel) {
    return res.status(404).json({ error: "Scale model not found" });
  }

  // אם יש פרופיל ברירת מחדל, מחזירים אותו
  if (scaleModel.defaultProfile) {
    return res.json({ found: true, profile: scaleModel.defaultProfile, source: "default" });
  }

  // אחרת, מחפשים פרופיל תואם לפי הפרמטרים המטרולוגיים
  const profile = await prisma.metrologicalProfile.findFirst({
    where: {
      capacity: { gte: scaleModel.maxCapacity as any },
      unit: scaleModel.unit,
      d: scaleModel.d as any,
      e: scaleModel.e as any,
      accuracyCls: scaleModel.accuracyClass,
      toleranceMode: "HUB_REFERENCE"
    },
    orderBy: { capacity: "asc" },
    take: 1
  });

  if (!profile) {
    return res.json({ found: false, profile: null });
  }

  res.json({ found: true, profile, source: "matched" });
});

