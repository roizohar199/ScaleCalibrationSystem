import { prisma } from "../../db/prisma.js";
import { calcOimlR76Mpe } from "../oiml/r76.js";

export type TestType =
  | "ACCURACY"
  | "ECCENTRICITY"
  | "REPEATABILITY"
  | "SENSITIVITY"
  | "TIME"
  | "TARE";

function decToNum(x: any): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  const n = Number(String(x));
  return Number.isFinite(n) ? n : 0;
}

/**
 * HUB_REFERENCE only (מסלול 1)
 * Returns rows: [{load, mpe, unit, orderNo}]
 */
export async function getHubTolerancePlan(profileId: string, testType: TestType) {
  const profile = await prisma.metrologicalProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error("Profile not found");

  if (profile.toleranceMode !== "HUB_REFERENCE") {
    throw new Error("Profile is not HUB_REFERENCE mode");
  }

  const rows = await prisma.toleranceRow.findMany({
    where: { profileId, testType: testType as any },
    orderBy: { orderNo: "asc" }
  });

  if (!rows.length) {
    throw new Error(`No HUB reference rows for profile=${profileId} testType=${testType}`);
  }

  return rows.map(r => ({
    load: decToNum(r.load),
    mpe: decToNum(r.mpe),
    unit: r.unit || profile.unit,
    orderNo: r.orderNo
  }));
}

/**
 * OIML_ENGINE mode (מסלול 2)
 * מחשב MPE דינמית לפי OIML R76-1:2006 Table 6
 * Returns rows: [{load, mpe, unit, orderNo}]
 */
export async function getOimlTolerancePlan(profileId: string, testType: TestType) {
  const profile = await prisma.metrologicalProfile.findUnique({ 
    where: { id: profileId },
    include: {
      testPoints: {
        where: { testType: testType as any },
        orderBy: { orderNo: "asc" }
      }
    }
  });
  
  if (!profile) throw new Error("Profile not found");
  
  if (profile.toleranceMode !== "OIML_ENGINE") {
    throw new Error("Profile is not OIML_ENGINE mode");
  }
  
  const testPoints = profile.testPoints || [];
  if (!testPoints.length) {
    throw new Error(`No test points for profile=${profileId} testType=${testType}`);
  }
  
  const e = decToNum(profile.e);
  const accuracyClass = profile.accuracyCls as "I" | "II" | "III" | "IIII";
  
  // Logging כדי לוודא שהמנוע נקרא
  if (process.env.NODE_ENV !== "production") {
    console.log(`[OIML Engine] Calculating tolerance plan for profile ${profileId}, testType=${testType}, Class=${accuracyClass}, e=${e}, ${testPoints.length} test points`);
  }
  
  return testPoints.map((tp, index) => {
    const load = decToNum(tp.load);
    const result = calcOimlR76Mpe({
      accuracyClass,
      e,
      load,
      stage: "initial" // initial verification
    });
    
    return {
      load,
      mpe: result.mpeAbs,
      unit: profile.unit,
      orderNo: tp.orderNo || index + 1
    };
  });
}
