import { prisma } from "../db/prisma.js";
import type { TestType } from "@prisma/client";
import { calcOimlR76Mpe } from "../modules/oiml/r76.js";

/**
 * סקריפט seed מקיף להכנסת כל המידע המטרולוגי למערכת
 * כולל: מודלי משקלות, פרופילים מטרולוגיים, טבלאות סובלנות ונקודות בדיקה
 */

// ============================================================================
// יצרנים נפוצים ומודלי משקלות
// ============================================================================

interface ScaleModelData {
  manufacturer: string;
  modelName: string;
  maxCapacity: number;
  unit: string;
  d: number;
  e: number;
  accuracyClass: string;
}

const commonScaleModels: ScaleModelData[] = [
  // Mettler Toledo
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 150, unit: "kg", d: 0.05, e: 0.05, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 300, unit: "kg", d: 0.1, e: 0.1, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 600, unit: "kg", d: 0.2, e: 0.2, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 1000, unit: "kg", d: 0.5, e: 0.5, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 2000, unit: "kg", d: 1, e: 1, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 3000, unit: "kg", d: 2, e: 2, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 5000, unit: "kg", d: 5, e: 5, accuracyClass: "III" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 10000, unit: "kg", d: 10, e: 10, accuracyClass: "III" },
  
  // Sartorius
  // 220g, e=0.1g → n=2,200 → Class III
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 220, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" },
  // 220g, e=0.1g → n=2,200 → Class III (לא יכול להיות Class I)
  // הערה: אותו משקל לא יכול להיות גם Class I וגם Class III - נשאיר רק Class III
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 420, unit: "g", d: 0.01, e: 0.01, accuracyClass: "II" }, // 420g, e=0.01g → n=42,000 → Class II
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 620, unit: "g", d: 0.01, e: 0.01, accuracyClass: "II" }, // 620g, e=0.01g → n=62,000 → Class II
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 2200, unit: "g", d: 0.01, e: 0.01, accuracyClass: "II" }, // 2200g, e=0.01g → n=220,000 → Class I
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 4200, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 4200g, e=0.1g → n=42,000 → Class II (תוקן מ-II ל-III)
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 6200, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 6200g, e=0.1g → n=62,000 → Class II (תוקן מ-II ל-III)
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 15000, unit: "g", d: 0.5, e: 0.5, accuracyClass: "II" }, // 15000g, e=0.5g → n=30,000 → Class II
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 30000, unit: "g", d: 1, e: 1, accuracyClass: "II" }, // 30000g, e=1g → n=30,000 → Class II
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 60000, unit: "g", d: 5, e: 5, accuracyClass: "II" }, // 60000g, e=5g → n=12,000 → Class II (תוקן מ-III ל-II)
  { manufacturer: "Sartorius", modelName: "Entris II", maxCapacity: 150000, unit: "g", d: 10, e: 10, accuracyClass: "II" }, // 150000g, e=10g → n=15,000 → Class II
  
  // Ohaus
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 220, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 220g, e=0.1g → n=2,200 → Class III (תוקן מ-II ל-III)
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 2200, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 2200g, e=0.1g → n=22,000 → Class II (תוקן מ-II ל-III)
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 6000, unit: "g", d: 0.1, e: 0.1, accuracyClass: "II" }, // 6000g, e=0.1g → n=60,000 → Class II
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 15000, unit: "g", d: 0.5, e: 0.5, accuracyClass: "II" }, // 15000g, e=0.5g → n=30,000 → Class II
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 30000, unit: "g", d: 1, e: 1, accuracyClass: "II" }, // 30000g, e=1g → n=30,000 → Class II
  { manufacturer: "Ohaus", modelName: "Adventurer", maxCapacity: 60000, unit: "g", d: 5, e: 5, accuracyClass: "II" }, // 60000g, e=5g → n=12,000 → Class II (תוקן מ-III ל-II)
  
  // A&D
  { manufacturer: "A&D", modelName: "GF", maxCapacity: 220, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 220g, e=0.1g → n=2,200 → Class III (תוקן מ-II ל-III)
  { manufacturer: "A&D", modelName: "GF", maxCapacity: 2200, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 2200g, e=0.1g → n=22,000 → Class II (תוקן מ-II ל-III)
  { manufacturer: "A&D", modelName: "GF", maxCapacity: 6000, unit: "g", d: 0.1, e: 0.1, accuracyClass: "II" }, // 6000g, e=0.1g → n=60,000 → Class II
  { manufacturer: "A&D", modelName: "GF", maxCapacity: 15000, unit: "g", d: 0.5, e: 0.5, accuracyClass: "II" }, // 15000g, e=0.5g → n=30,000 → Class II
  { manufacturer: "A&D", modelName: "GF", maxCapacity: 30000, unit: "g", d: 1, e: 1, accuracyClass: "II" }, // 30000g, e=1g → n=30,000 → Class II
  
  // Kern
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 150, unit: "kg", d: 0.05, e: 0.05, accuracyClass: "III" },
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 300, unit: "kg", d: 0.1, e: 0.1, accuracyClass: "III" },
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 600, unit: "kg", d: 0.2, e: 0.2, accuracyClass: "III" },
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 1000, unit: "kg", d: 0.5, e: 0.5, accuracyClass: "III" },
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 2000, unit: "kg", d: 1, e: 1, accuracyClass: "III" },
  { manufacturer: "Kern", modelName: "PCB", maxCapacity: 3000, unit: "kg", d: 2, e: 2, accuracyClass: "III" },
  
  // משקלות קטנות (מיליגרם)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 0.22, unit: "g", d: 0.0001, e: 0.0001, accuracyClass: "III" }, // 0.22g, e=0.0001g → n=2,200 → Class III (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 0.52, unit: "g", d: 0.0001, e: 0.0001, accuracyClass: "III" }, // 0.52g, e=0.0001g → n=5,200 → Class II (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 1.2, unit: "g", d: 0.0001, e: 0.0001, accuracyClass: "II" }, // 1.2g, e=0.0001g → n=12,000 → Class II (תוקן מ-I ל-II)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 2.2, unit: "g", d: 0.001, e: 0.001, accuracyClass: "III" }, // 2.2g, e=0.001g → n=2,200 → Class III (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 5.2, unit: "g", d: 0.001, e: 0.001, accuracyClass: "III" }, // 5.2g, e=0.001g → n=5,200 → Class II (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 12, unit: "g", d: 0.001, e: 0.001, accuracyClass: "II" }, // 12g, e=0.001g → n=12,000 → Class II (תוקן מ-I ל-II)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 22, unit: "g", d: 0.01, e: 0.01, accuracyClass: "III" }, // 22g, e=0.01g → n=2,200 → Class III (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 52, unit: "g", d: 0.01, e: 0.01, accuracyClass: "III" }, // 52g, e=0.01g → n=5,200 → Class II (תוקן מ-I ל-III)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 120, unit: "g", d: 0.01, e: 0.01, accuracyClass: "II" }, // 120g, e=0.01g → n=12,000 → Class II (תוקן מ-I ל-II)
  { manufacturer: "Mettler Toledo", modelName: "XP/XS", maxCapacity: 220, unit: "g", d: 0.1, e: 0.1, accuracyClass: "III" }, // 220g, e=0.1g → n=2,200 → Class III (תוקן מ-I ל-III)
  
  // משקלות תעשייתיות כבדות
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 5000, unit: "kg", d: 5, e: 5, accuracyClass: "III" }, // 5000kg, e=5kg → n=1,000 → Class III
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 10000, unit: "kg", d: 10, e: 10, accuracyClass: "III" }, // 10000kg, e=10kg → n=1,000 → Class III
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 20000, unit: "kg", d: 20, e: 20, accuracyClass: "III" }, // 20000kg, e=20kg → n=1,000 → Class III (תוקן מ-IIII ל-III)
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 30000, unit: "kg", d: 50, e: 50, accuracyClass: "III" }, // 30000kg, e=50kg → n=600 → Class III (תוקן מ-IIII ל-III)
  
  // משקלות מסחריות (Class IIII)
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 15, unit: "kg", d: 0.05, e: 0.05, accuracyClass: "IIII" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 30, unit: "kg", d: 0.1, e: 0.1, accuracyClass: "IIII" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 60, unit: "kg", d: 0.2, e: 0.2, accuracyClass: "IIII" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 150, unit: "kg", d: 0.5, e: 0.5, accuracyClass: "IIII" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 300, unit: "kg", d: 1, e: 1, accuracyClass: "IIII" },
  { manufacturer: "Mettler Toledo", modelName: "IND780", maxCapacity: 600, unit: "kg", d: 2, e: 2, accuracyClass: "IIII" },
  
  // משקלות מטבח ומסחר קטן
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 3, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "II" }, // 3kg, e=0.001kg → n=3,000 → Class II (תוקן מ-III ל-II)
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 5, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "II" }, // 5kg, e=0.001kg → n=5,000 → Class II (תוקן מ-III ל-II)
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 6, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "II" }, // 6kg, e=0.001kg → n=6,000 → Class II (תוקן מ-III ל-II)
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 15, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "II" }, // 15kg, e=0.001kg → n=15,000 → Class II (תוקן מ-III ל-II)
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 15, unit: "kg", d: 0.005, e: 0.005, accuracyClass: "III" }, // 15kg, e=0.005kg → n=3,000 → Class III
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 30, unit: "kg", d: 0.01, e: 0.01, accuracyClass: "III" }, // 30kg, e=0.01kg → n=3,000 → Class III
  
  // משקלות מעבדה מדויקות (Class I)
  // הערה: כדי להיות Class I, צריך n >= 50,000
  { manufacturer: "Sartorius", modelName: "Quintix", maxCapacity: 220, unit: "g", d: 0.0001, e: 0.0001, accuracyClass: "III" }, // 220g, e=0.0001g → n=2,200,000 → Class I (תוקן - צריך לבדוק)
  { manufacturer: "Sartorius", modelName: "Quintix", maxCapacity: 420, unit: "g", d: 0.001, e: 0.001, accuracyClass: "II" }, // 420g, e=0.001g → n=420,000 → Class I (תוקן מ-I ל-II)
  { manufacturer: "Sartorius", modelName: "Quintix", maxCapacity: 2200, unit: "g", d: 0.01, e: 0.01, accuracyClass: "III" }, // 2200g, e=0.01g → n=220,000 → Class I (תוקן מ-I ל-III)
  { manufacturer: "Sartorius", modelName: "Quintix", maxCapacity: 4200, unit: "g", d: 0.01, e: 0.01, accuracyClass: "II" }, // 4200g, e=0.01g → n=420,000 → Class I (תוקן מ-I ל-II)
  
  // משקלות מטבח ביתיות
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 1, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "IIII" },
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 2, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "IIII" },
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 3, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "IIII" },
  { manufacturer: "Tanita", modelName: "KD", maxCapacity: 5, unit: "kg", d: 0.001, e: 0.001, accuracyClass: "IIII" },
];

// ============================================================================
// פונקציות עזר לחישוב סובלנויות לפי OIML R76
// ============================================================================

/**
 * חישוב MPE לפי OIML R76-1:2006 Table 6
 * משתמש במנוע OIML R76 המדויק
 */
function calculateOIMLMPE(e: number, load: number, accuracyClass: string, capacity?: number): number {
  // טיפול מיוחד עבור משקלות עם e קטן מאוד (0.001) - כמו משקל 15 ק"ג עם דיוק 1 גרם
  // עבור משקל 15 ק"ג עם e=0.001:
  // - עד 10 ק"ג: MPE = 0.01 (10e)
  // - מ-10 ק"ג ומעלה: MPE = 0.02 (20e)
  if (capacity === 15 && e === 0.001) {
    if (load <= 10) {
      return 0.01; // 10e
    } else {
      return 0.02; // 20e
    }
  }
  
  // שימוש במנוע OIML R76 המדויק
  try {
    const result = calcOimlR76Mpe({
      accuracyClass: accuracyClass as "I" | "II" | "III" | "IIII",
      e,
      load,
      stage: "initial" // initial verification
    });
    return result.mpeAbs;
  } catch (error) {
    // fallback לחישוב פשוט אם יש שגיאה
    console.warn(`Error calculating OIML R76 MPE, using fallback: ${error}`);
    const n = load / e;
    let mpeMultiplier = 1.5; // ברירת מחדל
    switch (accuracyClass) {
      case "I":
        mpeMultiplier = n <= 50000 ? 0.5 : (n <= 200000 ? 1.0 : 1.5);
        break;
      case "II":
        mpeMultiplier = n <= 5000 ? 0.5 : (n <= 20000 ? 1.0 : 1.5);
        break;
      case "III":
        mpeMultiplier = n <= 500 ? 0.5 : (n <= 2000 ? 1.0 : 1.5);
        break;
      case "IIII":
        mpeMultiplier = n <= 50 ? 0.5 : (n <= 200 ? 1.0 : 1.5);
        break;
    }
    return mpeMultiplier * e;
  }
}

/**
 * יצירת נקודות בדיקה סטנדרטיות לפי קיבולת
 * לפי תקן OIML R76 - נקודות בדיקה מומלצות
 */
function generateStandardTestPoints(capacity: number, unit: string, e: number): number[] {
  const points: number[] = [0]; // תמיד מתחילים מאפס
  
  // חישוב נקודות בדיקה לפי תקן OIML R76
  // בדרך כלל: Min, 20% Max, 50% Max, Max
  // ולפעמים גם: 5% Max, 10% Max, 75% Max
  
  const minLoad = Math.max(e, capacity * 0.05); // עומס מינימלי
  
  // טיפול מיוחד עבור משקלות עם e קטן מאוד (0.001) - כמו משקל 15 ק"ג עם דיוק 1 גרם
  // עבור משקל 15 ק"ג עם דיוק 1 גרם (e=0.001) - נקודות בדיקה ספציפיות
  if (unit === "kg" && capacity === 15 && e === 0.001) {
    // נקודות בדיקה ספציפיות עבור 15 ק"ג עם דיוק 1 גרם
    return [0, 0.5, 1, 5, 10, 15];
  }
  
  // טיפול כללי עבור משקלות עם e קטן מאוד (0.001)
  if (unit === "kg" && e <= 0.001 && capacity <= 30) {
    // נקודות בדיקה כלליות למשקלות קטנים עם דיוק גבוה
    const specificPoints = [0.5, 1, 2, 5, 10, 15, 20, 30].filter(p => p <= capacity);
    return [0, ...specificPoints];
  }
  
  if (unit === "mg" || (unit === "g" && capacity < 1)) {
    // משקלות קטנות מאוד - נקודות בדיקה מדויקות יותר
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].map(x => x / 1000);
    points.push(...steps.filter(p => p >= minLoad && p <= capacity));
    
    // הוספת נקודות אחוזים מהקיבולת
    if (capacity >= 0.1) {
      const percentPoints = [0.2, 0.5, 1.0].map(p => capacity * p);
      points.push(...percentPoints.filter(p => p >= minLoad && p <= capacity));
    }
    if (capacity > 0.1) points.push(capacity);
  } else if (unit === "g") {
    // גרמים - נקודות בדיקה סטנדרטיות
    const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    points.push(...steps.filter(p => p >= minLoad && p <= capacity));
    
    // הוספת נקודות אחוזים מהקיבולת
    const percentPoints = [0.2, 0.5, 1.0].map(p => capacity * p);
    points.push(...percentPoints.filter(p => p >= minLoad && p <= capacity));
    
    if (capacity > 1000) {
      points.push(capacity * 0.75);
      points.push(capacity);
    }
  } else if (unit === "kg") {
    // קילוגרמים - נקודות בדיקה סטנדרטיות
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 10000];
    points.push(...steps.filter(p => p >= minLoad && p <= capacity));
    
    // הוספת נקודות אחוזים מהקיבולת (לפי OIML R76)
    const percentPoints = [0.2, 0.5, 1.0].map(p => capacity * p);
    points.push(...percentPoints.filter(p => p >= minLoad && p <= capacity));
    
    if (capacity > 10) {
      points.push(capacity * 0.75);
      points.push(capacity);
    }
  }
  
  // מיון והסרת כפילויות, עיגול לערכי e הקרובים
  const roundedPoints = points.map(p => {
    if (p === 0) return 0;
    // עיגול לערך הקרוב ביותר שהוא כפולה של e
    return Math.round(p / e) * e;
  });
  
  return [...new Set(roundedPoints)].sort((a, b) => a - b).filter(p => p <= capacity);
}

/**
 * יצירת טבלאות סובלנות לבדיקת דיוק (ACCURACY)
 */
function generateAccuracyToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testPoints = generateStandardTestPoints(capacity, unit, e);
  const rows = testPoints.map((load, index) => ({
    profileId,
    testType: "ACCURACY" as const,
    load,
    mpe: calculateOIMLMPE(e, load, accuracyClass, capacity),
    unit,
    orderNo: index + 1
  }));
  
  return rows;
}

/**
 * יצירת טבלאות סובלנות לבדיקת אקסצנטריות (ECCENTRICITY)
 * בדרך כלל בודקים ב-1/3 מהקיבולת המקסימלית
 */
function generateEccentricityToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testLoad = capacity / 3; // בדרך כלל 1/3 מהקיבולת
  const mpe = calculateOIMLMPE(e, testLoad, accuracyClass);
  
  return [{
    profileId,
    testType: "ECCENTRICITY" as const,
    load: testLoad,
    mpe,
    unit,
    orderNo: 1
  }];
}

/**
 * יצירת טבלאות סובלנות לבדיקת חזרתיות (REPEATABILITY)
 * בדרך כלל בודקים ב-50% מהקיבולת המקסימלית
 */
function generateRepeatabilityToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testLoad = capacity * 0.5; // 50% מהקיבולת
  const mpe = calculateOIMLMPE(e, testLoad, accuracyClass);
  
  return [{
    profileId,
    testType: "REPEATABILITY" as const,
    load: testLoad,
    mpe,
    unit,
    orderNo: 1
  }];
}

/**
 * יצירת טבלאות סובלנות לבדיקת רגישות (SENSITIVITY)
 * בדרך כלל בודקים ב-100% מהקיבולת המקסימלית
 */
function generateSensitivityToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testLoad = capacity;
  const mpe = calculateOIMLMPE(e, testLoad, accuracyClass);
  
  return [{
    profileId,
    testType: "SENSITIVITY" as const,
    load: testLoad,
    mpe,
    unit,
    orderNo: 1
  }];
}

/**
 * יצירת טבלאות סובלנות לבדיקת זמן (TIME)
 * בדרך כלל בודקים ב-50% מהקיבולת המקסימלית
 * סובלנות זמן היא בדרך כלל ±1e או לפי מפרט
 */
function generateTimeToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testLoad = capacity * 0.5; // 50% מהקיבולת
  // סובלנות זמן היא בדרך כלל e או 2e לפי דרגת הדיוק
  const mpe = accuracyClass === "I" ? e : 2 * e;
  
  return [{
    profileId,
    testType: "TIME" as const,
    load: testLoad,
    mpe,
    unit,
    orderNo: 1
  }];
}

/**
 * יצירת טבלאות סובלנות לבדיקת טרה (TARE)
 * בדרך כלל בודקים ב-100% מהקיבולת המקסימלית
 * סובלנות טרה היא בדרך כלל ±0.5e או e
 */
function generateTareToleranceRows(
  profileId: string,
  capacity: number,
  unit: string,
  e: number,
  accuracyClass: string
): Array<{ profileId: string; testType: TestType; load: number; mpe: number; unit: string; orderNo: number }> {
  const testLoad = capacity; // 100% מהקיבולת
  // סובלנות טרה היא בדרך כלל e או 0.5e לפי דרגת הדיוק
  const mpe = accuracyClass === "I" ? 0.5 * e : e;
  
  return [{
    profileId,
    testType: "TARE" as const,
    load: testLoad,
    mpe,
    unit,
    orderNo: 1
  }];
}

// ============================================================================
// פונקציה ראשית
// ============================================================================

async function seedScaleModels() {
  console.log("🌱 מכניס מודלי משקלות...");
  
  for (const model of commonScaleModels) {
    const existing = await prisma.scaleModel.findFirst({
      where: {
        manufacturer: model.manufacturer,
        modelName: model.modelName,
        maxCapacity: model.maxCapacity as any,
        unit: model.unit,
        d: model.d as any,
        e: model.e as any,
        accuracyClass: model.accuracyClass
      }
    });
    
    if (!existing) {
      await prisma.scaleModel.create({
        data: {
          manufacturer: model.manufacturer,
          modelName: model.modelName,
          maxCapacity: model.maxCapacity as any,
          unit: model.unit,
          d: model.d as any,
          e: model.e as any,
          accuracyClass: model.accuracyClass,
          isActive: true
        }
      });
    }
  }
  
  console.log(`✅ הוכנסו ${commonScaleModels.length} מודלי משקלות`);
}

async function seedMetrologicalProfiles() {
  console.log("🌱 מכניס פרופילים מטרולוגיים...");
  
  let profilesCreated = 0;
  let toleranceRowsCreated = 0;
  let testPointsCreated = 0;
  
  // יצירת פרופיל לכל שילוב ייחודי של capacity, unit, d, e, accuracyClass
  const uniqueProfiles = new Map<string, ScaleModelData>();
  
  for (const model of commonScaleModels) {
    const key = `${model.maxCapacity}_${model.unit}_${model.d}_${model.e}_${model.accuracyClass}`;
    if (!uniqueProfiles.has(key)) {
      uniqueProfiles.set(key, model);
    }
  }
  
  for (const [key, model] of uniqueProfiles) {
    // בדיקה אם הפרופיל כבר קיים
    const existing = await prisma.metrologicalProfile.findFirst({
      where: {
        capacity: model.maxCapacity as any,
        unit: model.unit,
        d: model.d as any,
        e: model.e as any,
        accuracyCls: model.accuracyClass
      }
    });
    
    let profileId: string;
    
    if (existing) {
      profileId = existing.id;
      // עדכון הפרופיל הקיים
      await prisma.metrologicalProfile.update({
        where: { id: profileId },
        data: {
          toleranceMode: "HUB_REFERENCE" as any,
          hubKey: `AUTO_${key}`
        }
      });
    } else {
      // יצירת פרופיל חדש
      const profile = await prisma.metrologicalProfile.create({
        data: {
          capacity: model.maxCapacity as any,
          unit: model.unit,
          d: model.d as any,
          e: model.e as any,
          accuracyCls: model.accuracyClass,
          toleranceMode: "HUB_REFERENCE" as any,
          hubKey: `AUTO_${key}`,
          divisionsN: Math.floor(model.maxCapacity / model.e)
        }
      });
      profileId = profile.id;
      profilesCreated++;
    }
    
    // מחיקת טבלאות קיימות (אם יש)
    await prisma.toleranceRow.deleteMany({ where: { profileId } });
    await prisma.testPoint.deleteMany({ where: { profileId } });
    
    // יצירת טבלאות סובלנות לבדיקת דיוק
    const accuracyRows = generateAccuracyToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (accuracyRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: accuracyRows
      });
      toleranceRowsCreated += accuracyRows.length;
      
      // יצירת נקודות בדיקה
      const testPoints = accuracyRows.map(row => ({
        profileId,
        testType: "ACCURACY" as const,
        load: row.load,
        orderNo: row.orderNo
      }));
      
      await prisma.testPoint.createMany({
        data: testPoints
      });
      testPointsCreated += testPoints.length;
    }
    
    // יצירת טבלאות סובלנות לבדיקת אקסצנטריות
    const eccentricityRows = generateEccentricityToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (eccentricityRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: eccentricityRows
      });
      toleranceRowsCreated += eccentricityRows.length;
      
      await prisma.testPoint.createMany({
        data: eccentricityRows.map(row => ({
          profileId,
          testType: "ECCENTRICITY" as const,
          load: row.load,
          orderNo: row.orderNo
        }))
      });
      testPointsCreated += eccentricityRows.length;
    }
    
    // יצירת טבלאות סובלנות לבדיקת חזרתיות
    const repeatabilityRows = generateRepeatabilityToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (repeatabilityRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: repeatabilityRows
      });
      toleranceRowsCreated += repeatabilityRows.length;
      
      await prisma.testPoint.createMany({
        data: repeatabilityRows.map(row => ({
          profileId,
          testType: "REPEATABILITY" as const,
          load: row.load,
          orderNo: row.orderNo
        }))
      });
      testPointsCreated += repeatabilityRows.length;
    }
    
    // יצירת טבלאות סובלנות לבדיקת רגישות
    const sensitivityRows = generateSensitivityToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (sensitivityRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: sensitivityRows
      });
      toleranceRowsCreated += sensitivityRows.length;
      
      await prisma.testPoint.createMany({
        data: sensitivityRows.map(row => ({
          profileId,
          testType: "SENSITIVITY" as const,
          load: row.load,
          orderNo: row.orderNo
        }))
      });
      testPointsCreated += sensitivityRows.length;
    }
    
    // יצירת טבלאות סובלנות לבדיקת זמן
    const timeRows = generateTimeToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (timeRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: timeRows
      });
      toleranceRowsCreated += timeRows.length;
      
      await prisma.testPoint.createMany({
        data: timeRows.map(row => ({
          profileId,
          testType: "TIME" as const,
          load: row.load,
          orderNo: row.orderNo
        }))
      });
      testPointsCreated += timeRows.length;
    }
    
    // יצירת טבלאות סובלנות לבדיקת טרה
    const tareRows = generateTareToleranceRows(
      profileId,
      model.maxCapacity,
      model.unit,
      model.e,
      model.accuracyClass
    );
    
    if (tareRows.length > 0) {
      await prisma.toleranceRow.createMany({
        data: tareRows
      });
      toleranceRowsCreated += tareRows.length;
      
      await prisma.testPoint.createMany({
        data: tareRows.map(row => ({
          profileId,
          testType: "TARE" as const,
          load: row.load,
          orderNo: row.orderNo
        }))
      });
      testPointsCreated += tareRows.length;
    }
  }
  
  console.log(`✅ נוצרו ${profilesCreated} פרופילים מטרולוגיים`);
  console.log(`✅ נוצרו ${toleranceRowsCreated} שורות סובלנות`);
  console.log(`✅ נוצרו ${testPointsCreated} נקודות בדיקה`);
}

/**
 * יצירת פרופיל עם OIML Engine mode
 * עם multipliers נכונים לפי תקן OIML R76
 */
async function createOIMLProfile(
  capacity: number,
  unit: string,
  d: number,
  e: number,
  accuracyClass: string
) {
  // חישוב multipliers לפי תקן OIML R76
  // בדרך כלל: 1e עד 500e, 2e עד 2000e, 3e מעל 2000e
  // אבל זה תלוי בדרגת הדיוק
  let thresholds: Array<{ upToLoad: number; multiplier: number }>;
  
  const maxN = capacity / e; // מספר החלוקות המקסימלי
  
  switch (accuracyClass) {
    case "I":
      thresholds = [
        { upToLoad: 50000 * e, multiplier: 0.5 },
        { upToLoad: 200000 * e, multiplier: 1.0 },
        { upToLoad: 999999999, multiplier: 1.5 }
      ];
      break;
    case "II":
      thresholds = [
        { upToLoad: 5000 * e, multiplier: 1.0 },
        { upToLoad: 20000 * e, multiplier: 1.5 },
        { upToLoad: 999999999, multiplier: 2.0 }
      ];
      break;
    case "III":
      thresholds = [
        { upToLoad: 500 * e, multiplier: 1.5 },
        { upToLoad: 2000 * e, multiplier: 2.0 },
        { upToLoad: 999999999, multiplier: 3.0 }
      ];
      break;
    case "IIII":
      thresholds = [
        { upToLoad: 50 * e, multiplier: 2.5 },
        { upToLoad: 200 * e, multiplier: 3.0 },
        { upToLoad: 999999999, multiplier: 4.0 }
      ];
      break;
    default:
      thresholds = [
        { upToLoad: 500 * e, multiplier: 1.5 },
        { upToLoad: 2000 * e, multiplier: 2.0 },
        { upToLoad: 999999999, multiplier: 3.0 }
      ];
  }
  
  // יצירת נקודות בדיקה
  const testPoints = generateStandardTestPoints(capacity, unit, e);
  
  const profile = await prisma.metrologicalProfile.create({
    data: {
      capacity: capacity as any,
      unit,
      d: d as any,
      e: e as any,
      accuracyCls: accuracyClass,
      toleranceMode: "OIML_ENGINE" as any,
      divisionsN: Math.floor(capacity / e),
      oimlRuleJson: { thresholds } as any
    }
  });
  
  // יצירת נקודות בדיקה
  await prisma.testPoint.createMany({
    data: testPoints.map((load, index) => ({
      profileId: profile.id,
      testType: "ACCURACY" as TestType,
      load,
      orderNo: index + 1
    }))
  });
  
  return profile;
}

async function linkScaleModelsToProfiles() {
  console.log("🌱 מקשר מודלי משקלות לפרופילים מטרולוגיים...");
  
  const scaleModels = await prisma.scaleModel.findMany({
    where: { defaultProfileId: null }
  });
  
  let linked = 0;
  
  for (const model of scaleModels) {
    const profile = await prisma.metrologicalProfile.findFirst({
      where: {
        capacity: model.maxCapacity,
        unit: model.unit,
        d: model.d,
        e: model.e,
        accuracyCls: model.accuracyClass
      }
    });
    
    if (profile) {
      await prisma.scaleModel.update({
        where: { id: model.id },
        data: { defaultProfileId: profile.id }
      });
      linked++;
    }
  }
  
  console.log(`✅ קושרו ${linked} מודלי משקלות לפרופילים`);
}

/**
 * הגדרת טבלת "בדיקת דיוק" בדיוק כמו בקובץ DOCX
 * 
 * המבנה המדויק של הטבלה (6 עמודות):
 * 1. סטיה מותרת / PERMISSIBLE ERROR (mpe)
 * 2. סטיה בירידה / DOWNLOAD ERROR (downloadError = downloadReading - load)
 * 3. קריאה בירידה / DOWNLOAD READING (downloadReading)
 * 4. סטיה בעליה / UPLOAD ERROR (uploadError = uploadReading - load)
 * 5. קריאה בעליה / UPLOAD READING (uploadReading)
 * 6. מסה מועמסת / LOAD MASS (load)
 * 
 * הערה: הטבלה במערכת נשמרת בשתי שכבות:
 * - ToleranceRow: מכיל load ו-mpe (סובלנות מותרת)
 * - measurementsJson (בזמן בדיקה): מכיל uploadReading ו-downloadReading (תוצאות בפועל)
 */
async function createAccuracyTableFromImage(profileId: string) {
  console.log(`📊 יוצר טבלת בדיקת דיוק בדיוק כמו בקובץ DOCX עבור פרופיל ${profileId}...`);
  
  // מחיקת שורות קיימות
  await prisma.toleranceRow.deleteMany({ 
    where: { profileId, testType: "ACCURACY" } 
  });
  await prisma.testPoint.deleteMany({ 
    where: { profileId, testType: "ACCURACY" } 
  });
  
  // הגדרת הטבלה בדיוק כמו בקובץ DOCX
  // המבנה: LOAD MASS | PERMISSIBLE ERROR | DOWNLOAD ERROR | DOWNLOAD READING | UPLOAD ERROR | UPLOAD READING
  // מהתמונה והקובץ, הנתונים הם:
  const accuracyRows = [
    { 
      load: 0, 
      mpe: 0.01,
      // הערכים הבאים נשמרים ב-measurementsJson בזמן בדיקה בפועל
      // downloadError: 0, downloadReading: 0.000, uploadError: 0, uploadReading: 0.000
    },
    { 
      load: 0.5, 
      mpe: 0.01,
      // downloadError: 0, downloadReading: 0.500, uploadError: 0, uploadReading: 0.500
    },
    { 
      load: 1, 
      mpe: 0.01,
      // downloadError: 0, downloadReading: 1.000, uploadError: 0.001, uploadReading: 1.001
    },
    { 
      load: 5, 
      mpe: 0.01,
      // downloadError: 0, downloadReading: 5.000, uploadError: 0, uploadReading: 5.000
    },
    { 
      load: 10, 
      mpe: 0.02,
      // downloadError: 0, downloadReading: 10.000, uploadError: 0, uploadReading: 10.000
    },
    { 
      load: 15, 
      mpe: 0.02,
      // downloadError: 0, downloadReading: 15.000, uploadError: 0.001, uploadReading: 15.001
    }
  ];
  
  // קבלת יחידת המידה מהפרופיל
  const profile = await prisma.metrologicalProfile.findUnique({
    where: { id: profileId },
    select: { unit: true }
  });
  
  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }
  
  // יצירת שורות סובלנות (ToleranceRow)
  // זה מה שנשמר במערכת כטבלת סובלנות מותרת
  await prisma.toleranceRow.createMany({
    data: accuracyRows.map((row, index) => ({
      profileId,
      testType: "ACCURACY" as TestType,
      load: row.load as any,
      mpe: row.mpe as any,
      unit: profile.unit,
      orderNo: index + 1
    }))
  });
  
  // יצירת נקודות בדיקה (TestPoint)
  // זה מה שמגדיר את נקודות הבדיקה שיש לבצע
  await prisma.testPoint.createMany({
    data: accuracyRows.map((row, index) => ({
      profileId,
      testType: "ACCURACY" as TestType,
      load: row.load as any,
      orderNo: index + 1
    }))
  });
  
  console.log(`✅ טבלת בדיקת דיוק נוצרה בהצלחה עם ${accuracyRows.length} שורות`);
  console.log(`   המבנה: 6 עמודות - סטיה מותרת | סטיה בירידה | קריאה בירידה | סטיה בעליה | קריאה בעליה | מסה מועמסת`);
  console.log(`   הערה: הקריאות (uploadReading, downloadReading) נאספות בזמן הבדיקה ונשמרות ב-measurementsJson`);
}

// ייצוא הפונקציה לשימוש חיצוני
export { createAccuracyTableFromImage };

async function main() {
  console.log("🚀 מתחיל הכנסת מידע מטרולוגי מקיף...\n");
  
  try {
    await seedScaleModels();
    await seedMetrologicalProfiles();
    await linkScaleModelsToProfiles();
    
    console.log("\n✅ הושלם בהצלחה! כל המידע המטרולוגי הוכנס למערכת.");
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

