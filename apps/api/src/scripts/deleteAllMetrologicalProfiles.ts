import { prisma } from "../db/prisma.js";

/**
 * סקריפט למחיקת כל הפרופילים המטרולוגיים וכל הנתונים הקשורים אליהם
 * 
 * זהירות: פעולה זו תמחק:
 * - כל שורות הסובלנות (ToleranceRow)
 * - כל נקודות הבדיקה (TestPoint)
 * - כל הקישורים ממודלי משקלות (ScaleModel.defaultProfileId)
 * - כל הקישורים מכיולים (Calibration.profileId)
 * - כל הפרופילים המטרולוגיים (MetrologicalProfile)
 */

async function main() {
  console.log("🗑️  מתחיל מחיקת כל הפרופילים המטרולוגיים...\n");
  
  try {
    // 1. ספירת נתונים לפני מחיקה
    const profilesCount = await prisma.metrologicalProfile.count();
    const toleranceRowsCount = await prisma.toleranceRow.count();
    const testPointsCount = await prisma.testPoint.count();
    const scaleModelsWithProfile = await prisma.scaleModel.count({
      where: { defaultProfileId: { not: null } }
    });
    const calibrationsWithProfile = await prisma.calibration.count({
      where: { profileId: { not: null } }
    });
    
    console.log("📊 נתונים לפני מחיקה:");
    console.log(`   - פרופילים מטרולוגיים: ${profilesCount}`);
    console.log(`   - שורות סובלנות: ${toleranceRowsCount}`);
    console.log(`   - נקודות בדיקה: ${testPointsCount}`);
    console.log(`   - מודלי משקלות עם פרופיל: ${scaleModelsWithProfile}`);
    console.log(`   - כיולים עם פרופיל: ${calibrationsWithProfile}\n`);
    
    // 2. מחיקת שורות סובלנות
    console.log("🗑️  מוחק שורות סובלנות...");
    const deletedToleranceRows = await prisma.toleranceRow.deleteMany({});
    console.log(`   ✅ נמחקו ${deletedToleranceRows.count} שורות סובלנות`);
    
    // 3. מחיקת נקודות בדיקה
    console.log("🗑️  מוחק נקודות בדיקה...");
    const deletedTestPoints = await prisma.testPoint.deleteMany({});
    console.log(`   ✅ נמחקו ${deletedTestPoints.count} נקודות בדיקה`);
    
    // 4. הסרת קישורים ממודלי משקלות
    console.log("🔗 מסיר קישורים ממודלי משקלות...");
    const updatedScaleModels = await prisma.scaleModel.updateMany({
      where: { defaultProfileId: { not: null } },
      data: { defaultProfileId: null }
    });
    console.log(`   ✅ עודכנו ${updatedScaleModels.count} מודלי משקלות`);
    
    // 5. הסרת קישורים מכיולים
    console.log("🔗 מסיר קישורים מכיולים...");
    const updatedCalibrations = await prisma.calibration.updateMany({
      where: { profileId: { not: null } },
      data: { profileId: null }
    });
    console.log(`   ✅ עודכנו ${updatedCalibrations.count} כיולים`);
    
    // 6. מחיקת פרופילים מטרולוגיים
    console.log("🗑️  מוחק פרופילים מטרולוגיים...");
    const deletedProfiles = await prisma.metrologicalProfile.deleteMany({});
    console.log(`   ✅ נמחקו ${deletedProfiles.count} פרופילים מטרולוגיים`);
    
    console.log("\n✅ הושלם בהצלחה! כל הפרופילים המטרולוגיים נמחקו.");
    console.log("\n💡 כעת תוכל ליצור פרופילים חדשים בדרך שלך.");
    
  } catch (error) {
    console.error("❌ שגיאה:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

