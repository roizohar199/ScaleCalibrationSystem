// apps/web/src/utils/oiml.ts
// Utility functions for OIML R76 calculations

import api from "../api/client";
import { OimlR76Class } from "../../../api/src/modules/oiml/r76";

/**
 * Convert value to grams based on unit
 */
export function convertToGrams(value: number, unit: string): number {
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
 * Call API to calculate accuracy class
 * Falls back to local calculation if API fails
 */
export async function callAccuracyClassAPI(
  capacity: number,
  e: number,
  unit: string
): Promise<{ accuracyClass: OimlR76Class; n: number } | null> {
  try {
    const response = await api.post("/oiml/r76/accuracy-class", {
      capacity,
      e,
      unit,
    });
    return {
      accuracyClass: response.data.accuracyClass,
      n: response.data.n,
    };
  } catch (error) {
    console.warn("Failed to call accuracy class API, using local calculation", error);
    // Fallback to local calculation
    try {
      const n = calculateN(capacity, e, unit);
      const accuracyClass = calculateAccuracyClassFromN(n);
      return { accuracyClass, n };
    } catch (localError) {
      console.error("Local accuracy class calculation failed", localError);
      return null;
    }
  }
}

/**
 * Call API to calculate MPE (Maximum Permissible Error)
 */
export async function callMPEAPI(
  accuracyClass: string,
  e: number,
  load: number,
  stage: "initial" | "inService" = "initial"
): Promise<number | null> {
  try {
    const response = await api.post("/oiml/r76/mpe", {
      accuracyClass,
      e,
      load,
      stage,
    });
    return response.data.mpeAbs;
  } catch (error) {
    console.error("Failed to call MPE API", error);
    return null;
  }
}

