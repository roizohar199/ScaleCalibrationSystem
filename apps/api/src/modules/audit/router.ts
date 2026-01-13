import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, AuthedRequest } from "../auth/middleware.js";

export const auditRouter = Router();

// Get audit logs for an entity
auditRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const entity = String(req.query.entity || "").trim();
  const entityId = String(req.query.entityId || "").trim();

  if (!entity || !entityId) {
    return res.status(400).json({ error: "entity and entityId are required" });
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      entity,
      entityId
    },
    include: {
      changedBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });

  res.json(logs);
});

