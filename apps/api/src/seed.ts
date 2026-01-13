import { prisma } from "./db/prisma.js";

async function main() {
  console.log("🌱 מתחיל יצירת משתמשים...");

  // רק שני משתמשים נדרשים:
  // 1. אדמין: office@weighing.co.il / 1234
  // 2. טכנאי: roy@weighing.co.il / 1234
  const users = [
    { email: "office@weighing.co.il", name: "Admin", role: "ADMIN", password: "1234" },
    { email: "roy@weighing.co.il", name: "Roy", role: "TECHNICIAN", password: "1234" }
  ] as const;

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      await prisma.user.create({ 
        data: { 
          ...u, 
          status: "APPROVED"
        } as any 
      });
      console.log(`✅ נוצר משתמש: ${u.email} (${u.role})`);
    } else {
      // עדכון משתמש קיים - וידוא שהוא מאושר ועם הפרטים הנכונים
      await prisma.user.update({
        where: { email: u.email },
        data: { 
          status: "APPROVED",
          password: u.password,
          name: u.name,
          role: u.role
        } as any,
      });
      console.log(`✅ עודכן משתמש: ${u.email} (${u.role})`);
    }
  }

  // מחיקת משתמשים ישנים שלא נדרשים
  const requiredEmails = users.map(u => u.email);
  const allUsers = await prisma.user.findMany();
  const usersToDelete = allUsers.filter(u => !requiredEmails.includes(u.email));
  
  if (usersToDelete.length > 0) {
    console.log(`\n🗑️  מוחק ${usersToDelete.length} משתמשים ישנים...`);
    for (const user of usersToDelete) {
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`   ✓ נמחק: ${user.email}`);
    }
  }

  console.log("\n✅ Seed הושלם בהצלחה!");
  console.log("\n📋 משתמשים במערכת:");
  const finalUsers = await prisma.user.findMany();
  for (const user of finalUsers) {
    console.log(`   - ${user.email} (${user.role}) - ${user.name}`);
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
