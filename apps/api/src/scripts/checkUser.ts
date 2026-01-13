import { prisma } from "../db/prisma.js";

async function main() {
  const email = "roy@weighing.co.il";
  
  const user = await prisma.user.findUnique({
    where: { email }
  });
  
  if (user) {
    console.log("✅ משתמש נמצא:");
    console.log({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      password: user.password
    });
  } else {
    console.log("❌ משתמש לא נמצא!");
  }
  
  // רשימת כל המשתמשים
  const allUsers = await prisma.user.findMany();
  console.log("\n📋 כל המשתמשים במערכת:");
  allUsers.forEach(u => {
    console.log(`- ${u.email} (${u.role}, ${u.status})`);
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});

