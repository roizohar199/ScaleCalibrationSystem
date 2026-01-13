// apps/api/src/modules/oiml/accuracyClass.ts
// OIML R 76-1:2006 - Accuracy Class calculation
// According to OIML R76, accuracy class is determined by n = Max / e
// where n is the number of verification scale intervals

import { OimlR76Class } from "./r76.js";

/**
 * Calculate accuracy class from n (number of verification scale intervals)
 * According to OIML R76:
 * - Class I: n >= 50,000
 * - Class II: n >= 5,000 && n < 50,000
 * - Class III: n >= 500 && n < 5,000
 * - Class IIII: n < 500
 */
export function calculateAccuracyClassFromN(n: number): OimlR76Class {
  if (n >= 50000) return "I";
  if (n >= 5000 && n < 50000) return "II";
  if (n >= 500 && n < 5000) return "III";
  return "IIII";
}

/**
 * Convert value to grams based on unit
 */
function convertToGrams(value: number, unit: string): number {
  if (unit === "kg") return value * 1000;
  if (unit === "mg") return value / 1000;
  return value; // already in grams
}

/**
 * Calculate n (number of verification scale intervals) from capacity and e
 * n = Max / e
 * Both values are converted to grams for calculation
 */
export function calculateN(capacity: number, e: number, unit: string): number {
  const capacityInGrams = convertToGrams(capacity, unit);
  const eInGrams = convertToGrams(e, unit);
  
  if (eInGrams <= 0) {
    throw new Error("e value must be greater than 0");
  }
  
  return capacityInGrams / eInGrams;
}

/**
 * Calculate accuracy class from capacity, e, and unit
 * @param capacity - Maximum capacity of the scale
 * @param e - Verification scale interval (e value)
 * @param unit - Unit of measurement ("kg", "g", or "mg")
 * @returns Accuracy class ("I", "II", "III", or "IIII") or null if invalid
 */
export function calculateAccuracyClass(
  capacity: number,
  e: number,
  unit: string
): OimlR76Class | null {
  if (!capacity || !e || e <= 0) {
    return null;
  }
  
  try {
    const n = calculateN(capacity, e, unit);
    return calculateAccuracyClassFromN(n);
  } catch (error) {
    return null;
  }
}

