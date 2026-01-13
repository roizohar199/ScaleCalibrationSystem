import { prisma } from "../../db/prisma.js";

/**
 * Example: ACCURACY points + mpe for a profile.
 * Replace with actual points from your HUB template.
 */
export async function seedHubReference(profileId: string) {
  await prisma.metrologicalProfile.update({
    where: { id: profileId },
    data: { toleranceMode: "HUB_REFERENCE" as any }
  });

  await prisma.toleranceRow.deleteMany({ where: { profileId } });

  const rows = [
    { orderNo: 1, load: 0, mpe: 0.1 },
    { orderNo: 2, load: 10, mpe: 0.1 },
    { orderNo: 3, load: 20, mpe: 0.1 },
    { orderNo: 4, load: 50, mpe: 0.2 }
  ];

  await prisma.toleranceRow.createMany({
    data: rows.map(r => ({
      profileId,
      testType: "ACCURACY" as any,
      load: r.load as any,
      mpe: r.mpe as any,
      unit: "kg",
      orderNo: r.orderNo
    }))
  });
}

