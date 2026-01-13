import { prisma } from "../db/prisma.js";

/**
 * סקריפט למחיקת כל דגמי המשקלות (ScaleModels) מהמערכת
 * 
 * זהירות: פעולה זו תמחק:
 * - כל הקישורים ממודלי משקלות לפרופילים (defaultProfileId)
 * - כל הקישורים ממשקלות למודלים (modelId)
 * - כל דגמי המשקלות (ScaleModel)
 */

async function main() {
  console.log("🗑️  מתחיל מחיקת כל דגמי המשקלות...\n");
  
  try {
    // 1. ספירת נתונים לפני מחיקה
    const scaleModelsCount = await prisma.scaleModel.count();
    const scalesWithModel = await prisma.scale.count({
      where: { modelId: { not: null } }
    });
    const modelsWithProfile = await prisma.scaleModel.count({
      where: { defaultProfileId: { not: null } }
    });
    
    console.log("📊 נתונים לפני מחיקה:");
    console.log(`   - דגמי משקלות: ${scaleModelsCount}`);
    console.log(`   - משקלות עם מודל: ${scalesWithModel}`);
    console.log(`   - מודלים עם פרופיל: ${modelsWithProfile}\n`);
    
    // 2. הסרת קישורים ממשקלות למודלים
    console.log("🔗 מסיר קישורים ממשקלות למודלים...");
    const updatedScales = await prisma.scale.updateMany({
      where: { modelId: { not: null } },
      data: { modelId: null }
    });
    console.log(`   ✅ עודכנו ${updatedScales.count} משקלות`);
    
    // 3. הסרת קישורים ממודלים לפרופילים
    console.log("🔗 מסיר קישורים ממודלים לפרופילים...");
    const updatedModels = await prisma.scaleModel.updateMany({
      where: { defaultProfileId: { not: null } },
      data: { defaultProfileId: null }
    });
    console.log(`   ✅ עודכנו ${updatedModels.count} מודלים`);
    
    // 4. מחיקת כל דגמי המשקלות
    console.log("🗑️  מוחק דגמי משקלות...");
    const deletedModels = await prisma.scaleModel.deleteMany({});
    console.log(`   ✅ נמחקו ${deletedModels.count} דגמי משקלות`);
    
    console.log("\n✅ הושלם בהצלחה! כל דגמי המשקלות נמחקו.");
    
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

