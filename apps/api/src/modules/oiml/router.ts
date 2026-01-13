import { Router } from "express";
import { calcOimlR76Mpe } from "./r76.js";
import { calculateAccuracyClass, calculateN } from "./accuracyClass.js";

export const oimlRouter = Router();

// POST /api/oiml/r76/mpe
oimlRouter.post("/r76/mpe", (req, res) => {
  try {
    const { accuracyClass, e, load, stage } = req.body || {};
    
    if (!accuracyClass || e === undefined || load === undefined) {
      return res.status(400).json({ 
        error: "Missing required parameters: accuracyClass, e, load" 
      });
    }

    const result = calcOimlR76Mpe({
      accuracyClass,
      e: Number(e),
      load: Number(load),
      stage,
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ 
      error: error.message || "Failed to calculate OIML R76 MPE" 
    });
  }
});

// POST /api/oiml/r76/accuracy-class
oimlRouter.post("/r76/accuracy-class", (req, res) => {
  try {
    const { capacity, e, unit } = req.body || {};
    
    if (capacity === undefined || e === undefined || !unit) {
      return res.status(400).json({ 
        error: "Missing required parameters: capacity, e, unit" 
      });
    }

    const capacityNum = Number(capacity);
    const eNum = Number(e);
    
    if (isNaN(capacityNum) || isNaN(eNum)) {
      return res.status(400).json({ 
        error: "capacity and e must be valid numbers" 
      });
    }

    const n = calculateN(capacityNum, eNum, unit);
    const accuracyClass = calculateAccuracyClass(capacityNum, eNum, unit);
    
    if (!accuracyClass) {
      return res.status(400).json({ 
        error: "Failed to calculate accuracy class" 
      });
    }
    
    res.json({
      accuracyClass,
      n,
      capacity: capacityNum,
      e: eNum,
      unit
    });
  } catch (error: any) {
    res.status(400).json({ 
      error: error.message || "Failed to calculate accuracy class" 
    });
  }
});



