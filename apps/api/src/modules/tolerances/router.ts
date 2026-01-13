import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { getHubTolerancePlan, getOimlTolerancePlan } from "./engine.js";

export const tolerancesRouter = Router();

tolerancesRouter.get("/plan", requireAuth, async (req, res) => {
  const profileId = String(req.query.profileId || "").trim();
  const testType = String(req.query.testType || "").trim();

  if (!profileId) return res.status(400).json({ error: "profileId required" });
  if (!testType) return res.status(400).json({ error: "testType required" });

  try {
    // בדיקה מהו מצב הסובלנות של הפרופיל
    const { prisma } = await import("../../db/prisma.js");
    const profile = await prisma.metrologicalProfile.findUnique({
      where: { id: profileId },
      select: { toleranceMode: true }
    });
    
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    
    // בחירת הפונקציה המתאימה לפי מצב הסובלנות
    const plan = profile.toleranceMode === "OIML_ENGINE"
      ? await getOimlTolerancePlan(profileId, testType as any)
      : await getHubTolerancePlan(profileId, testType as any);
    
    res.json({ profileId, testType, plan, toleranceMode: profile.toleranceMode });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to get tolerance plan" });
  }
});
