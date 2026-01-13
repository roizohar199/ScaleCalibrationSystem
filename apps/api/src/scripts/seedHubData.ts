import { prisma } from "../db/prisma.js";

/**
 * Seed script that fills HUB reference data automatically
 * This creates sample profiles with tolerance rows
 */
async function main() {
  console.log("🌱 Starting HUB data seed...");

  // Sample profile 1: 1000kg, d=0.1, e=0.1, Class III
  const profile1 = await prisma.metrologicalProfile.upsert({
    where: {
      id: "seed-profile-1"
    },
    update: {},
    create: {
      id: "seed-profile-1",
      capacity: 1000,
      unit: "kg",
      d: 0.1,
      e: 0.1,
      divisionsN: 10000,
      accuracyCls: "III",
      toleranceMode: "HUB_REFERENCE",
      hubKey: "1000kg_0.1g_ClassIII"
    }
  });

  // Clear existing tolerance rows for this profile
  await prisma.toleranceRow.deleteMany({ where: { profileId: profile1.id } });
  await prisma.testPoint.deleteMany({ where: { profileId: profile1.id } });

  // ACCURACY test points
  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile1.id, testType: "ACCURACY", load: 0, mpe: 0.1, unit: "kg", orderNo: 1 },
      { profileId: profile1.id, testType: "ACCURACY", load: 10, mpe: 0.1, unit: "kg", orderNo: 2 },
      { profileId: profile1.id, testType: "ACCURACY", load: 20, mpe: 0.1, unit: "kg", orderNo: 3 },
      { profileId: profile1.id, testType: "ACCURACY", load: 50, mpe: 0.2, unit: "kg", orderNo: 4 },
      { profileId: profile1.id, testType: "ACCURACY", load: 100, mpe: 0.2, unit: "kg", orderNo: 5 },
      { profileId: profile1.id, testType: "ACCURACY", load: 200, mpe: 0.3, unit: "kg", orderNo: 6 },
      { profileId: profile1.id, testType: "ACCURACY", load: 500, mpe: 0.5, unit: "kg", orderNo: 7 },
      { profileId: profile1.id, testType: "ACCURACY", load: 1000, mpe: 1.0, unit: "kg", orderNo: 8 }
    ]
  });

  // ECCENTRICITY test points
  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile1.id, testType: "ECCENTRICITY", load: 50, mpe: 0.2, unit: "kg", orderNo: 1 },
      { profileId: profile1.id, testType: "ECCENTRICITY", load: 100, mpe: 0.3, unit: "kg", orderNo: 2 },
      { profileId: profile1.id, testType: "ECCENTRICITY", load: 500, mpe: 0.5, unit: "kg", orderNo: 3 },
      { profileId: profile1.id, testType: "ECCENTRICITY", load: 1000, mpe: 1.0, unit: "kg", orderNo: 4 }
    ]
  });

  // REPEATABILITY test points
  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile1.id, testType: "REPEATABILITY", load: 100, mpe: 0.1, unit: "kg", orderNo: 1 },
      { profileId: profile1.id, testType: "REPEATABILITY", load: 500, mpe: 0.2, unit: "kg", orderNo: 2 },
      { profileId: profile1.id, testType: "REPEATABILITY", load: 1000, mpe: 0.3, unit: "kg", orderNo: 3 }
    ]
  });

  // Sample profile 2: 30kg, d=0.5g, e=0.5g, Class III
  const profile2 = await prisma.metrologicalProfile.upsert({
    where: {
      id: "seed-profile-2"
    },
    update: {},
    create: {
      id: "seed-profile-2",
      capacity: 30,
      unit: "kg",
      d: 0.5,
      e: 0.5,
      divisionsN: 60000,
      accuracyCls: "III",
      toleranceMode: "HUB_REFERENCE",
      hubKey: "30kg_0.5g_ClassIII"
    }
  });

  await prisma.toleranceRow.deleteMany({ where: { profileId: profile2.id } });
  await prisma.testPoint.deleteMany({ where: { profileId: profile2.id } });

  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile2.id, testType: "ACCURACY", load: 0, mpe: 0.5, unit: "kg", orderNo: 1 },
      { profileId: profile2.id, testType: "ACCURACY", load: 1, mpe: 0.5, unit: "kg", orderNo: 2 },
      { profileId: profile2.id, testType: "ACCURACY", load: 5, mpe: 0.5, unit: "kg", orderNo: 3 },
      { profileId: profile2.id, testType: "ACCURACY", load: 10, mpe: 0.5, unit: "kg", orderNo: 4 },
      { profileId: profile2.id, testType: "ACCURACY", load: 15, mpe: 0.5, unit: "kg", orderNo: 5 },
      { profileId: profile2.id, testType: "ACCURACY", load: 20, mpe: 0.5, unit: "kg", orderNo: 6 },
      { profileId: profile2.id, testType: "ACCURACY", load: 30, mpe: 1.0, unit: "kg", orderNo: 7 }
    ]
  });

  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile2.id, testType: "ECCENTRICITY", load: 10, mpe: 0.5, unit: "kg", orderNo: 1 },
      { profileId: profile2.id, testType: "ECCENTRICITY", load: 20, mpe: 0.5, unit: "kg", orderNo: 2 },
      { profileId: profile2.id, testType: "ECCENTRICITY", load: 30, mpe: 1.0, unit: "kg", orderNo: 3 }
    ]
  });

  // Sample profile 3: 6kg, d=0.1g, e=0.1g, Class III
  const profile3 = await prisma.metrologicalProfile.upsert({
    where: {
      id: "seed-profile-3"
    },
    update: {},
    create: {
      id: "seed-profile-3",
      capacity: 6,
      unit: "kg",
      d: 0.1,
      e: 0.1,
      divisionsN: 60000,
      accuracyCls: "III",
      toleranceMode: "HUB_REFERENCE",
      hubKey: "6kg_0.1g_ClassIII"
    }
  });

  await prisma.toleranceRow.deleteMany({ where: { profileId: profile3.id } });
  await prisma.testPoint.deleteMany({ where: { profileId: profile3.id } });

  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile3.id, testType: "ACCURACY", load: 0, mpe: 0.1, unit: "kg", orderNo: 1 },
      { profileId: profile3.id, testType: "ACCURACY", load: 0.5, mpe: 0.1, unit: "kg", orderNo: 2 },
      { profileId: profile3.id, testType: "ACCURACY", load: 1, mpe: 0.1, unit: "kg", orderNo: 3 },
      { profileId: profile3.id, testType: "ACCURACY", load: 2, mpe: 0.1, unit: "kg", orderNo: 4 },
      { profileId: profile3.id, testType: "ACCURACY", load: 3, mpe: 0.1, unit: "kg", orderNo: 5 },
      { profileId: profile3.id, testType: "ACCURACY", load: 4, mpe: 0.1, unit: "kg", orderNo: 6 },
      { profileId: profile3.id, testType: "ACCURACY", load: 5, mpe: 0.1, unit: "kg", orderNo: 7 },
      { profileId: profile3.id, testType: "ACCURACY", load: 6, mpe: 0.2, unit: "kg", orderNo: 8 }
    ]
  });

  await prisma.toleranceRow.createMany({
    data: [
      { profileId: profile3.id, testType: "ECCENTRICITY", load: 2, mpe: 0.1, unit: "kg", orderNo: 1 },
      { profileId: profile3.id, testType: "ECCENTRICITY", load: 4, mpe: 0.1, unit: "kg", orderNo: 2 },
      { profileId: profile3.id, testType: "ECCENTRICITY", load: 6, mpe: 0.2, unit: "kg", orderNo: 3 }
    ]
  });

  console.log("✅ HUB data seed completed!");
  console.log(`📊 Created 3 profiles with tolerance rows`);
  console.log(`   - Profile 1: 1000kg, d=0.1g, e=0.1g, Class III`);
  console.log(`   - Profile 2: 30kg, d=0.5g, e=0.5g, Class III`);
  console.log(`   - Profile 3: 6kg, d=0.1g, e=0.1g, Class III`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

