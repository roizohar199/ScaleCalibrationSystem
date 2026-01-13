import { prisma } from "../../db/prisma.js";

export async function seedOimlEngine(profileId: string) {
  await prisma.metrologicalProfile.update({
    where: { id: profileId },
    data: {
      toleranceMode: "OIML_ENGINE" as any,
      // IMPORTANT: These numbers are a CONFIGURATION you approve in office.
      // You will set them to match your accreditation interpretation.
      oimlRuleJson: {
        thresholds: [
          { upToLoad: 500, multiplier: 1 },
          { upToLoad: 2000, multiplier: 2 },
          { upToLoad: 999999999, multiplier: 3 }
        ]
      }
    }
  });

  await prisma.testPoint.deleteMany({ where: { profileId } });

  const points = [
    { orderNo: 1, load: 0 },
    { orderNo: 2, load: 10 },
    { orderNo: 3, load: 20 },
    { orderNo: 4, load: 50 },
    { orderNo: 5, load: 100 }
  ];

  await prisma.testPoint.createMany({
    data: points.map(p => ({
      profileId,
      testType: "ACCURACY" as any,
      load: p.load as any,
      orderNo: p.orderNo
    }))
  });
}

