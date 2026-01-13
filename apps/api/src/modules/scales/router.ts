import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../auth/middleware.js";

export const scalesRouter = Router();

/**
 * GET /scales/lookup?serial=XXXX
 * serial can match serialMfg OR serialInternal
 */
scalesRouter.get("/lookup", requireAuth, async (req, res) => {
  const serial = String(req.query.serial || "").trim();
  if (!serial) return res.status(400).json({ error: "serial required" });

  const scale = await prisma.scale.findFirst({
    where: {
      OR: [
        { serialMfg: { equals: serial, mode: "insensitive" } as any },
        { serialInternal: { equals: serial, mode: "insensitive" } as any }
      ]
    },
    include: {
      customer: true,
      site: true,
      model: true,
      calibrations: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: { id: true, status: true, testDate: true }
      }
    }
  });

  if (!scale) return res.json({ found: false });

  return res.json({ found: true, scale });
});

/**
 * GET /scales?q=
 */
scalesRouter.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const scales = await prisma.scale.findMany({
    where: q
      ? {
          OR: [
            { serialMfg: { contains: q, mode: "insensitive" } },
            { serialInternal: { contains: q, mode: "insensitive" } },
            { deviceType: { contains: q, mode: "insensitive" } },
            { modelName: { contains: q, mode: "insensitive" } },
            { model: { manufacturer: { contains: q, mode: "insensitive" } } },
            { model: { modelName: { contains: q, mode: "insensitive" } } }
          ]
        }
      : undefined,
    take: 50,
    orderBy: { updatedAt: "desc" },
    include: {
      customer: true,
      site: true,
      model: true
    }
  });
  res.json(scales);
});

/**
 * GET /scales/:id
 * Get single scale by ID
 */
scalesRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  
  const scale = await prisma.scale.findUnique({
    where: { id },
    include: {
      customer: true,
      site: true,
      model: true
    }
  });

  if (!scale) {
    return res.status(404).json({ error: "Scale not found" });
  }

  res.json(scale);
});

/**
 * POST /scales
 * Create a new scale card
 */
scalesRouter.post("/", requireAuth, async (req, res) => {
  const {
    customerId,
    siteId,
    modelId,
    manufacturer,
    deviceType,
    modelName,
    serialMfg,
    serialInternal
  } = req.body as any;

  if (!customerId) return res.status(400).json({ error: "customerId required" });
  if (!serialMfg && !serialInternal) return res.status(400).json({ error: "serialMfg or serialInternal required" });

  const created = await prisma.scale.create({
    data: {
      customerId,
      siteId: siteId || null,
      modelId: modelId || null,
      manufacturer: manufacturer || null,
      deviceType: deviceType || null,
      modelName: modelName || null,
      serialMfg: serialMfg || null,
      serialInternal: serialInternal || null
    },
    include: {
      customer: true,
      site: true,
      model: true
    }
  });

  res.json(created);
});

/**
 * PUT /scales/:id
 * עדכון משקל
 */
scalesRouter.put("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    customerId,
    siteId,
    modelId,
    manufacturer,
    deviceType,
    modelName,
    serialMfg,
    serialInternal
  } = req.body as any;

  try {
    const updated = await prisma.scale.update({
      where: { id },
      data: {
        ...(customerId !== undefined && { customerId }),
        ...(siteId !== undefined && { siteId: siteId || null }),
        ...(modelId !== undefined && { modelId: modelId || null }),
        ...(manufacturer !== undefined && { manufacturer: manufacturer || null }),
        ...(deviceType !== undefined && { deviceType: deviceType || null }),
        ...(modelName !== undefined && { modelName: modelName || null }),
        ...(serialMfg !== undefined && { serialMfg: serialMfg || null }),
        ...(serialInternal !== undefined && { serialInternal: serialInternal || null })
      },
    include: {
      customer: true,
      site: true,
      model: true
    }
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Scale not found" });
    }
    res.status(400).json({ error: error.message || "Failed to update scale" });
  }
});

// Endpoint removed - metrological profiles were removed from the system