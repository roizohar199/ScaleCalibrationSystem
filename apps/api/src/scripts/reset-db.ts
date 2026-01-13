import { execSync } from 'child_process';
import { loadEnv } from '../config/loadEnv.js';
import { prisma } from '../db/prisma.js';

// טוען משתני סביבה
try {
  loadEnv();
} catch (error: any) {
  console.error('❌ שגיאה בטעינת משתני סביבה:', error.message);
  process.exit(1);
}

async function resetDatabase() {
  console.log('🔄 מתחיל איפוס מסד הנתונים...\n');

  try {
    // שלב 1: בדיקה שהמסד רץ
    console.log('📡 בודק חיבור למסד הנתונים...');
    await prisma.$connect();
    console.log('✅ חיבור למסד הנתונים הצליח\n');

    // שלב 2: מחיקת כל הטבלאות והמבנה
    console.log('🗑️  מוחק את כל הטבלאות...');
    
    // מחיקת כל הטבלאות לפי סדר (ללא foreign key constraints)
    const tables = [
      'approvals',
      'certificates',
      'calibrations',
      'document_imports',
      'scales',
      'scale_models',
      'sites',
      'customers',
      'audit_logs',
      'users',
      '_prisma_migrations'
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
        console.log(`   ✓ נמחקה טבלה: ${table}`);
      } catch (error: any) {
        // אם הטבלה לא קיימת, זה בסדר
        if (!error.message.includes('does not exist')) {
          console.warn(`   ⚠️  שגיאה במחיקת ${table}: ${error.message}`);
        }
      }
    }

    console.log('✅ כל הטבלאות נמחקו\n');

    // שלב 3: מחיקת schema אם קיים ויצירת מחדש
    console.log('🔧 מאפס את ה-schema...');
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
      await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);
      await prisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO postgres;`);
      await prisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO public;`);
      console.log('✅ Schema אופס\n');
    } catch (error: any) {
      console.warn(`   ⚠️  שגיאה באיפוס schema: ${error.message}`);
    }

    // שלב 4: סגירת החיבור
    await prisma.$disconnect();
    console.log('📡 חיבור למסד נסגר\n');

    // שלב 5: הרצת migrations מחדש
    console.log('📦 מריץ migrations מחדש...');
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Migrations הורצו בהצלחה\n');
    } catch (error: any) {
      console.error('❌ שגיאה בהרצת migrations:', error.message);
      throw error;
    }

    // שלב 6: יצירת Prisma Client מחדש
    console.log('🔨 יוצר Prisma Client מחדש...');
    try {
      execSync('npx prisma generate', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Prisma Client נוצר מחדש\n');
    } catch (error: any) {
      console.error('❌ שגיאה ביצירת Prisma Client:', error.message);
      throw error;
    }

    // שלב 7: הרצת seed
    console.log('🌱 מריץ seed...');
    try {
      execSync('npm run seed', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Seed הור בהצלחה\n');
    } catch (error: any) {
      console.error('❌ שגיאה בהרצת seed:', error.message);
      throw error;
    }

    // שלב 8: בדיקה שהכל עובד
    console.log('✅ בודק שהכל עובד...');
    await prisma.$connect();
    const userCount = await prisma.user.count();
    console.log(`✅ בדיקה הצליחה - נמצאו ${userCount} משתמשים במסד\n`);

    await prisma.$disconnect();

    console.log('🎉 איפוס מסד הנתונים הושלם בהצלחה!');
    console.log('\n📋 סיכום:');
    console.log('   ✓ כל הטבלאות נמחקו');
    console.log('   ✓ Migrations הורצו מחדש');
    console.log('   ✓ Prisma Client נוצר מחדש');
    console.log('   ✓ Seed הור');
    console.log('   ✓ המסד מוכן לשימוש\n');

  } catch (error: any) {
    console.error('\n❌ שגיאה באיפוס מסד הנתונים:', error.message);
    console.error(error.stack);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

// הרצה
resetDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ שגיאה קריטית:', error);
    process.exit(1);
  });

