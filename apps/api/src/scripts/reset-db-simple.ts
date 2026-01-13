import { execSync } from 'child_process';
import { loadEnv } from '../config/loadEnv.js';

// טוען משתני סביבה
try {
  loadEnv();
} catch (error: any) {
  console.error('❌ שגיאה בטעינת משתני סביבה:', error.message);
  process.exit(1);
}

console.log('🔄 מתחיל איפוס מסד הנתונים...\n');

try {
  // שלב 1: מחיקת המסד והרצת migrations מחדש
  console.log('🗑️  מוחק את המסד ומריץ migrations מחדש...');
  execSync('npx prisma migrate reset --force --skip-seed', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Migrations הורצו בהצלחה\n');

  // שלב 2: יצירת Prisma Client מחדש
  console.log('🔨 יוצר Prisma Client מחדש...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Prisma Client נוצר מחדש\n');

  // שלב 3: הרצת seed
  console.log('🌱 מריץ seed...');
  execSync('npm run seed', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Seed הור בהצלחה\n');

  console.log('🎉 איפוס מסד הנתונים הושלם בהצלחה!');
  console.log('\n📋 סיכום:');
  console.log('   ✓ המסד נמחק');
  console.log('   ✓ Migrations הורצו מחדש');
  console.log('   ✓ Prisma Client נוצר מחדש');
  console.log('   ✓ Seed הור');
  console.log('   ✓ המסד מוכן לשימוש\n');

} catch (error: any) {
  console.error('\n❌ שגיאה באיפוס מסד הנתונים:', error.message);
  console.error(error.stack);
  process.exit(1);
}

