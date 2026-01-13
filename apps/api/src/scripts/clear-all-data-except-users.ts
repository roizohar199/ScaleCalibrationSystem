import { loadEnv } from '../config/loadEnv.js';
import { prisma } from '../db/prisma.js';

// טוען משתני סביבה
try {
  loadEnv();
} catch (error: any) {
  console.error('❌ שגיאה בטעינת משתני סביבה:', error.message);
  process.exit(1);
}

async function clearAllDataExceptUsers() {
  console.log('🗑️  מתחיל מחיקת כל המידע פרט למשתמשים...\n');

  try {
    // בדיקה שהמסד רץ
    console.log('📡 בודק חיבור למסד הנתונים...');
    await prisma.$connect();
    console.log('✅ חיבור למסד הנתונים הצליח\n');

    // ספירת משתמשים לפני המחיקה
    const usersBefore = await prisma.user.count();
    console.log(`👥 נמצאו ${usersBefore} משתמשים במערכת (יושארו)\n`);

    // מחיקת כל הנתונים בסדר הנכון (ללא Foreign Key errors)
    // הסדר חשוב בגלל Foreign Keys
    
    console.log('🗑️  מוחק נתונים...\n');

    // 1. מחיקת approvals (תלוי ב-calibrations ו-users)
    console.log('   📋 מוחק approvals...');
    const approvalsCount = await prisma.approval.count();
    await prisma.approval.deleteMany({});
    console.log(`      ✓ נמחקו ${approvalsCount} approvals\n`);

    // 2. מחיקת certificates (תלוי ב-calibrations)
    console.log('   🎖️  מוחק certificates...');
    const certificatesCount = await prisma.certificate.count();
    await prisma.certificate.deleteMany({});
    console.log(`      ✓ נמחקו ${certificatesCount} certificates\n`);

    // 3. מחיקת audit_logs (תלוי ב-users)
    console.log('   📝 מוחק audit_logs...');
    const auditLogsCount = await prisma.auditLog.count();
    await prisma.auditLog.deleteMany({});
    console.log(`      ✓ נמחקו ${auditLogsCount} audit_logs\n`);

    // 4. מחיקת calibrations (תלוי ב-scales, sites, customers, users)
    console.log('   🔧 מוחק calibrations...');
    const calibrationsCount = await prisma.calibration.count();
    await prisma.calibration.deleteMany({});
    console.log(`      ✓ נמחקו ${calibrationsCount} calibrations\n`);

    // 5. מחיקת document_imports (תלוי ב-scales)
    console.log('   📄 מוחק document_imports...');
    const documentImportsCount = await prisma.documentImport.count();
    await prisma.documentImport.deleteMany({});
    console.log(`      ✓ נמחקו ${documentImportsCount} document_imports\n`);

    // 6. מחיקת scales (תלוי ב-customers, sites, scale_models)
    console.log('   ⚖️  מוחק scales...');
    const scalesCount = await prisma.scale.count();
    await prisma.scale.deleteMany({});
    console.log(`      ✓ נמחקו ${scalesCount} scales\n`);

    // 7. מחיקת sites (תלוי ב-customers)
    console.log('   🏢 מוחק sites...');
    const sitesCount = await prisma.site.count();
    await prisma.site.deleteMany({});
    console.log(`      ✓ נמחקו ${sitesCount} sites\n`);

    // 8. מחיקת scale_models
    console.log('   📐 מוחק scale_models...');
    const scaleModelsCount = await prisma.scaleModel.count();
    await prisma.scaleModel.deleteMany({});
    console.log(`      ✓ נמחקו ${scaleModelsCount} scale_models\n`);

    // 9. מחיקת customers
    console.log('   👔 מוחק customers...');
    const customersCount = await prisma.customer.count();
    await prisma.customer.deleteMany({});
    console.log(`      ✓ נמחקו ${customersCount} customers\n`);

    // בדיקה שכל הנתונים נמחקו
    console.log('✅ בודק שהכל נמחק...\n');
    
    const counts = {
      approvals: await prisma.approval.count(),
      certificates: await prisma.certificate.count(),
      auditLogs: await prisma.auditLog.count(),
      calibrations: await prisma.calibration.count(),
      documentImports: await prisma.documentImport.count(),
      scales: await prisma.scale.count(),
      sites: await prisma.site.count(),
      scaleModels: await prisma.scaleModel.count(),
      customers: await prisma.customer.count(),
      users: await prisma.user.count()
    };

    console.log('📊 סיכום אחרי המחיקה:');
    console.log(`   approvals: ${counts.approvals}`);
    console.log(`   certificates: ${counts.certificates}`);
    console.log(`   audit_logs: ${counts.auditLogs}`);
    console.log(`   calibrations: ${counts.calibrations}`);
    console.log(`   document_imports: ${counts.documentImports}`);
    console.log(`   scales: ${counts.scales}`);
    console.log(`   sites: ${counts.sites}`);
    console.log(`   scale_models: ${counts.scaleModels}`);
    console.log(`   customers: ${counts.customers}`);
    console.log(`   users: ${counts.users} (נשארו)\n`);

    // בדיקה שכל הנתונים נמחקו (פרט למשתמשים)
    const hasData = 
      counts.approvals > 0 ||
      counts.certificates > 0 ||
      counts.auditLogs > 0 ||
      counts.calibrations > 0 ||
      counts.documentImports > 0 ||
      counts.scales > 0 ||
      counts.sites > 0 ||
      counts.scaleModels > 0 ||
      counts.customers > 0;

    if (hasData) {
      console.warn('⚠️  שים לב: נותרו נתונים בטבלאות מסוימות!');
    } else {
      console.log('✅ כל הנתונים נמחקו בהצלחה (פרט למשתמשים)!\n');
    }

    if (counts.users === usersBefore) {
      console.log(`✅ כל ${counts.users} המשתמשים נשמרו בהצלחה!\n`);
    } else {
      console.warn(`⚠️  שים לב: מספר המשתמשים השתנה מ-${usersBefore} ל-${counts.users}`);
    }

    await prisma.$disconnect();

    console.log('🎉 מחיקת המידע הושלמה בהצלחה!');
    console.log('\n📋 סיכום:');
    console.log('   ✓ כל הנתונים נמחקו');
    console.log('   ✓ כל המשתמשים נשמרו');
    console.log('   ✓ המסד מוכן לשימוש\n');

  } catch (error: any) {
    console.error('\n❌ שגיאה במחיקת המידע:', error.message);
    console.error(error.stack);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

// הרצה
clearAllDataExceptUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ שגיאה קריטית:', error);
    process.exit(1);
  });

