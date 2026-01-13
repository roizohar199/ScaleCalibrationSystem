// Script to verify all Class calculations in the system
import { calculateAccuracyClass, calculateN } from "../modules/oiml/accuracyClass.js";

interface TestCase {
  capacity: number;
  e: number;
  unit: string;
  expectedClass: string;
  description: string;
}

const testCases: TestCase[] = [
  // מהמסמך המקורי
  { capacity: 15, e: 0.01, unit: "kg", expectedClass: "III", description: "מסמך מקורי: 15kg, e=0.01kg" },
  { capacity: 15, e: 0.001, unit: "kg", expectedClass: "II", description: "15kg, e=0.001kg (1g)" },
  
  // מ-seedMetrologicalData.ts (לאחר תיקון)
  { capacity: 150, e: 0.05, unit: "kg", expectedClass: "III", description: "Mettler Toledo IND780: 150kg, e=0.05kg" },
  { capacity: 300, e: 0.1, unit: "kg", expectedClass: "III", description: "Mettler Toledo IND780: 300kg, e=0.1kg" },
  { capacity: 220, e: 0.1, unit: "g", expectedClass: "III", description: "Sartorius Entris II: 220g, e=0.1g (תוקן מ-II ל-III)" },
  { capacity: 420, e: 0.01, unit: "g", expectedClass: "II", description: "Sartorius Entris II: 420g, e=0.01g (תוקן מ-I ל-II)" },
  { capacity: 15000, e: 0.5, unit: "g", expectedClass: "II", description: "Sartorius Entris II: 15000g, e=0.5g" },
  { capacity: 60000, e: 5, unit: "g", expectedClass: "II", description: "Sartorius Entris II: 60000g, e=5g (תוקן מ-III ל-II)" },
  { capacity: 220, e: 0.1, unit: "g", expectedClass: "III", description: "Ohaus Adventurer: 220g, e=0.1g (תוקן מ-II ל-III)" },
  { capacity: 15000, e: 0.5, unit: "g", expectedClass: "II", description: "Ohaus Adventurer: 15000g, e=0.5g" },
  { capacity: 60000, e: 5, unit: "g", expectedClass: "II", description: "Ohaus Adventurer: 60000g, e=5g (תוקן מ-III ל-II)" },
  { capacity: 0.22, e: 0.0001, unit: "g", expectedClass: "III", description: "Mettler Toledo XP/XS: 0.22g, e=0.0001g (תוקן מ-I ל-III)" },
  { capacity: 2.2, e: 0.001, unit: "g", expectedClass: "III", description: "Mettler Toledo XP/XS: 2.2g, e=0.001g (תוקן מ-I ל-III)" },
  { capacity: 15, e: 0.001, unit: "kg", expectedClass: "II", description: "Tanita KD: 15kg, e=0.001kg (תוקן מ-III ל-II)" },
  { capacity: 15, e: 0.005, unit: "kg", expectedClass: "III", description: "Tanita KD: 15kg, e=0.005kg" },
  { capacity: 30, e: 0.01, unit: "kg", expectedClass: "III", description: "Tanita KD: 30kg, e=0.01kg" },
  { capacity: 15, e: 0.05, unit: "kg", expectedClass: "IIII", description: "Mettler Toledo IND780: 15kg, e=0.05kg (Class IIII)" },
  { capacity: 5000, e: 5, unit: "kg", expectedClass: "III", description: "Mettler Toledo IND780: 5000kg, e=5kg" },
  { capacity: 20000, e: 20, unit: "kg", expectedClass: "III", description: "Mettler Toledo IND780: 20000kg, e=20kg (תוקן מ-IIII ל-III)" },
];

console.log("🔍 בודק חישובי Class לפי OIML R76...\n");

let passed = 0;
let failed = 0;
const failures: Array<{ test: TestCase; calculated: string | null; n: number }> = [];

for (const test of testCases) {
  try {
    const n = calculateN(test.capacity, test.e, test.unit);
    const calculated = calculateAccuracyClass(test.capacity, test.e, test.unit);
    
    if (calculated === test.expectedClass) {
      console.log(`✅ ${test.description}`);
      console.log(`   n = ${n.toFixed(2)}, Class = ${calculated}\n`);
      passed++;
    } else {
      console.log(`❌ ${test.description}`);
      console.log(`   n = ${n.toFixed(2)}, Expected: ${test.expectedClass}, Got: ${calculated}\n`);
      failed++;
      failures.push({ test, calculated: calculated || "null", n });
    }
  } catch (error: any) {
    console.log(`❌ ${test.description}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
    failures.push({ test, calculated: "ERROR", n: 0 });
  }
}

console.log("\n" + "=".repeat(60));
console.log(`📊 סיכום: ${passed} עברו, ${failed} נכשלו`);

if (failures.length > 0) {
  console.log("\n❌ כשלונות:");
  for (const failure of failures) {
    console.log(`\n${failure.test.description}`);
    console.log(`   n = ${failure.n.toFixed(2)}`);
    console.log(`   Expected: ${failure.test.expectedClass}, Got: ${failure.calculated}`);
    console.log(`   According to OIML R76:`);
    if (failure.n >= 50000) {
      console.log(`     n >= 50,000 → Class I`);
    } else if (failure.n >= 5000) {
      console.log(`     n >= 5,000 && n < 50,000 → Class II`);
    } else if (failure.n >= 500) {
      console.log(`     n >= 500 && n < 5,000 → Class III`);
    } else {
      console.log(`     n < 500 → Class IIII`);
    }
  }
}

process.exit(failed > 0 ? 1 : 0);

