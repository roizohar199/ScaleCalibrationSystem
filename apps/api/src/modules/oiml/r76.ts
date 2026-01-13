// apps/api/src/modules/oiml/r76.ts
// OIML R 76-1:2006 Table 6 (MPE on initial verification) + in-service = 2x
// Sources: OIML R 76-1 Table 6 + clause 3.5.2

export type OimlR76Class = "I" | "II" | "III" | "IIII";
export type OimlServiceStage = "initial" | "inService";

export type OimlR76Input = {
  accuracyClass: OimlR76Class;

  /**
   * e = verification scale interval (same unit as load)
   * Example: e=0.01 kg
   */
  e: number;

  /**
   * load m in same unit as e (kg/g)
   * Example: load=15.0 kg
   */
  load: number;

  /**
   * stage: "initial" or "inService"
   * inService uses 2x MPE of initial verification (R76-1 3.5.2)
   */
  stage?: OimlServiceStage;
};

export type OimlR76MpeResult = {
  mpeAbs: number;          // absolute MPE in same unit as e/load
  mpeAbsInE: 0.5 | 1 | 1.5; // MPE expressed in e (absolute)
  mOverE: number;          // m/e
  stage: OimlServiceStage;
};

type RangeRule = {
  // m expressed in e: 0 <= m <= upper  => mpeInE
  upperInclusive?: number; // if undefined => open upper
  mpeInE: 0.5 | 1 | 1.5;
};

const TABLE6: Record<OimlR76Class, RangeRule[]> = {
  // Table 6: For loads m expressed in verification scale intervals e
  I: [
    { upperInclusive: 50_000, mpeInE: 0.5 },
    { upperInclusive: 200_000, mpeInE: 1 },
    { upperInclusive: undefined, mpeInE: 1.5 },
  ],
  II: [
    { upperInclusive: 5_000, mpeInE: 0.5 },
    { upperInclusive: 20_000, mpeInE: 1 },
    { upperInclusive: 100_000, mpeInE: 1.5 },
  ],
  III: [
    { upperInclusive: 500, mpeInE: 0.5 },
    { upperInclusive: 2_000, mpeInE: 1 },
    { upperInclusive: 10_000, mpeInE: 1.5 },
  ],
  IIII: [
    { upperInclusive: 50, mpeInE: 0.5 },
    { upperInclusive: 200, mpeInE: 1 },
    { upperInclusive: 1_000, mpeInE: 1.5 },
  ],
};

function assertFinitePositive(name: string, v: number) {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a finite positive number`);
}

export function calcOimlR76Mpe(input: OimlR76Input): OimlR76MpeResult {
  const stage: OimlServiceStage = input.stage ?? "initial";
  assertFinitePositive("e", input.e);
  assertFinitePositive("load", input.load);

  const mOverE = input.load / input.e;

  // select mpeInE from table
  const rules = TABLE6[input.accuracyClass];
  if (!rules) throw new Error(`Unsupported accuracyClass: ${input.accuracyClass}`);

  let mpeInE: 0.5 | 1 | 1.5 = 1.5;
  for (const r of rules) {
    if (r.upperInclusive == null) {
      mpeInE = r.mpeInE;
      break;
    }
    if (mOverE <= r.upperInclusive) {
      mpeInE = r.mpeInE;
      break;
    }
  }

  let mpeAbs = mpeInE * input.e;

  // R76-1 clause 3.5.2: in-service = 2x initial verification MPE
  if (stage === "inService") mpeAbs = 2 * mpeAbs;

  // Logging כדי לוודא שהמנוע נקרא
  if (process.env.NODE_ENV !== "production") {
    console.log(`[OIML R76] Class=${input.accuracyClass}, e=${input.e}, load=${input.load}, m/e=${mOverE.toFixed(2)}, MPE=${mpeAbs} (${mpeInE}e), stage=${stage}`);
  }

  return {
    mpeAbs,
    mpeAbsInE: mpeInE,
    mOverE,
    stage,
  };
}

/**
 * Convenience: given indication and true load, compute error and pass/fail against OIML R76 MPE.
 */
export function evalIndicationAgainstOimlR76(params: OimlR76Input & { indication: number }) {
  const { mpeAbs } = calcOimlR76Mpe(params);
  const error = params.indication - params.load; // same unit
  const pass = Math.abs(error) <= mpeAbs;
  return { error, mpeAbs, pass };
}

