/**
 * סקריפט בדיקה למנוע OIML R76
 * הרץ: npm run test:oiml (או tsx src/scripts/testOimlR76.ts)
 */

import { calcOimlR76Mpe } from "../modules/oiml/r76.js";

console.log("🧪 בדיקת מנוע OIML R76\n");
console.log("=" .repeat(60));

// בדיקות לדוגמה
const testCases = [
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III",
    input: { accuracyClass: "III" as const, e: 0.001, load: 0 },
    expected: { mpeAbs: 0.0005, mpeInE: 0.5 }
  },
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III, load=0.5",
    input: { accuracyClass: "III" as const, e: 0.001, load: 0.5 },
    expected: { mpeAbs: 0.0005, mpeInE: 0.5 }
  },
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III, load=1",
    input: { accuracyClass: "III" as const, e: 0.001, load: 1 },
    expected: { mpeAbs: 0.0005, mpeInE: 0.5 }
  },
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III, load=5",
    input: { accuracyClass: "III" as const, e: 0.001, load: 5 },
    expected: { mpeAbs: 0.0005, mpeInE: 0.5 }
  },
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III, load=10",
    input: { accuracyClass: "III" as const, e: 0.001, load: 10 },
    expected: { mpeAbs: 0.001, mpeInE: 1 }
  },
  {
    name: "משקל 15 ק\"ג, e=0.001, Class III, load=15",
    input: { accuracyClass: "III" as const, e: 0.001, load: 15 },
    expected: { mpeAbs: 0.001, mpeInE: 1 }
  },
  {
    name: "Class III, e=0.1, load=500 (m/e=5000, צריך להיות 1.5e)",
    input: { accuracyClass: "III" as const, e: 0.1, load: 500 },
    expected: { mpeAbs: 0.15, mpeInE: 1.5 }
  },
  {
    name: "Class III, e=0.1, load=2000 (m/e=20000, צריך להיות 1.5e)",
    input: { accuracyClass: "III" as const, e: 0.1, load: 2000 },
    expected: { mpeAbs: 0.15, mpeInE: 1.5 }
  },
  {
    name: "Class III, e=0.1, load=100 (m/e=1000, צריך להיות 1.0e)",
    input: { accuracyClass: "III" as const, e: 0.1, load: 100 },
    expected: { mpeAbs: 0.1, mpeInE: 1.0 }
  },
  {
    name: "In-service: Class III, e=0.001, load=10 (צריך להיות 2x)",
    input: { accuracyClass: "III" as const, e: 0.001, load: 10, stage: "inService" as const },
    expected: { mpeAbs: 0.002, mpeInE: 1 }
  }
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  try {
    const result = calcOimlR76Mpe(testCase.input);
    
    const mpeMatch = Math.abs(result.mpeAbs - testCase.expected.mpeAbs) < 0.0001;
    const mpeInEMatch = result.mpeAbsInE === testCase.expected.mpeInE;
    
    if (mpeMatch && mpeInEMatch) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   MPE: ${result.mpeAbs} (צפוי: ${testCase.expected.mpeAbs}), m/e: ${result.mOverE.toFixed(2)}, MPE in e: ${result.mpeAbsInE}e`);
      passed++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   MPE: ${result.mpeAbs} (צפוי: ${testCase.expected.mpeAbs})`);
      console.log(`   MPE in e: ${result.mpeAbsInE}e (צפוי: ${testCase.expected.mpeInE}e)`);
      failed++;
    }
  } catch (error: any) {
    console.log(`❌ ${testCase.name}`);
    console.log(`   שגיאה: ${error.message}`);
    failed++;
  }
  console.log();
}

console.log("=" .repeat(60));
console.log(`\n📊 סיכום: ${passed} עברו, ${failed} נכשלו`);

if (failed === 0) {
  console.log("✅ כל הבדיקות עברו בהצלחה!");
  process.exit(0);
} else {
  console.log("❌ יש בדיקות שנכשלו");
  process.exit(1);
}




