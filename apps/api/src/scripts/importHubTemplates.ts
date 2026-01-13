import fs from "fs";
import path from "path";
import { prisma } from "../db/prisma.js";

type TestType = "ACCURACY" | "ECCENTRICITY" | "REPEATABILITY" | "SENSITIVITY" | "TIME" | "TARE";

type HubRow = { orderNo: number; load: number; mpe: number };

type HubProfile = {
  capacity: number;
  unit: string;          // "kg" | "g" | "mg"
  d: number;
  d_unit?: string;
  e: number;
  e_unit?: string;
  divisionsN?: number | null;
  accuracyCls: string;   // "I" | "II" | "III"
};

type HubEntry = {
  profile: HubProfile;
  sources: string[];
  tests: Partial<Record<TestType, HubRow[]>>;
};

function mustNum(x: any, name: string): number {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${x}`);
  return n;
}

function normalizeUnit(u: string) {
  const s = (u || "").trim().toLowerCase();
  if (s === "kg" || s === "g" || s === "mg") return s;
  // fallback: keep as-is
  return s || "g";
}

async function upsertProfile(p: HubProfile, hubKey: string) {
  const capacity = mustNum(p.capacity, "capacity");
  const d = mustNum(p.d, "d");
  const e = mustNum(p.e, "e");
  const unit = normalizeUnit(p.unit);
  const accuracyCls = (p.accuracyCls || "").trim();

  if (!accuracyCls) throw new Error(`Missing accuracyCls for hubKey=${hubKey}`);

  // find existing by composite fields
  const existing = await prisma.metrologicalProfile.findFirst({
    where: {
      capacity: capacity as any,
      unit,
      d: d as any,
      e: e as any,
      accuracyCls
    }
  });

  if (existing) {
    return prisma.metrologicalProfile.update({
      where: { id: existing.id },
      data: {
        divisionsN: p.divisionsN ?? existing.divisionsN ?? null,
        toleranceMode: "HUB_REFERENCE" as any,
        hubKey
      }
    });
  }

  return prisma.metrologicalProfile.create({
    data: {
      capacity: capacity as any,
      unit,
      d: d as any,
      e: e as any,
      divisionsN: p.divisionsN ?? null,
      accuracyCls,
      toleranceMode: "HUB_REFERENCE" as any,
      hubKey
    }
  });
}

async function replaceReferenceTables(profileId: string, tests: HubEntry["tests"]) {
  // clear current
  await prisma.toleranceRow.deleteMany({ where: { profileId } });
  await prisma.testPoint.deleteMany({ where: { profileId } });

  for (const [testType, rows] of Object.entries(tests)) {
    if (!rows?.length) continue;

    // Tolerance rows
    await prisma.toleranceRow.createMany({
      data: rows.map((r) => ({
        profileId,
        testType: testType as any,
        load: mustNum(r.load, "load") as any,
        mpe: mustNum(r.mpe, "mpe") as any,
        unit: "kg", // will be overridden below after we read profile; kept as placeholder
        orderNo: mustNum(r.orderNo, "orderNo")
      }))
    });

    // Test points: derived from loads (same order)
    await prisma.testPoint.createMany({
      data: rows.map((r) => ({
        profileId,
        testType: testType as any,
        load: mustNum(r.load, "load") as any,
        orderNo: mustNum(r.orderNo, "orderNo")
      }))
    });
  }
}

async function fixUnits(profileId: string, unit: string) {
  await prisma.toleranceRow.updateMany({
    where: { profileId },
    data: { unit }
  });
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--file="));
  const filePath = arg ? arg.split("=", 2)[1] : "";
  if (!filePath) {
    throw new Error('Usage: npm run import:hub -- --file=./hub_templates.json');
  }

  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf-8");
  const data = JSON.parse(raw) as Record<string, HubEntry>;

  let profilesCreatedOrUpdated = 0;
  let toleranceRowsInserted = 0;

  for (const [hubKey, entry] of Object.entries(data)) {
    const profile = await upsertProfile(entry.profile, hubKey);
    profilesCreatedOrUpdated++;

    await replaceReferenceTables(profile.id, entry.tests);

    // count rows
    for (const rows of Object.values(entry.tests)) {
      toleranceRowsInserted += (rows?.length || 0);
    }

    await fixUnits(profile.id, normalizeUnit(entry.profile.unit));
  }

  console.log("HUB import complete");
  console.log({ profilesCreatedOrUpdated, toleranceRowsInserted });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

