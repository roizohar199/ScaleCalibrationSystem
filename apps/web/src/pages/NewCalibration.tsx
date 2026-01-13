import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import MeasurementTable from '../components/calibration/MeasurementTable';
import { 
  FileCheck, 
  ArrowRight,
  Save,
  Send,
  Scale,
  Thermometer,
  Droplets,
  AlertCircle,
  Calendar,
  Plus
} from 'lucide-react';
import { format, addYears } from 'date-fns';
import { callAccuracyClassAPI, calculateAccuracyClassFromN, calculateN, callMPEAPI } from '../utils/oiml';

interface ScaleData {
  id: string;
  manufacturer_serial?: string | null;
  internal_serial?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  customer_id?: string | null;
  max_capacity?: number | null;
  unit?: string | null;
  accuracy_class?: string | null;
}

export default function NewCalibration() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedScaleId = searchParams.get('scale_id');
  
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedScale, setSelectedScale] = useState<ScaleData | null>(null);
  const [calibrationId, setCalibrationId] = useState<string | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    taxId: '',
    address: '',
    contact: '',
    phone: ''
  });
  const [scaleModelDialogOpen, setScaleModelDialogOpen] = useState(false);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savingScale, setSavingScale] = useState(false);
  const [scaleModelFormData, setScaleModelFormData] = useState({
    manufacturer: '',
    manufacturer_custom: '',
    model_name: '',
    device_type: 'electronic',
    max_capacity: '',
    unit: 'kg',
    division_value: '', // ערך חלוקה (למשל 1 גרם)
    divisions: '', // מספר חלוקות (אם הטכנאי מזין ידנית)
    d_value: '',
    e_value: '',
    accuracy_class: 'III'
  });
  const [scaleFormData, setScaleFormData] = useState({
    customerId: '',
    siteId: '',
    modelId: '',
    manufacturer: '',
    modelName: '',
    serialMfg: '',
    serialInternal: '',
    deviceType: 'electronic'
  });
  const [selectedCustomerSites, setSelectedCustomerSites] = useState<any[]>([]);

  // פונקציה לחישוב רמת דיוק אוטומטית לפי e ו-Max
  // משתמשת ב-API עם fallback לחישוב מקומי
  const calculateAccuracyClass = async (maxCapacity: string, eValue: string, unit: string): Promise<string | null> => {
    if (!maxCapacity || !eValue) return null;
    
    const capacity = parseFloat(maxCapacity);
    const e = parseFloat(eValue);
    
    if (isNaN(capacity) || isNaN(e) || e <= 0) return null;
    
    // נסיון להשתמש ב-API
    try {
      const result = await callAccuracyClassAPI(capacity, e, unit);
      if (result) {
        return result.accuracyClass;
      }
    } catch (error) {
      console.warn("API call failed, using local calculation", error);
    }
    
    // Fallback לחישוב מקומי לפי OIML R76
    try {
      const n = calculateN(capacity, e, unit);
      return calculateAccuracyClassFromN(n);
    } catch (error) {
      console.error("Local accuracy class calculation failed", error);
      return null;
    }
  };

  // פונקציה לחישוב e ו-d אוטומטית לפי כושר השקילה ורמת דיוק
  const calculateEAndD = (maxCapacity: string, accuracyClass: string, unit: string, divisions?: string, divisionValue?: string): { e: number; d: number; n?: number } | null => {
    if (!maxCapacity || !accuracyClass) return null;
    
    const capacity = parseFloat(maxCapacity);
    if (isNaN(capacity)) return null;
    
    // המרה ל-gram לצורך חישוב
    let capacityInGrams = capacity;
    if (unit === 'kg') capacityInGrams = capacity * 1000;
    if (unit === 'mg') capacityInGrams = capacity / 1000;
    
    // אם הטכנאי הזין ערך חלוקה (למשל 1 גרם), נחשב מספר חלוקות
    // הערה: ערך חלוקה תמיד נחשב ביחידת gram (גרם), גם אם היחידה הכללית היא kg
    if (divisionValue) {
      const divValue = parseFloat(divisionValue);
      if (!isNaN(divValue) && divValue > 0) {
        // ערך חלוקה תמיד ב-gram (גרם)
        // אם המשתמש מזין 1, זה אומר 1 גרם
        const divValueInGrams = divValue;
        
        // מספר חלוקות = כושר העמסה (בגרמים) / ערך חלוקה (בגרמים)
        const calculatedDivisions = capacityInGrams / divValueInGrams;
        
        // e = ערך חלוקה (בגרמים)
        let e = divValueInGrams;
        
        // המרה ליחידה המקורית של כושר העמסה
        if (unit === 'kg') e = e / 1000; // המרה מ-gram ל-kg
        if (unit === 'mg') e = e * 1000; // המרה מ-gram ל-mg
        
        // d = e בדרך כלל
        const d = e;
        
        return { e, d, n: calculatedDivisions };
      }
    }
    
    // אם הטכנאי הזין חלוקות ידנית, נשתמש בזה
    if (divisions) {
      const divisionsNum = parseFloat(divisions);
      if (!isNaN(divisionsNum) && divisionsNum > 0) {
        // e = Max / n (מספר חלוקות)
        let e = capacityInGrams / divisionsNum;
        
        // המרה חזרה ליחידה המקורית
        if (unit === 'kg') e = e / 1000;
        if (unit === 'mg') e = e * 1000;
        
        // d = e בדרך כלל
        const d = e;
        
        return { e, d, n: divisionsNum };
      }
    }
    
    // אחרת, חישוב e לפי רמת דיוק - נבחר n אופטימלי לכל Class
    let targetN = 0;
    switch (accuracyClass) {
      case 'I':
        targetN = 100000; // n גבוה מאוד
        break;
      case 'II':
        targetN = 10000; // n בינוני-גבוה
        break;
      case 'III':
        targetN = 3000; // n בינוני (רוב המשקלות)
        break;
      case 'IIII':
        targetN = 200; // n נמוך
        break;
      default:
        targetN = 3000;
    }
    
    // חישוב e = Max / n
    let e = capacityInGrams / targetN;
    
    // עיגול e לערך סטנדרטי (0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000, וכו')
    const standardValues = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    e = standardValues.reduce((prev, curr) => 
      Math.abs(curr - e) < Math.abs(prev - e) ? curr : prev
    );
    
    // המרה חזרה ליחידה המקורית
    if (unit === 'kg') e = e / 1000;
    if (unit === 'mg') e = e * 1000;
    
    // d = e בדרך כלל (או d = e/2 במקרים מסוימים)
    // נשתמש ב-d = e ככלל
    const d = e;
    
    return { e, d };
  };

  // עדכון e ו-d אוטומטית כשכושר השקילה, רמת הדיוק, חלוקות, או ערך חלוקה משתנים
  useEffect(() => {
    if (scaleModelFormData.max_capacity && scaleModelFormData.accuracy_class) {
      const calculated = calculateEAndD(
        scaleModelFormData.max_capacity,
        scaleModelFormData.accuracy_class,
        scaleModelFormData.unit,
        scaleModelFormData.divisions,
        scaleModelFormData.division_value
      );
      if (calculated) {
        setScaleModelFormData(prev => {
          // בדיקה אם הערכים השתנו כדי למנוע עדכון מיותר
          const newE = calculated.e.toFixed(3).replace(/\.?0+$/, '');
          const newD = calculated.d.toFixed(3).replace(/\.?0+$/, '');
          
          // שמירת division_value הנוכחי לפני העדכון
          const currentDivisionValue = prev.division_value;
          
          if (prev.e_value === newE && prev.d_value === newD && 
              (!calculated.n || prev.divisions || !currentDivisionValue)) {
            return prev; // אין צורך לעדכן
          }
          
          return {
            ...prev,
            e_value: newE,
            d_value: newD,
            // אם חושב מספר חלוקות מערך חלוקה, נעדכן גם את divisions
            ...(calculated.n && currentDivisionValue && !prev.divisions ? {
              divisions: Math.round(calculated.n).toString()
            } : {})
          };
        });
      }
    }
  }, [scaleModelFormData.max_capacity, scaleModelFormData.accuracy_class, scaleModelFormData.unit, scaleModelFormData.divisions, scaleModelFormData.division_value]);

  // עדכון רמת דיוק אוטומטית לפי e ו-Max (אם e כבר חושב)
  // או לפי ערך חלוקה/מספר חלוקות
  useEffect(() => {
    if (scaleModelFormData.max_capacity) {
      let eValue = scaleModelFormData.e_value;
      
      // אם יש ערך חלוקה או מספר חלוקות, נחשב e מהם
      if (!eValue && (scaleModelFormData.division_value || scaleModelFormData.divisions)) {
        const calculated = calculateEAndD(
          scaleModelFormData.max_capacity,
          scaleModelFormData.accuracy_class || 'III',
          scaleModelFormData.unit,
          scaleModelFormData.divisions,
          scaleModelFormData.division_value
        );
        if (calculated) {
          eValue = calculated.e.toFixed(3).replace(/\.?0+$/, '');
        }
      }
      
      if (eValue) {
        calculateAccuracyClass(
          scaleModelFormData.max_capacity,
          eValue,
          scaleModelFormData.unit
        ).then((calculatedClass) => {
          if (calculatedClass) {
            setScaleModelFormData(prev => ({
              ...prev,
              accuracy_class: calculatedClass
            }));
          }
        }).catch((error) => {
          console.error("Error calculating accuracy class", error);
        });
      }
    }
  }, [scaleModelFormData.max_capacity, scaleModelFormData.e_value, scaleModelFormData.unit, scaleModelFormData.divisions, scaleModelFormData.division_value]);

  // מילוי אוטומטי של מדידות כאשר יש מספיק נתונים
  useEffect(() => {
    // נמלא מדידות רק אם יש capacity ו-e ו-unit
    const capacityRaw = scaleModelFormData.max_capacity || '';
    const capacity = capacityRaw ? parseFloat(String(capacityRaw)) : 0;
    const unit = scaleModelFormData.unit || 'kg';
    
    // חישוב e_value אם הוא לא קיים
    const eValueRaw = scaleModelFormData.e_value || '';
    let e = eValueRaw ? parseFloat(String(eValueRaw)) : 0;
    
    if (!e && capacity) {
      if (scaleModelFormData.division_value) {
        const divisionValue = parseFloat(String(scaleModelFormData.division_value));
        if (divisionValue > 0) {
          let capacityInGrams = capacity;
          if (unit === 'kg') capacityInGrams = capacity * 1000;
          if (unit === 'mg') capacityInGrams = capacity / 1000;
          e = divisionValue;
          if (unit === 'kg') e = divisionValue / 1000;
          if (unit === 'mg') e = divisionValue * 1000;
        }
      } else if (scaleModelFormData.divisions) {
        const divisions = parseFloat(String(scaleModelFormData.divisions));
        if (divisions > 0) {
          let capacityInGrams = capacity;
          if (unit === 'kg') capacityInGrams = capacity * 1000;
          if (unit === 'mg') capacityInGrams = capacity / 1000;
          const eInGrams = capacityInGrams / divisions;
          e = eInGrams;
          if (unit === 'kg') e = eInGrams / 1000;
          if (unit === 'mg') e = eInGrams * 1000;
        }
      }
    }
    
    // חישוב accuracyClass - תמיד נחשב מחדש אם יש capacity ו-e תקינים
    let accuracyClass = scaleModelFormData.accuracy_class;
    if (capacity && e && capacity > 0 && e > 0) {
      // חישוב מקומי של accuracyClass לפי OIML R76 (תמיד נחשב מחדש כדי לוודא שהוא נכון)
      try {
        const n = calculateN(capacity, e, unit);
        const calculatedClass = calculateAccuracyClassFromN(n);
        // נשתמש בערך המחושב רק אם הוא שונה מהערך הקיים, או אם אין ערך קיים
        if (!accuracyClass || calculatedClass !== accuracyClass) {
          accuracyClass = calculatedClass;
          console.log(`[autoFillMeasurements] Calculated accuracyClass: ${accuracyClass} (n=${n.toFixed(2)}, capacity=${capacity}, e=${e}, unit=${unit})`);
          // נעדכן את ה-state כדי שהערך יהיה זמין גם בפעם הבאה
          setScaleModelFormData(prev => ({
            ...prev,
            accuracy_class: calculatedClass
          }));
        }
      } catch (error) {
        console.warn('Failed to calculate accuracy class:', error);
      }
    }
    // ברירת מחדל ל-Class III אם עדיין אין
    accuracyClass = accuracyClass || 'III';
    
    console.log(`[autoFillMeasurements] Using accuracyClass: ${accuracyClass}, e=${e}, capacity=${capacity}, unit=${unit}`);
    
    // רק אם יש capacity ו-e תקינים, נמלא את המדידות
    if (capacity && e && capacity > 0 && e > 0) {
      // המרת יחידות ל-gram לצורך חישוב
      let capacityInGrams = capacity;
      if (unit === 'kg') capacityInGrams = capacity * 1000;
      if (unit === 'mg') capacityInGrams = capacity / 1000;
      
      let eInGrams = e;
      if (unit === 'kg') eInGrams = e * 1000;
      if (unit === 'mg') eInGrams = e / 1000;

      // יצירת נקודות בדיקה לדיוק לפי OIML R76
      // לדוגמה 15 קג 1 גרם: 0, 0.5, 1, 5, 10, 15 (בקג)
      const testPoints = generateStandardTestPoints(capacityInGrams, 'g', eInGrams);
      // נוסיף את נקודת 0 לתחילת הרשימה (אם היא לא כבר שם)
      let accuracyLoads = testPoints.filter((p: number) => p === 0 || p > 0); // כולל 0
      
      // אם לא נוצרו נקודות מספיק, נוסיף נקודות סטנדרטיות
      if (accuracyLoads.filter((p: number) => p > 0).length < 3) {
        // נקודות אחוזים סטנדרטיות: Min, 10%, 25%, 50%, 75%, Max
        const standardPercentages = [0.1, 0.25, 0.5, 0.75, 1.0];
        const additionalLoads = standardPercentages
          .map(p => capacityInGrams * p)
          .filter(l => l > 0)
          .map(l => Math.round(l / eInGrams) * eInGrams); // עיגול ל-e הקרוב
        
        // נוסיף את 0 אם הוא לא קיים, ואז את שאר הנקודות
        accuracyLoads = [0, ...additionalLoads.filter(l => !accuracyLoads.includes(l))];
      }
      
      // הגבלת מספר נקודות ל-5-8 (כמו בדוגמה)
      const nonZeroLoads = accuracyLoads.filter((p: number) => p > 0);
      if (nonZeroLoads.length > 8) {
        // נבחר נקודות מפוזרות: Min, 25%, 50%, 75%, Max
        const importantIndices = [
          0, // Min
          Math.floor(nonZeroLoads.length * 0.25),
          Math.floor(nonZeroLoads.length * 0.5),
          Math.floor(nonZeroLoads.length * 0.75),
          nonZeroLoads.length - 1 // Max
        ];
        const selectedNonZero = importantIndices
          .map(i => nonZeroLoads[i])
          .filter((val, idx, arr) => arr.indexOf(val) === idx); // הסרת כפילויות
        accuracyLoads = [0, ...selectedNonZero];
      } else {
        // וודא ש-0 תמיד קיים
        if (!accuracyLoads.includes(0)) {
          accuracyLoads = [0, ...accuracyLoads];
        } else {
          // ודא ש-0 הוא הראשון
          accuracyLoads = [0, ...accuracyLoads.filter((p: number) => p > 0)];
        }
      }

      // המרה חזרה ליחידה המקורית
      const convertToOriginalUnit = (valueInGrams: number): number => {
        if (unit === 'kg') return valueInGrams / 1000;
        if (unit === 'mg') return valueInGrams * 1000;
        return valueInGrams;
      };

      // מילוי מדידות דיוק
      const accuracyMeasurements = accuracyLoads.map((loadInGrams) => {
        const load = convertToOriginalUnit(loadInGrams);
        
        // עבור נקודת 0: כל הערכים 0, טולרנס מחושב לפי OIML R76
        if (load === 0 || loadInGrams === 0) {
          // עבור load = 0, נשתמש ב-e כטולרנס מינימלי (לפי OIML R76, עבור m=0, MPE = 0.5e)
          const zeroTolerance = calculateOIMLMPE(e, e, accuracyClass); // משתמש ב-e כעומס מינימלי
          return {
            load: 0,
            reading1: 0,      // קריאה בעליה
            reading2: 0,      // סטיה בעליה = reading1 - load = 0 - 0 = 0
            reading3: 0,      // קריאה בירידה
            average: 0,
            error: 0,         // סטיה בירידה = reading3 - load = 0 - 0 = 0
            tolerance: Math.round(zeroTolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
            pass: true
          };
        }
        
        // חישוב tolerance לפי OIML R76
        const tolerance = calculateOIMLMPE(e, load, accuracyClass);
        console.log(`[autoFillMeasurements] load=${load}, e=${e}, accuracyClass=${accuracyClass}, tolerance=${tolerance}, toleranceFixed=${tolerance.toFixed(3)}`);
        
        // קריאות מדומות - קריאות ריאליות עם סטייה קטנה בתוך הטולרנס
        const randomFactor1 = 0.3 + (Math.random() * 0.2);
        const randomFactor2 = 0.3 + (Math.random() * 0.2);
        const randomFactor3 = 0.3 + (Math.random() * 0.2);
        
        const sign1 = Math.random() > 0.5 ? 1 : -1;
        const sign2 = Math.random() > 0.5 ? 1 : -1;
        const sign3 = Math.random() > 0.5 ? 1 : -1;
        
        const reading1 = load + (sign1 * tolerance * randomFactor1);  // קריאה בעליה
        const reading2 = reading1 - load;  // סטיה בעליה = קריאה בעליה - עומס
        const reading3 = load + (sign3 * tolerance * randomFactor3);  // קריאה בירידה - תמיד בתוך הטולרנס
        
        const average = (reading1 + reading3) / 2;  // ממוצע בין קריאה בעליה וקריאה בירידה
        const error = reading3 - load;  // סטיה בירידה = קריאה בירידה - עומס
        const pass = Math.abs(reading2) <= tolerance && Math.abs(error) <= tolerance;

        return {
          load: parseFloat(load.toFixed(3)),
          reading1: parseFloat(reading1.toFixed(3)),
          reading2: parseFloat(reading2.toFixed(3)),
          reading3: parseFloat(reading3.toFixed(3)),
          average: parseFloat(average.toFixed(3)),
          error: parseFloat(error.toFixed(3)),
            tolerance: Math.round(tolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
          pass
        };
      });

      // מילוי מדידות אי מרכזיות
      // לפי הדוגמה: אי מרכזיות נעשית ב-1/3 מהקיבולת המקסימלית (5 קג מ-15 קג)
      const eccentricityLoadPercent = 0.33; // 1/3 מהקיבולת
      const eccentricityLoadInGrams = capacityInGrams * eccentricityLoadPercent;
      const eccentricityLoad = convertToOriginalUnit(eccentricityLoadInGrams);
      const eccentricityTolerance = calculateOIMLMPE(e, eccentricityLoad, accuracyClass);
      const eccentricityPositions = ['מרכז', 'קדמי ימין', 'קדמי שמאל', 'אחורי ימין', 'אחורי שמאל'];
      const eccentricityMeasurements = eccentricityPositions.map((position) => {
        const isCenter = position === 'מרכז';
        const randomFactor = isCenter 
          ? 0.1 + (Math.random() * 0.1)
          : 0.2 + (Math.random() * 0.3);
        const sign = Math.random() > 0.5 ? 1 : -1;
        
        const reading = eccentricityLoad + (sign * eccentricityTolerance * randomFactor);
        const error = Math.abs(reading - eccentricityLoad);
        const pass = error <= eccentricityTolerance;

        return {
          position,
          load: parseFloat(eccentricityLoad.toFixed(3)),
          reading: parseFloat(reading.toFixed(3)),
          error: parseFloat(error.toFixed(3)),
          tolerance: Math.round(eccentricityTolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
          pass
        };
      });

      // מילוי מדידות הדירות
      // לפי הדוגמה: הדירות נעשית ב-50% מהקיבולת המקסימלית (10 קג מ-15 קג)
      // או ב-2/3 מהקיבולת - נשתמש ב-50% או 2/3, מה שקרוב יותר לכפולה של e
      const repeatabilityLoadPercent = 0.5; // 50% מהקיבולת (או 2/3 = 0.66)
      const repeatabilityLoadInGrams = capacityInGrams * repeatabilityLoadPercent;
      const repeatabilityLoad = convertToOriginalUnit(repeatabilityLoadInGrams);
      const repeatabilityTolerance = calculateOIMLMPE(e, repeatabilityLoad, accuracyClass);
      
      // לפי הדוגמה: 3 קריאות (לא 5) למדידת הדירות
      const baseReading = repeatabilityLoad;
      const readings = Array.from({ length: 3 }, () => {
        // קריאות הדירות צריכות להיות קרובות מאוד זו לזו (הדירות גבוהה)
        const randomFactor = 0.05 + (Math.random() * 0.1); // סטייה קטנה מאוד: 5-15% מהטולרנס
        const sign = Math.random() > 0.5 ? 1 : -1;
        return baseReading + (sign * repeatabilityTolerance * randomFactor);
      });
      
      const average = readings.reduce((sum, r) => sum + r, 0) / readings.length;
      const variance = readings.reduce((sum, r) => sum + Math.pow(r - average, 2), 0) / readings.length;
      const std_dev = Math.sqrt(variance);
      const pass = std_dev <= repeatabilityTolerance;

      const repeatabilityMeasurements = [{
        load: parseFloat(repeatabilityLoad.toFixed(3)),
        readings: readings.map(r => parseFloat(r.toFixed(3))),
        average: parseFloat(average.toFixed(3)),
        std_dev: parseFloat(std_dev.toFixed(3)),
        tolerance: Math.round(repeatabilityTolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
        pass
      }];

      // עדכון המדידות ב-state
      console.log('📊 לפני עדכון state - accuracyMeasurements:', accuracyMeasurements.map(m => ({ 
        load: m.load, 
        tolerance: m.tolerance, 
        toleranceType: typeof m.tolerance,
        toleranceString: String(m.tolerance),
        toleranceFixed3: m.tolerance?.toFixed(3),
        toleranceFixed4: m.tolerance?.toFixed(4)
      })));
      setFormData(prev => ({
        ...prev,
        measurements: {
          accuracy: accuracyMeasurements,
          eccentricity: eccentricityMeasurements,
          repeatability: repeatabilityMeasurements
        }
      }));

      console.log('✅ מדידות מולאו אוטומטית:', {
        capacity,
        e,
        unit,
        accuracyClass,
        accuracyCount: accuracyMeasurements.length,
        eccentricityCount: eccentricityMeasurements.length,
        repeatabilityCount: repeatabilityMeasurements.length,
        toleranceValues: accuracyMeasurements.map(m => ({ load: m.load, tolerance: m.tolerance }))
      });
    }
  }, [
    scaleModelFormData.max_capacity, 
    scaleModelFormData.unit, 
    scaleModelFormData.division_value, 
    scaleModelFormData.divisions, 
    scaleModelFormData.e_value,
    scaleModelFormData.accuracy_class
  ]);

  // Map page names to actual routes for technician
  const pageToRoute: Record<string, string> = {
    'TechnicianDashboard': 'technician',
    'Customers': 'technician/customers',
    'Scales': 'technician/scales',
    'MyCalibrations': 'technician/my-calibrations',
    'NewCalibration': 'technician/new-calibration',
    'CalibrationDetails': 'technician/calibration-details',
  };

  // Helper function to create page URLs
  const createPageUrl = (page: string): string => {
    const params = new URLSearchParams(searchParams);
    
    if (page.includes('?')) {
      const [pathName, query] = page.split('?');
      const route = pageToRoute[pathName] || `technician/${pathName.toLowerCase()}`;
      const pageParams = new URLSearchParams(query);
      pageParams.forEach((value, key) => {
        params.set(key, value);
      });
      return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
    }
    
    const route = pageToRoute[page] || `technician/${page.toLowerCase()}`;
    return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
  };

  const [formData, setFormData] = useState({
    scale_id: '',
    customer_id: '',
    calibration_date: format(new Date(), 'yyyy-MM-dd'),
    temperature: '',
    humidity: '',
    technician_notes: '',
    measurements: {
      accuracy: [] as any[],
      eccentricity: [] as any[],
      repeatability: [] as any[]
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [scalesRes, customersRes] = await Promise.all([
        api.get('/scales'),
        api.get('/customers')
      ]);
      
      // אם יש לקוח נבחר בטופס, נעדכן את scaleFormData
      if (formData.customer_id && !scaleFormData.customerId) {
        setScaleFormData(prev => ({ ...prev, customerId: formData.customer_id }));
      }
      
      // Transform scales
      const transformedScales = (scalesRes.data || []).map((scale: any) => ({
        id: scale.id,
        manufacturer_serial: scale.serialMfg,
        internal_serial: scale.serialInternal,
        manufacturer: scale.model?.manufacturer || scale.manufacturer || '',
        model: scale.model?.modelName || scale.modelName || '',
        customer_id: scale.customerId || scale.site?.customerId,
        max_capacity: scale.model?.maxCapacity || null,
        unit: scale.model?.unit || null,
        accuracy_class: scale.model?.accuracyClass || null,
      }));
      
      setScales(transformedScales);
      setCustomers(customersRes.data || []);

      if (preselectedScaleId) {
        const scale = transformedScales.find((s: ScaleData) => s.id === preselectedScaleId);
        if (scale) {
          handleScaleSelect(scale.id, scale);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScaleSelect = (scaleId: string, scaleData: ScaleData | null = null) => {
    const scale = scaleData || scales.find(s => s.id === scaleId);
    if (!scale) return;

    setSelectedScale(scale);
    setFormData(prev => ({
      ...prev,
      scale_id: scaleId,
      customer_id: scale.customer_id || ''
    }));
  };


  const calculateResults = (measurements: any) => {
    // Calculate accuracy
    const accuracy = measurements.accuracy.map((row: any) => {
      // עבור נקודת 0: כל הערכים 0
      if (row.load === 0) {
        return {
          ...row,
          reading1: row.reading1 ?? 0,
          reading2: 0,  // סטיה בעליה = reading1 - load = 0 - 0 = 0
          reading3: row.reading3 ?? 0,
          average: 0,
          error: 0,  // סטיה בירידה = reading3 - load = 0 - 0 = 0
          pass: true
        };
      }

      // אם יש קריאה בעליה, חשב סטיה בעליה
      if (row.reading1 !== null && row.reading1 !== undefined) {
        row.reading2 = row.reading1 - row.load;  // סטיה בעליה = קריאה בעליה - עומס
      }
      
      // אם יש קריאה בירידה, חשב סטיה בירידה וממוצע
      if (row.reading1 !== null && row.reading1 !== undefined && row.reading3 !== null && row.reading3 !== undefined) {
        const average = (row.reading1 + row.reading3) / 2;  // ממוצע בין קריאה בעליה וקריאה בירידה
        const error = row.reading3 - row.load;  // סטיה בירידה = קריאה בירידה - עומס
        const pass = Math.abs(row.reading2) <= row.tolerance && Math.abs(error) <= row.tolerance;
        return { ...row, average, error, pass };
      }

      // אם יש רק חלק מהקריאות, עדכן מה שאפשר
      if (row.reading1 !== null && row.reading1 !== undefined) {
        const pass = Math.abs(row.reading2) <= row.tolerance;
        return { ...row, pass };
      }

      return row;
    });

    // Calculate eccentricity
    const eccentricity = measurements.eccentricity.map((row: any) => {
      if (row.reading === null) return row;
      const error = Math.abs(row.reading - row.load);
      const pass = error <= row.tolerance;
      return { ...row, error, pass };
    });

    // Calculate repeatability
    const repeatability = measurements.repeatability.map((row: any) => {
      const readings = (row.readings || []).filter((r: any) => r !== null);
      if (readings.length < 2) return row;

      const average = readings.reduce((a: number, b: number) => a + b, 0) / readings.length;
      const variance = readings.reduce((sum: number, r: number) => sum + Math.pow(r - average, 2), 0) / (readings.length - 1);
      const std_dev = Math.sqrt(variance);
      const pass = std_dev <= row.tolerance;

      return { ...row, average, std_dev, pass };
    });

    return { accuracy, eccentricity, repeatability };
  };

  const handleMeasurementChange = (type: string, index: number, field: string, value: any) => {
    const newMeasurements = { ...formData.measurements };
    newMeasurements[type as keyof typeof newMeasurements] = [...newMeasurements[type as keyof typeof newMeasurements]];
    (newMeasurements[type as keyof typeof newMeasurements] as any[])[index] = {
      ...(newMeasurements[type as keyof typeof newMeasurements] as any[])[index],
      [field]: value
    };

    // Recalculate results
    const calculated = calculateResults(newMeasurements);
    setFormData(prev => ({
      ...prev,
      measurements: calculated
    }));
  };

  // פונקציה לחישוב MPE לפי OIML R76 Table 6
  // משתמשת בחישוב מקומי מדויק לפי OIML R76
  const calculateOIMLMPE = (e: number, load: number, accuracyClass: string): number => {
    // וודא ש-load ו-e הם מספרים תקינים
    if (!e || e <= 0 || load < 0 || isNaN(load)) {
      console.warn('[calculateOIMLMPE] Invalid input:', { e, load, accuracyClass });
      return 0;
    }
    
    // עבור load = 0, נשתמש ב-e כעומס מינימלי (לפי OIML R76, עבור m=0, MPE = 0.5e)
    const effectiveLoad = load === 0 ? e : load;
    const n = effectiveLoad / e; // מספר החלוקות (m/e)
    
    let mpeInE: 0.5 | 1 | 1.5 = 1.5;
    
    // לפי OIML R76 Table 6
    switch (accuracyClass) {
      case "I":
        if (n <= 50000) mpeInE = 0.5;
        else if (n <= 200000) mpeInE = 1;
        else mpeInE = 1.5;
        break;
      case "II":
        if (n <= 5000) mpeInE = 0.5;
        else if (n <= 20000) mpeInE = 1;
        else if (n <= 100000) mpeInE = 1.5;
        else mpeInE = 1.5; // מעבר ל-100000, נשאר 1.5
        break;
      case "III":
        if (n <= 500) mpeInE = 0.5;
        else if (n <= 2000) mpeInE = 1;
        else if (n <= 10000) mpeInE = 1.5;
        else mpeInE = 1.5; // מעבר ל-10000, נשאר 1.5
        break;
      case "IIII":
        if (n <= 50) mpeInE = 0.5;
        else if (n <= 200) mpeInE = 1;
        else if (n <= 1000) mpeInE = 1.5;
        else mpeInE = 1.5; // מעבר ל-1000, נשאר 1.5
        break;
      default:
        // ברירת מחדל - כמו class III
        if (n <= 500) mpeInE = 0.5;
        else if (n <= 2000) mpeInE = 1;
        else mpeInE = 1.5;
    }
    
    const mpe = mpeInE * e;
    
    // עיגול ל-6 ספרות אחרי הנקודה כדי לשמור על דיוק, ואז נעגל ל-3 ספרות בהצגה
    const rounded = Math.round(mpe * 1000000) / 1000000;
    
    // לוג לבדיקה
    console.log(`[calculateOIMLMPE] e=${e}, load=${load}, effectiveLoad=${effectiveLoad}, n=${n.toFixed(2)}, class=${accuracyClass}, mpeInE=${mpeInE}, mpe=${mpe}, rounded=${rounded}`);
    
    return rounded;
  };

  // פונקציה ליצירת נקודות בדיקה סטנדרטיות לפי OIML R76
  // בהתאם לדוגמה של 15 קג 1 גרם: 0, 0.5, 1, 5, 10, 15
  const generateStandardTestPoints = (capacity: number, unit: string, e: number): number[] => {
    const points: number[] = [0]; // תמיד מתחילים מאפס
    
    // המרה ליחידת בסיס (gram) לחישובים
    let capacityInBaseUnit = capacity;
    let eInBaseUnit = e;
    
    if (unit === "kg") {
      capacityInBaseUnit = capacity * 1000; // המרה ל-gram
      eInBaseUnit = e * 1000; // המרה ל-gram
    } else if (unit === "mg") {
      capacityInBaseUnit = capacity / 1000; // המרה ל-gram
      eInBaseUnit = e / 1000; // המרה ל-gram
    }
    
    // חישוב מספר חלוקות
    const n = capacityInBaseUnit / eInBaseUnit;
    
    // יצירת נקודות בדיקה לפי OIML R76
    // לדוגמה 15 קג 1 גרם (e=1g): 0, 0.5, 1, 5, 10, 15 (בקג)
    // כלומר: 0, 500g, 1000g, 5000g, 10000g, 15000g
    // זה אומר: 0, 500e, 1000e, 5000e, 10000e, 15000e
    
    const candidatePoints: number[] = [];
    
    // עבור משקלות ב-kg עם e קטן (1-10 גרם), נקודות סטנדרטיות הן:
    // 0.5 קג, 1 קג, 2 קג, 5 קג, 10 קג, 15 קג, 20 קג, וכו'
    if (unit === "kg" || (capacityInBaseUnit >= 1000 && eInBaseUnit >= 1)) {
      // נקודות סטנדרטיות ב-kg, מומרות ל-gram
      const standardKiloPoints = [0.5, 1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500];
      
      for (const kgPoint of standardKiloPoints) {
        const pointInGrams = kgPoint * 1000;
        // עיגול לכפולה הקרובה ביותר של e
        const roundedPoint = Math.round(pointInGrams / eInBaseUnit) * eInBaseUnit;
        if (roundedPoint > 0 && roundedPoint <= capacityInBaseUnit) {
          candidatePoints.push(roundedPoint);
        }
      }
    }
    
    // עבור משקלות קטנים ב-gram, נקודות סטנדרטיות הן:
    // 10g, 20g, 50g, 100g, 200g, 500g, 1000g, וכו'
    else if (unit === "g" || (capacityInBaseUnit < 1000 && eInBaseUnit < 1)) {
      const standardGramPoints = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
      
      for (const gramPoint of standardGramPoints) {
        const roundedPoint = Math.round(gramPoint / eInBaseUnit) * eInBaseUnit;
        if (roundedPoint > 0 && roundedPoint <= capacityInBaseUnit) {
          candidatePoints.push(roundedPoint);
        }
      }
    }
    
    // הוספת נקודות לפי אחוזים מהקיבולת (רק אם הן לא כבר קיימות)
    // אחוזים סטנדרטיים: 3.33% (1/30), 6.67% (1/15), 10%, 33.33% (1/3), 50%, 66.67% (2/3), 75%, 100%
    const percentMultipliers = [0.0333, 0.0667, 0.1, 0.333, 0.5, 0.667, 0.75, 1.0];
    for (const pct of percentMultipliers) {
      const point = capacityInBaseUnit * pct;
      const roundedPoint = Math.round(point / eInBaseUnit) * eInBaseUnit;
      if (roundedPoint > 0 && roundedPoint <= capacityInBaseUnit && !candidatePoints.includes(roundedPoint)) {
        candidatePoints.push(roundedPoint);
      }
    }
    
    // הוספת הקיבולת המקסימלית (תמיד)
    const roundedMax = Math.round(capacityInBaseUnit / eInBaseUnit) * eInBaseUnit;
    if (roundedMax > 0 && roundedMax <= capacityInBaseUnit && !candidatePoints.includes(roundedMax)) {
      candidatePoints.push(roundedMax);
    }
    
    // הסרת כפילויות, מיון וסינון
    const uniquePoints = [...new Set(candidatePoints)]
      .filter(p => p >= 0 && p <= capacityInBaseUnit)
      .sort((a, b) => a - b);
    
    // הגבלת מספר נקודות - נבחר את החשובות ביותר
    // עבור 15 קג 1 גרם: 0, 0.5, 1, 5, 10, 15
    if (uniquePoints.length > 8) {
      // נבחר נקודות מפוזרות: 0.5, 1, 5, 10, Max (15)
      const importantPoints: number[] = [];
      
      // נקודות ספציפיות לפי הקיבולת
      if (unit === "kg" || capacityInBaseUnit >= 1000) {
        // עבור משקלות ב-kg: 0.5, 1, 5, 10, Max (לדוגמה 15 קג: 0, 0.5, 1, 5, 10, 15)
        const specificKgPoints = [0.5, 1, 5, 10];
        for (const kgPoint of specificKgPoints) {
          const pointInGrams = kgPoint * 1000;
          const roundedPoint = Math.round(pointInGrams / eInBaseUnit) * eInBaseUnit;
          if (roundedPoint > 0 && roundedPoint <= capacityInBaseUnit) {
            importantPoints.push(roundedPoint);
          }
        }
      } else {
        // עבור משקלות אחרים - אחוזים
        const importantPercentages = [0.0333, 0.0667, 0.333, 0.5, 0.667, 0.75, 1.0];
        for (const pct of importantPercentages) {
          const point = capacityInBaseUnit * pct;
          const roundedPoint = Math.round(point / eInBaseUnit) * eInBaseUnit;
          if (roundedPoint > 0 && roundedPoint <= capacityInBaseUnit && !importantPoints.includes(roundedPoint)) {
            importantPoints.push(roundedPoint);
          }
        }
      }
      
      // הוספת המקסימום
      if (!importantPoints.includes(roundedMax)) {
        importantPoints.push(roundedMax);
      }
      
      return [0, ...importantPoints.sort((a, b) => a - b)];
    }
    
    // המרה חזרה ליחידה המקורית
    if (unit === "kg") {
      return [0, ...uniquePoints.map(p => p / 1000)];
    } else if (unit === "mg") {
      return [0, ...uniquePoints.map(p => p * 1000)];
    }
    
    return [0, ...uniquePoints];
  };

  // פונקציה למילוי אוטומטי של מדידות
  const autoFillMeasurements = () => {
    // קבלת פרמטרים מהדגם או מהשדות
    const capacity = scaleModelFormData.max_capacity ? parseFloat(scaleModelFormData.max_capacity) : 0;
    const unit = scaleModelFormData.unit || 'kg';
    const e = scaleModelFormData.e_value ? parseFloat(scaleModelFormData.e_value) : 0;
    const accuracyClass = scaleModelFormData.accuracy_class || 'III';
    
    if (!capacity || !e) {
      console.warn('Cannot auto-fill: missing capacity or e value');
      return;
    }

    // המרת יחידות ל-gram לצורך חישוב
    let capacityInGrams = capacity;
    if (unit === 'kg') capacityInGrams = capacity * 1000;
    if (unit === 'mg') capacityInGrams = capacity / 1000;
    
    let eInGrams = e;
    if (unit === 'kg') eInGrams = e * 1000;
    if (unit === 'mg') eInGrams = e / 1000;

    // יצירת נקודות בדיקה לדיוק
    const testPoints = generateStandardTestPoints(capacityInGrams, 'g', eInGrams);
    // אם אין נקודות, ניצור נקודות בסיסיות
    // נוסיף את נקודת 0 לתחילת הרשימה
    const nonZeroLoads = testPoints.length > 1 ? testPoints.slice(1).filter((p: number) => p > 0) : [
      capacityInGrams * 0.1,
      capacityInGrams * 0.25,
      capacityInGrams * 0.5,
      capacityInGrams * 0.75,
      capacityInGrams
    ].filter(l => l > 0);
    const accuracyLoads = [0, ...nonZeroLoads];

    // המרה חזרה ליחידה המקורית
    const convertToOriginalUnit = (valueInGrams: number): number => {
      if (unit === 'kg') return valueInGrams / 1000;
      if (unit === 'mg') return valueInGrams * 1000;
      return valueInGrams;
    };

    // מילוי מדידות דיוק
    const accuracyMeasurements = accuracyLoads.map(loadInGrams => {
      const load = convertToOriginalUnit(loadInGrams);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/30140c7b-1d13-4efb-a927-9f6d978ce01a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewCalibration.tsx:1089',message:'autoFillMeasurements - load value after conversion',data:{loadInGrams,load,unit,capacity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // חישוב tolerance לפי OIML R76
      const tolerance = calculateOIMLMPE(e, load, accuracyClass);
      
      // קריאות מדומות - קריאות ריאליות עם סטייה קטנה בתוך הטולרנס
      const randomFactor1 = 0.3 + (Math.random() * 0.2);
      const randomFactor3 = 0.3 + (Math.random() * 0.2);
      
      const sign1 = Math.random() > 0.5 ? 1 : -1;
      const sign3 = Math.random() > 0.5 ? 1 : -1;
      
      const reading1 = load + (sign1 * tolerance * randomFactor1);  // קריאה בעליה
      const reading2 = reading1 - load;  // סטיה בעליה = קריאה בעליה - עומס
      const reading3 = load + (sign3 * tolerance * randomFactor3);  // קריאה בירידה
      
      const average = (reading1 + reading3) / 2;  // ממוצע בין קריאה בעליה וקריאה בירידה
      const error = reading3 - load;  // סטיה בירידה = קריאה בירידה - עומס
      const pass = Math.abs(reading2) <= tolerance && Math.abs(error) <= tolerance;

      return {
        load: parseFloat(load.toFixed(3)),
        reading1: parseFloat(reading1.toFixed(3)),
        reading2: parseFloat(reading2.toFixed(3)),
        reading3: parseFloat(reading3.toFixed(3)),
        average: parseFloat(average.toFixed(3)),
        error: parseFloat(error.toFixed(3)),
            tolerance: Math.round(tolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
        pass
      };
    });

    // מילוי מדידות אי מרכזיות
    const eccentricityLoad = convertToOriginalUnit(capacityInGrams * 0.33);
    const eccentricityTolerance = calculateOIMLMPE(e, eccentricityLoad, accuracyClass);
    const eccentricityPositions = ['מרכז', 'קדמי ימין', 'קדמי שמאל', 'אחורי ימין', 'אחורי שמאל'];
    const eccentricityMeasurements = eccentricityPositions.map(position => {
      // קריאה מדומה - בדרך כלל קרובה לעומס
      const reading = eccentricityLoad;
      const error = Math.abs(reading - eccentricityLoad);
      const pass = error <= eccentricityTolerance;

      return {
        position,
        load: parseFloat(eccentricityLoad.toFixed(3)),
        reading: parseFloat(reading.toFixed(3)),
        error: parseFloat(error.toFixed(3)),
        tolerance: parseFloat(eccentricityTolerance.toFixed(3)),
        pass
      };
    });

    // מילוי מדידות הדירות
    const repeatabilityLoad = convertToOriginalUnit(capacityInGrams * 0.5);
    const repeatabilityTolerance = calculateOIMLMPE(e, repeatabilityLoad, accuracyClass);
    // 5 קריאות זהות (משקל אידיאלי)
    const readings = [repeatabilityLoad, repeatabilityLoad, repeatabilityLoad, repeatabilityLoad, repeatabilityLoad];
    const average = repeatabilityLoad;
    const variance = 0; // כל הקריאות זהות
    const std_dev = 0;
    const pass = std_dev <= repeatabilityTolerance;

    const repeatabilityMeasurements = [{
      load: parseFloat(repeatabilityLoad.toFixed(3)),
      readings: readings.map(r => parseFloat(r.toFixed(3))),
      average: parseFloat(average.toFixed(3)),
      std_dev: parseFloat(std_dev.toFixed(3)),
      tolerance: parseFloat(repeatabilityTolerance.toFixed(3)),
      pass
    }];

    // עדכון הטופס עם המדידות
    setFormData(prev => ({
      ...prev,
      measurements: {
        accuracy: accuracyMeasurements,
        eccentricity: eccentricityMeasurements,
        repeatability: repeatabilityMeasurements
      }
    }));
  };

  const getOverallResult = () => {
    const allTests = [
      ...formData.measurements.accuracy,
      ...formData.measurements.eccentricity,
      ...formData.measurements.repeatability
    ];

    const hasFailures = allTests.some(t => t.pass === false);
    const allPassed = allTests.filter(t => t.pass !== null).every(t => t.pass === true);
    const hasMeasurements = allTests.some(t => t.pass !== null);

    if (!hasMeasurements) return 'PENDING';
    if (hasFailures) return 'FAIL';
    if (allPassed) return 'PASS';
    return 'PENDING';
  };

  const handleSave = async (submit = false) => {
    // בדיקה שהטכנאי הזין את פרטי המשקל
    if (!scaleFormData.manufacturer || !scaleFormData.modelName || (!scaleFormData.serialMfg && !scaleFormData.serialInternal)) {
      alert('נדרש למלא יצרן, דגם ומספר סידורי (לפחות אחד)');
      return;
    }

    if (!formData.customer_id) {
      alert('נדרש לבחור לקוח');
      return;
    }

    if (submit && !formData.calibration_date) {
      alert('נדרש למלא תאריך כיול');
      return;
    }

    if (submit) {
      setSubmitting(true);
    } else {
      setSaving(true);
    }

    try {
      // תמיד נבדוק אם יש משקל קיים עם אותם פרטים (יצרן, דגם, מספר סידורי)
      // אם לא - ניצור משקל חדש מהפרטים שהטכנאי הזין
      let scaleIdToUse = formData.scale_id;
      
      // נבדוק אם יש משקל קיים עם אותם פרטים
      const existingScale = scales.find(s => {
        const serialMatch = scaleFormData.serialMfg 
          ? s.manufacturer_serial === scaleFormData.serialMfg
          : scaleFormData.serialInternal 
          ? s.internal_serial === scaleFormData.serialInternal
          : false;
        
        return s.manufacturer === scaleFormData.manufacturer &&
               s.model === scaleFormData.modelName &&
               serialMatch;
      });

      if (existingScale) {
        scaleIdToUse = existingScale.id;
      } else {
        // יצירת משקל חדש מהפרטים שהטכנאי הזין
        const scaleData = {
          customerId: formData.customer_id,
          siteId: scaleFormData.siteId || null,
          modelId: scaleFormData.modelId || null,
          manufacturer: scaleFormData.manufacturer,
          modelName: scaleFormData.modelName,
          serialMfg: scaleFormData.serialMfg || null,
          serialInternal: scaleFormData.serialInternal || null,
          deviceType: scaleFormData.deviceType || 'electronic'
        };

        const scaleResult = await api.post('/scales', scaleData);
        scaleIdToUse = scaleResult.data.id;
        
        // רענון רשימת המשקלות
        await loadData();
      }

      // תאריך כיול - אם לא הוזן, נשתמש בתאריך הנוכחי
      const testDate = formData.calibration_date || format(new Date(), 'yyyy-MM-dd');

      // שימוש במדידות שכבר מולאו אוטומטית (מ-useEffect)
      // אם המדידות עדיין ריקות, ננסה למלא אותן עכשיו
      let measurementsToSave = formData.measurements || { accuracy: [], eccentricity: [], repeatability: [] };
      
      // בדיקה אם המדידות כבר מולאו (יש קריאות)
      const hasMeasurements = measurementsToSave.accuracy?.some((m: any) => m.reading1 !== null && m.reading1 !== undefined) ||
                               measurementsToSave.eccentricity?.some((m: any) => m.reading !== null && m.reading !== undefined) ||
                               measurementsToSave.repeatability?.some((m: any) => (m.readings || []).some((r: any) => r !== null && r !== undefined));
      
      // רק אם המדידות לא מולאו, ננסה למלא אותן עכשיו
      if (!hasMeasurements) {
        const capacityRaw = scaleModelFormData.max_capacity || formData.max_capacity || '';
        const capacity = capacityRaw ? parseFloat(String(capacityRaw)) : 0;
        const unit = scaleModelFormData.unit || formData.unit || 'kg';
        
        const eValueRaw = scaleModelFormData.e_value || '';
        let e = eValueRaw ? parseFloat(String(eValueRaw)) : 0;
        
        if (!e && capacity) {
          if (scaleModelFormData.division_value) {
            const divisionValue = parseFloat(String(scaleModelFormData.division_value));
            if (divisionValue > 0) {
              let capacityInGrams = capacity;
              if (unit === 'kg') capacityInGrams = capacity * 1000;
              if (unit === 'mg') capacityInGrams = capacity / 1000;
              e = divisionValue;
              if (unit === 'kg') e = divisionValue / 1000;
              if (unit === 'mg') e = divisionValue * 1000;
            }
          } else if (scaleModelFormData.divisions) {
            const divisions = parseFloat(String(scaleModelFormData.divisions));
            if (divisions > 0) {
              let capacityInGrams = capacity;
              if (unit === 'kg') capacityInGrams = capacity * 1000;
              if (unit === 'mg') capacityInGrams = capacity / 1000;
              const eInGrams = capacityInGrams / divisions;
              e = eInGrams;
              if (unit === 'kg') e = eInGrams / 1000;
              if (unit === 'mg') e = eInGrams * 1000;
            }
          }
        }
        
        // חישוב accuracyClass אם לא קיים
        let accuracyClass = scaleModelFormData.accuracy_class || formData.accuracy_class;
        if (!accuracyClass && capacity && e && capacity > 0 && e > 0) {
          // חישוב מקומי של accuracyClass לפי OIML R76
          try {
            const n = calculateN(capacity, e, unit);
            accuracyClass = calculateAccuracyClassFromN(n);
            console.log(`[handleSave] Calculated accuracyClass: ${accuracyClass} (n=${n.toFixed(2)}, capacity=${capacity}, e=${e}, unit=${unit})`);
          } catch (error) {
            console.warn('Failed to calculate accuracy class in handleSave:', error);
          }
        }
        // ברירת מחדל ל-Class III אם עדיין אין
        accuracyClass = accuracyClass || 'III';
        
        console.log(`[handleSave] Using accuracyClass: ${accuracyClass}, e=${e}, capacity=${capacity}, unit=${unit}`);
        
        if (capacity && e && capacity > 0 && e > 0) {
          // המרת יחידות ל-gram לצורך חישוב
          let capacityInGrams = capacity;
          if (unit === 'kg') capacityInGrams = capacity * 1000;
          if (unit === 'mg') capacityInGrams = capacity / 1000;
          
          let eInGrams = e;
          if (unit === 'kg') eInGrams = e * 1000;
          if (unit === 'mg') eInGrams = e / 1000;

          // יצירת נקודות בדיקה לדיוק
          const testPoints = generateStandardTestPoints(capacityInGrams, 'g', eInGrams);
          // נוסיף את נקודת 0 לתחילת הרשימה
          const nonZeroLoads = testPoints.length > 1 ? testPoints.slice(1).filter((p: number) => p > 0) : [
            capacityInGrams * 0.1,
            capacityInGrams * 0.25,
            capacityInGrams * 0.5,
            capacityInGrams * 0.75,
            capacityInGrams
          ].filter(l => l > 0);
          const accuracyLoads = [0, ...nonZeroLoads];

          // המרה חזרה ליחידה המקורית
          const convertToOriginalUnit = (valueInGrams: number): number => {
            if (unit === 'kg') return valueInGrams / 1000;
            if (unit === 'mg') return valueInGrams * 1000;
            return valueInGrams;
          };

          // מילוי מדידות דיוק
          const accuracyMeasurements = accuracyLoads.map((loadInGrams, index) => {
            const load = convertToOriginalUnit(loadInGrams);
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/30140c7b-1d13-4efb-a927-9f6d978ce01a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewCalibration.tsx:1365',message:'save calibration - load value after conversion',data:{loadInGrams,load,unit,capacity,index},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            
            // חישוב tolerance לפי OIML R76
            const tolerance = calculateOIMLMPE(e, load, accuracyClass);
            
            // קריאות מדומות - קריאות ריאליות עם סטייה קטנה בתוך הטולרנס
            // נשתמש בעומס כבסיס ונוסיף סטייה קטנה אקראית (30-50% מהטולרנס)
            const randomFactor1 = 0.3 + (Math.random() * 0.2); // בין 0.3 ל-0.5
            const randomFactor3 = 0.3 + (Math.random() * 0.2);
            
            // סטייה חיובית או שלילית אקראית
            const sign1 = Math.random() > 0.5 ? 1 : -1;
            const sign3 = Math.random() > 0.5 ? 1 : -1;
            
            // קריאות עם סטייה קטנה בתוך הטולרנס
            const reading1 = load + (sign1 * tolerance * randomFactor1);  // קריאה בעליה
            const reading2 = reading1 - load;  // סטיה בעליה = קריאה בעליה - עומס
            const reading3 = load + (sign3 * tolerance * randomFactor3);  // קריאה בירידה
            
            // חישוב ממוצע, שגיאה ו-PASS
            const average = (reading1 + reading3) / 2;  // ממוצע בין קריאה בעליה וקריאה בירידה
            const error = reading3 - load;  // סטיה בירידה = קריאה בירידה - עומס
            const pass = Math.abs(reading2) <= tolerance && Math.abs(error) <= tolerance;

            return {
              load: parseFloat(load.toFixed(3)),
              reading1: parseFloat(reading1.toFixed(3)),
              reading2: parseFloat(reading2.toFixed(3)),
              reading3: parseFloat(reading3.toFixed(3)),
              average: parseFloat(average.toFixed(3)),
              error: parseFloat(error.toFixed(3)),
              tolerance: Math.round(tolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
              pass
            };
          });

          // מילוי מדידות אי מרכזיות
          // מילוי מדידות אי מרכזיות ב-1/3 מהקיבולת המקסימלית (כמו בדוגמה: 5 קג מ-15 קג)
          const eccentricityLoadPercent = 0.33;
          const eccentricityLoadInGrams = capacityInGrams * eccentricityLoadPercent;
          const eccentricityLoad = convertToOriginalUnit(eccentricityLoadInGrams);
          const eccentricityTolerance = calculateOIMLMPE(e, eccentricityLoad, accuracyClass);
          const eccentricityPositions = ['מרכז', 'קדמי ימין', 'קדמי שמאל', 'אחורי ימין', 'אחורי שמאל'];
          const eccentricityMeasurements = eccentricityPositions.map((position, index) => {
            // מרכז - קריאה קרובה מאוד לעומס (סטייה קטנה)
            // מיקומים אחרים - סטייה מעט גדולה יותר אבל עדיין בתוך הטולרנס
            const isCenter = position === 'מרכז';
            const randomFactor = isCenter 
              ? 0.1 + (Math.random() * 0.1) // מרכז: 10-20% מהטולרנס
              : 0.2 + (Math.random() * 0.3); // מיקומים אחרים: 20-50% מהטולרנס
            const sign = Math.random() > 0.5 ? 1 : -1;
            
            const reading = eccentricityLoad + (sign * eccentricityTolerance * randomFactor);
            const error = Math.abs(reading - eccentricityLoad);
            const pass = error <= eccentricityTolerance;

            return {
              position,
              load: parseFloat(eccentricityLoad.toFixed(3)),
              reading: parseFloat(reading.toFixed(3)),
              error: parseFloat(error.toFixed(3)),
              tolerance: Math.round(eccentricityTolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
              pass
            };
          });

          // מילוי מדידות הדירות
          // מילוי מדידות הדירות ב-50% מהקיבולת המקסימלית (כמו בדוגמה: 10 קג מ-15 קג)
          const repeatabilityLoadPercent = 0.5;
          const repeatabilityLoadInGrams = capacityInGrams * repeatabilityLoadPercent;
          const repeatabilityLoad = convertToOriginalUnit(repeatabilityLoadInGrams);
          const repeatabilityTolerance = calculateOIMLMPE(e, repeatabilityLoad, accuracyClass);
          
          // לפי הדוגמה: 3 קריאות (לא 5) למדידת הדירות
          // קריאות הדירות צריכות להיות קרובות מאוד זו לזו (הדירות גבוהה)
          const baseReading = repeatabilityLoad;
          const readings = Array.from({ length: 3 }, () => {
            const randomFactor = 0.05 + (Math.random() * 0.1); // סטייה קטנה מאוד: 5-15% מהטולרנס
            const sign = Math.random() > 0.5 ? 1 : -1;
            return baseReading + (sign * repeatabilityTolerance * randomFactor);
          });
          
          // חישוב ממוצע וסטיית תקן
          const average = readings.reduce((sum, r) => sum + r, 0) / readings.length;
          const variance = readings.reduce((sum, r) => sum + Math.pow(r - average, 2), 0) / readings.length;
          const std_dev = Math.sqrt(variance);
          const pass = std_dev <= repeatabilityTolerance;

          const repeatabilityMeasurements = [{
            load: parseFloat(repeatabilityLoad.toFixed(3)),
            readings: readings.map(r => parseFloat(r.toFixed(3))),
            average: parseFloat(average.toFixed(3)),
            std_dev: parseFloat(std_dev.toFixed(3)),
            tolerance: Math.round(repeatabilityTolerance * 10000) / 10000, // עיגול ל-4 ספרות אחרי הנקודה כדי לשמור על 0.0005
            pass
          }];

          measurementsToSave = {
            accuracy: accuracyMeasurements,
            eccentricity: eccentricityMeasurements,
            repeatability: repeatabilityMeasurements
          };
          
          // חישוב תוצאה כוללת
          const allTests = [
            ...accuracyMeasurements,
            ...eccentricityMeasurements,
            ...repeatabilityMeasurements
          ];
          const allPassed = allTests.every(t => t.pass === true);
          
          console.log('מדידות חושבו אוטומטית ב-handleSave:', measurementsToSave);
        } else {
          console.warn('לא ניתן למלא אוטומטית - חסרים capacity או e:', { capacity, e, unit, accuracyClass });
        }
      }

      // חישוב תוצאה כוללת מהמדידות
      let overallResultToSave = 'PENDING';
      if (measurementsToSave && (
        measurementsToSave.accuracy?.length > 0 ||
        measurementsToSave.eccentricity?.length > 0 ||
        measurementsToSave.repeatability?.length > 0
      )) {
        const allTests = [
          ...(measurementsToSave.accuracy || []),
          ...(measurementsToSave.eccentricity || []),
          ...(measurementsToSave.repeatability || [])
        ];
        const allPassed = allTests.filter((t: any) => t.pass !== null && t.pass !== undefined).every((t: any) => t.pass === true);
        const hasFailures = allTests.some((t: any) => t.pass === false);
        if (hasFailures) {
          overallResultToSave = 'FAIL';
        } else if (allPassed && allTests.some((t: any) => t.pass !== null)) {
          overallResultToSave = 'PASS';
        } else {
          overallResultToSave = 'PENDING';
        }
      }

      console.log('שומר כיול עם מדידות:', {
        hasMeasurements: !!measurementsToSave && (
          (measurementsToSave.accuracy && measurementsToSave.accuracy.length > 0) ||
          (measurementsToSave.eccentricity && measurementsToSave.eccentricity.length > 0) ||
          (measurementsToSave.repeatability && measurementsToSave.repeatability.length > 0)
        ),
        accuracyCount: measurementsToSave?.accuracy?.length || 0,
        eccentricityCount: measurementsToSave?.eccentricity?.length || 0,
        repeatabilityCount: measurementsToSave?.repeatability?.length || 0,
        overallResult: overallResultToSave
      });

      const calibrationDataToSave = {
        customerId: formData.customer_id,
        scaleId: scaleIdToUse,
        testDate: testDate,
        notes: formData.technician_notes,
        measurementsJson: measurementsToSave || { accuracy: [], eccentricity: [], repeatability: [] },
        overallStatus: overallResultToSave
      };

      let currentCalibrationId = calibrationId;
      
      console.log('[NewCalibration] שולח לשרת:', {
        hasMeasurements: !!calibrationDataToSave.measurementsJson,
        accuracyCount: calibrationDataToSave.measurementsJson?.accuracy?.length || 0,
        eccentricityCount: calibrationDataToSave.measurementsJson?.eccentricity?.length || 0,
        repeatabilityCount: calibrationDataToSave.measurementsJson?.repeatability?.length || 0,
        overallResult: overallResultToSave,
        measurementsJson: calibrationDataToSave.measurementsJson,
        measurementsJsonString: JSON.stringify(calibrationDataToSave.measurementsJson, null, 2),
        calibrationId: currentCalibrationId,
        isUpdate: !!currentCalibrationId
      });
      if (currentCalibrationId) {
        console.log('[NewCalibration] מעדכן כיול קיים:', currentCalibrationId);
        const updateResult = await api.put(`/calibrations/${currentCalibrationId}`, calibrationDataToSave);
        console.log('[NewCalibration] כיול עודכן:', {
          id: updateResult.data.id,
          hasMeasurementsJson: !!updateResult.data.measurementsJson,
          measurementsJsonType: typeof updateResult.data.measurementsJson,
          measurementsJson: updateResult.data.measurementsJson,
          measurementsJsonString: updateResult.data.measurementsJson ? JSON.stringify(updateResult.data.measurementsJson).substring(0, 200) : null
        });
      } else {
        console.log('[NewCalibration] יוצר כיול חדש');
        const result = await api.post('/calibrations', calibrationDataToSave);
        console.log('[NewCalibration] כיול נוצר:', {
          id: result.data.id,
          hasMeasurementsJson: !!result.data.measurementsJson,
          measurementsJsonType: typeof result.data.measurementsJson,
          measurementsJson: result.data.measurementsJson,
          measurementsJsonString: result.data.measurementsJson ? JSON.stringify(result.data.measurementsJson).substring(0, 200) : null
        });
        currentCalibrationId = result.data.id;
        setCalibrationId(currentCalibrationId);
      }

      // אם המשתמש הוא אדמין, נאשר ישירות ללא שליחה לאישור
      const isAdmin = user?.role === 'ADMIN';
      
      // אם זה שמירת טיוטה, נשלח אוטומטית לאישור (או נאשר ישירות אם אדמין)
      if (!submit && currentCalibrationId) {
        // עדכון המדידות ב-state (לא קריטי כי אנחנו מנווטים משם)
        setFormData(prev => ({
          ...prev,
          measurements: measurementsToSave
        }));
        
        if (isAdmin) {
          // אדמין מאשר ישירות
          try {
            // קודם נשלח לאישור (כדי לשנות סטטוס ל-SUBMITTED)
            await api.post(`/calibrations/${currentCalibrationId}/submit`);
            // ואז נאשר ישירות
            const approveResponse = await api.post(`/approvals/${currentCalibrationId}/approve`);
            console.log('כיול אושר ישירות על ידי אדמין', approveResponse.data);
            
            // בדיקה אם התעודה נוצרה
            if (approveResponse.data?.certificate) {
              alert(`הכיול נשמר, אושר ותעודה הונפקה אוטומטית!\nמספר תעודה: ${approveResponse.data.certificate.certificateNo}`);
            } else if (approveResponse.data?.certificateError) {
              const errorMsg = approveResponse.data.certificateError;
              const errorDetails = approveResponse.data.certificateErrorDetails || '';
              console.error('שגיאה בהנפקת תעודה:', errorMsg, errorDetails);
              alert(`הכיול נשמר ואושר, אך הייתה בעיה בהנפקת התעודה:\n${errorMsg}\n\nאנא נסה להנפיק את התעודה ידנית מעמוד פרטי הכיול.`);
            } else {
              alert('הכיול נשמר ואושר ישירות');
            }
          } catch (error: any) {
            console.error('שגיאה באישור הכיול:', error);
            const errorMsg = error.response?.data?.error || error.message || 'שגיאה לא ידועה';
            alert(`הכיול נשמר אך יש בעיה באישור:\n${errorMsg}`);
          }
          window.location.href = '/admin';
        } else {
          // טכנאי שולח לאישור
          try {
            await api.post(`/calibrations/${currentCalibrationId}/submit`);
            console.log('כיול נשלח לאישור בהצלחה');
            alert('הכיול נשמר, המדידות חושבו אוטומטית ונשלח לאישור');
          } catch (error: any) {
            console.error('שגיאה בשליחת הכיול לאישור:', error);
            alert('הכיול נשמר אך יש בעיה בשליחה לאישור: ' + (error.response?.data?.error || error.message));
          }
          window.location.href = '/technician';
        }
        return;
      }

      if (submit && currentCalibrationId) {
        if (isAdmin) {
          // אדמין מאשר ישירות
          try {
            // קודם נשלח לאישור (כדי לשנות סטטוס ל-SUBMITTED)
            await api.post(`/calibrations/${currentCalibrationId}/submit`);
            // ואז נאשר ישירות
            const approveResponse = await api.post(`/approvals/${currentCalibrationId}/approve`);
            console.log('כיול אושר ישירות על ידי אדמין', approveResponse.data);
            
            // בדיקה אם התעודה נוצרה
            if (approveResponse.data?.certificate) {
              alert(`הכיול נשמר, אושר ותעודה הונפקה אוטומטית!\nמספר תעודה: ${approveResponse.data.certificate.certificateNo}`);
            } else if (approveResponse.data?.certificateError) {
              const errorMsg = approveResponse.data.certificateError;
              const errorDetails = approveResponse.data.certificateErrorDetails || '';
              console.error('שגיאה בהנפקת תעודה:', errorMsg, errorDetails);
              alert(`הכיול נשמר ואושר, אך הייתה בעיה בהנפקת התעודה:\n${errorMsg}\n\nאנא נסה להנפיק את התעודה ידנית מעמוד פרטי הכיול.`);
            } else {
              alert('הכיול נשמר ואושר ישירות');
            }
            window.location.href = '/admin';
          } catch (error: any) {
            console.error('שגיאה באישור הכיול:', error);
            const errorMsg = error.response?.data?.error || error.message || 'שגיאה לא ידועה';
            alert(`הכיול נשמר אך יש בעיה באישור:\n${errorMsg}`);
            window.location.href = '/admin';
          }
        } else {
          // טכנאי שולח לאישור
          await api.post(`/calibrations/${currentCalibrationId}/submit`);
          window.location.href = '/technician';
        }
      }
    } catch (error: any) {
      console.error('Error saving calibration:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת הכיול');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const getCustomerName = (customerId?: string | null) => {
    if (!customerId) return '';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || '';
  };

  const handleSaveCustomer = async () => {
    if (!newCustomerData.name.trim()) {
      alert('נדרש שם לקוח');
      return;
    }
    if (!newCustomerData.taxId.trim()) {
      alert('נדרש ח.פ/ע.מ');
      return;
    }
    // ולידציה לח.פ/ע.מ - מספרי בלבד, בדיוק 9 ספרות
    const taxIdClean = newCustomerData.taxId.trim().replace(/-/g, '');
    if (!/^\d{9}$/.test(taxIdClean)) {
      alert('ח.פ/ע.מ חייב להכיל בדיוק 9 ספרות מספריות');
      return;
    }
    if (!newCustomerData.contact.trim()) {
      alert('נדרש איש קשר');
      return;
    }
    if (!newCustomerData.phone.trim()) {
      alert('נדרש טלפון');
      return;
    }
    // ולידציה לטלפון - מספרי בלבד, 3 ספרות קידומת + 7 ספרות (10 ספרות סה"כ)
    const phoneClean = newCustomerData.phone.trim().replace(/-/g, '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(phoneClean)) {
      alert('טלפון חייב להכיל בדיוק 10 ספרות מספריות (3 ספרות קידומת + 7 ספרות)');
      return;
    }
    if (!newCustomerData.address.trim()) {
      alert('נדרש כתובת');
      return;
    }

    setSavingCustomer(true);
    try {
      // ניקוי ח.פ/ע.מ וטלפון (הסרת מקפים ורווחים)
      const taxIdClean = newCustomerData.taxId.trim().replace(/-/g, '');
      const phoneClean = newCustomerData.phone.trim().replace(/-/g, '').replace(/\s/g, '');
      
      const customerResult = await api.post('/customers', {
        name: newCustomerData.name.trim(),
        taxId: taxIdClean,
        address: newCustomerData.address.trim(),
        contact: newCustomerData.contact.trim(),
        phone: phoneClean
      });
      
      // רענון רשימת הלקוחות
      await loadData();
      
      // בחירת הלקוח החדש
      if (customerResult.data?.id) {
        setFormData(prev => ({ ...prev, customer_id: customerResult.data.id }));
        setScaleFormData(prev => ({ ...prev, customerId: customerResult.data.id }));
        setCustomerSearchTerm(customerResult.data.name);
      }
      
      // איפוס השדות וסגירת הדיאלוג
      setNewCustomerData({
        name: '',
        taxId: '',
        address: '',
        contact: '',
        phone: ''
      });
      setCustomerDialogOpen(false);
      
      alert('לקוח נוסף בהצלחה!');
    } catch (error: any) {
      console.error('Error saving customer:', error);
      const errorMessage = error.response?.data?.error || error.message || 'שגיאה ביצירת לקוח';
      
      // הצגת הודעת שגיאה ברורה יותר
      if (error.response?.status === 409) {
        // לקוח כבר קיים - נציג הודעה ברורה
        alert(`שגיאה: ${errorMessage}\n\nהלקוח כבר קיים במערכת. נא לחפש אותו ברשימת הלקוחות.`);
      } else if (error.response?.status === 403 || error.response?.status === 401) {
        alert('אין הרשאה ליצירת לקוח חדש. נא לפנות למנהל המערכת.');
      } else if (error.response?.status === 400) {
        alert(`שגיאה: ${errorMessage}`);
      } else {
        alert(`שגיאה ביצירת לקוח: ${errorMessage}`);
      }
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSaveScaleModel = async () => {
    if (!scaleModelFormData.manufacturer || !scaleModelFormData.model_name) {
      alert('נדרש יצרן ושם דגם');
      return;
    }

    setSavingModel(true);
    try {
      const data = {
        manufacturer: scaleModelFormData.manufacturer === 'אחר' 
          ? scaleModelFormData.manufacturer_custom 
          : scaleModelFormData.manufacturer,
        modelName: scaleModelFormData.model_name,
        maxCapacity: scaleModelFormData.max_capacity ? parseFloat(scaleModelFormData.max_capacity) : 0,
        unit: scaleModelFormData.unit,
        d: scaleModelFormData.d_value ? parseFloat(scaleModelFormData.d_value) : 0,
        e: scaleModelFormData.e_value ? parseFloat(scaleModelFormData.e_value) : 0,
        accuracyClass: scaleModelFormData.accuracy_class,
      };

      await api.post('/scale-models', data);
      
      // רענון רשימת המשקלות והפרופילים
      await loadData();
      
      // איפוס השדות אחרי שמירה מוצלחת
      setScaleModelDialogOpen(false);
      setScaleModelFormData({
        manufacturer: '',
        manufacturer_custom: '',
        model_name: '',
        device_type: 'electronic',
        max_capacity: '',
        unit: 'kg',
        division_value: '',
        divisions: '',
        d_value: '',
        e_value: '',
        accuracy_class: 'III'
      });
      
      alert('דגם נוסף בהצלחה!');
    } catch (error: any) {
      console.error('Error saving scale model:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת דגם');
    } finally {
      setSavingModel(false);
    }
  };

  const handleSaveScale = async () => {
    if (!scaleFormData.customerId || (!scaleFormData.serialMfg && !scaleFormData.serialInternal)) {
      alert('נדרש לקוח ומספר סידורי (יצרן או פנימי)');
      return;
    }

    setSavingScale(true);
    try {
      const data = {
        customerId: scaleFormData.customerId,
        siteId: scaleFormData.siteId || null,
        modelId: scaleFormData.modelId || null,
        manufacturer: scaleFormData.manufacturer || null,
        modelName: scaleFormData.modelName || null,
        serialMfg: scaleFormData.serialMfg || null,
        serialInternal: scaleFormData.serialInternal || null,
        deviceType: scaleFormData.deviceType || 'electronic'
      };

      const result = await api.post('/scales', data);
      
      // רענון רשימת המשקלות
      await loadData();
      
      // בחירת המשקל החדש
      if (result.data?.id) {
        handleScaleSelect(result.data.id);
      }
      
      setScaleDialogOpen(false);
      setScaleFormData({
        customerId: formData.customer_id || '',
        siteId: '',
        modelId: '',
        manufacturer: '',
        modelName: '',
        serialMfg: '',
        serialInternal: '',
        deviceType: 'electronic'
      });
      
      alert('משקל נוסף בהצלחה!');
    } catch (error: any) {
      console.error('Error saving scale:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת משקל');
    } finally {
      setSavingScale(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleSave(false)}
              disabled={saving || !scaleFormData.manufacturer || !scaleFormData.modelName || !formData.customer_id}
            >
              <Save className="h-4 w-4 ml-2" />
              {saving ? 'שומר...' : 'שמור טיוטה'}
            </Button>
            <Button 
              onClick={() => handleSave(true)}
              disabled={submitting || !scaleFormData.manufacturer || !scaleFormData.modelName || !formData.customer_id || !formData.calibration_date || getOverallResult() === 'PENDING'}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              <Send className="h-4 w-4 ml-2" />
              {submitting ? 'שולח...' : 'שלח לאישור'}
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('TechnicianDashboard')}>
              <Button variant="ghost" size="sm" className="text-slate-500">
                <ArrowRight className="h-4 w-4 ml-1" />
                חזרה ללוח הבקרה
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <FileCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">כיול חדש</h1>
                <p className="text-slate-500 mt-1">מילוי נתוני כיול למשקל</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Measurements Panel - Left Side (2 columns) */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
            <Tabs defaultValue="accuracy" dir="rtl">
              <div className="border-b border-slate-100">
                <TabsList className="w-full justify-start p-0 h-auto bg-transparent">
                  <TabsTrigger 
                    value="accuracy" 
                    className="px-6 py-4 data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    דיוק (Accuracy)
                  </TabsTrigger>
                  <TabsTrigger 
                    value="eccentricity"
                    className="px-6 py-4 data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    אי מרכזיות (Eccentricity)
                  </TabsTrigger>
                  <TabsTrigger 
                    value="repeatability"
                    className="px-6 py-4 data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    הדירות (Repeatability)
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="accuracy" className="m-0">
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">בדיקת דיוק</h3>
                  <MeasurementTable
                    type="accuracy"
                    measurements={formData.measurements.accuracy}
                    onMeasurementChange={(index, field, value) => handleMeasurementChange('accuracy', index, field, value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="eccentricity" className="m-0">
                <div className="p-6">
                  <MeasurementTable
                    type="eccentricity"
                    measurements={formData.measurements.eccentricity}
                    onMeasurementChange={(index, field, value) => handleMeasurementChange('eccentricity', index, field, value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="repeatability" className="m-0">
                <div className="p-6">
                  <MeasurementTable
                    type="repeatability"
                    measurements={formData.measurements.repeatability}
                    onMeasurementChange={(index, field, value) => handleMeasurementChange('repeatability', index, field, value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Settings Panel - Right Side (1 column) */}
        <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">פרטי כיול</h2>
          </div>
          <div className="p-6 space-y-4">
            {/* שדות משולבים: פרטי המשקל ודגם משקל */}
            <div className="p-4 border border-violet-200 rounded-lg bg-violet-50/50">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">פרטי המשקל (כפי שמופיע בשטח) *</h3>
              
              <div className="space-y-4">
                {/* שורה ראשונה: יצרן ודגם */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">יצרן *</Label>
                    <Select 
                      value={scaleModelFormData.manufacturer || scaleFormData.manufacturer} 
                      onValueChange={(value) => {
                        const manufacturerValue = value === 'אחר' ? scaleModelFormData.manufacturer_custom || scaleFormData.manufacturer : value;
                        setScaleModelFormData({ ...scaleModelFormData, manufacturer: value });
                        setScaleFormData({ ...scaleFormData, manufacturer: manufacturerValue });
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="בחר יצרן" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A&D">A&D</SelectItem>
                        <SelectItem value="Mettler Toledo">Mettler Toledo</SelectItem>
                        <SelectItem value="Ohaus">Ohaus</SelectItem>
                        <SelectItem value="Rice Lake">Rice Lake</SelectItem>
                        <SelectItem value="Sartorius">Sartorius</SelectItem>
                        <SelectItem value="Kern">Kern</SelectItem>
                        <SelectItem value="Tanita">Tanita</SelectItem>
                        <SelectItem value="אחר">אחר</SelectItem>
                      </SelectContent>
                    </Select>
                    {scaleModelFormData.manufacturer === 'אחר' && (
                      <Input
                        className="mt-2 h-10"
                        placeholder="הזן שם יצרן"
                        value={scaleModelFormData.manufacturer_custom}
                        onChange={(e) => {
                          setScaleModelFormData({ ...scaleModelFormData, manufacturer_custom: e.target.value });
                          setScaleFormData({ ...scaleFormData, manufacturer: e.target.value });
                        }}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">דגם *</Label>
                    <Input
                      value={scaleModelFormData.model_name || scaleFormData.modelName}
                      onChange={(e) => {
                        setScaleModelFormData({ ...scaleModelFormData, model_name: e.target.value });
                        setScaleFormData({ ...scaleFormData, modelName: e.target.value });
                      }}
                      placeholder="לדוגמה: GX-30K"
                      className="h-10"
                    />
                  </div>
                </div>

                {/* מספרים סידוריים */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">מספר סידורי יצרן</Label>
                    <Input
                      value={scaleFormData.serialMfg}
                      onChange={(e) => setScaleFormData({ ...scaleFormData, serialMfg: e.target.value })}
                      placeholder="מספר סידורי מהיצרן"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">מספר סידורי פנימי</Label>
                    <Input
                      value={scaleFormData.serialInternal}
                      onChange={(e) => setScaleFormData({ ...scaleFormData, serialInternal: e.target.value })}
                      placeholder="מספר סידורי פנימי"
                      className="h-10"
                    />
                  </div>
                </div>
                
                <p className="text-xs text-slate-500 mt-2">
                  * יש למלא לפחות אחד מהמספרים הסידוריים
                </p>

                {/* סוג מכשיר */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">סוג מכשיר</Label>
                  <Input
                    value="אלקטרוני"
                    readOnly
                    className="bg-slate-50 h-10 cursor-not-allowed"
                  />
                </div>

                {/* כושר העמסה ויחידה */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">כושר העמסה *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={scaleModelFormData.max_capacity}
                      onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, max_capacity: e.target.value })}
                      placeholder="לדוגמה: 15"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">יחידה</Label>
                    <Select 
                      value={scaleModelFormData.unit} 
                      onValueChange={(value) => setScaleModelFormData({ ...scaleModelFormData, unit: value })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="mg">mg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* שורה נוספת: ערך חלוקה או מספר חלוקות */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      ערך חלוקה (אופציונלי)
                      <span className="text-xs text-slate-500 font-normal mr-2">- לדוגמה: 1 (למשקל עם חלוקה של 1 גרם)</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={scaleModelFormData.division_value}
                      onChange={(e) => {
                        setScaleModelFormData({ 
                          ...scaleModelFormData, 
                          division_value: e.target.value,
                          divisions: ''
                        });
                      }}
                      placeholder="הזן ערך חלוקה בגרמים"
                      className="h-10"
                    />
                    <p className="text-xs text-slate-500">
                      הערה: ערך חלוקה תמיד ביחידת גרם (gram)
                    </p>
                  </div>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200"></span>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-500">או</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      מספר חלוקות (אופציונלי)
                      <span className="text-xs text-slate-500 font-normal mr-2">- לדוגמה: 15000</span>
                    </Label>
                    <Input
                      type="number"
                      step="1"
                      value={scaleModelFormData.divisions}
                      onChange={(e) => {
                        setScaleModelFormData({ 
                          ...scaleModelFormData, 
                          divisions: e.target.value,
                          division_value: ''
                        });
                      }}
                      placeholder="הזן מספר חלוקות ישירות"
                      className="h-10"
                    />
                  </div>
                </div>

                {/* רמת דיוק (מחושבת אוטומטית) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">רמת דיוק</Label>
                    {scaleModelFormData.max_capacity && scaleModelFormData.e_value && (
                      <span className="text-xs text-violet-600 font-medium">
                        💡 מחושב אוטומטית
                      </span>
                    )}
                  </div>
                  <Input
                    value={scaleModelFormData.accuracy_class || 'III'}
                    readOnly
                    className="bg-violet-50 h-10 cursor-not-allowed font-semibold text-violet-700"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    רמת דיוק מחושבת אוטומטית לפי: n = כושר העמסה / e | לפי תקן OIML R76
                  </p>
                </div>

                {/* ערך e ו-d */}
                {scaleModelFormData.e_value && scaleModelFormData.d_value && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        ערך e
                        <span className="text-xs text-violet-600 font-normal">(חושב אוטומטית)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={scaleModelFormData.e_value}
                        onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, e_value: e.target.value })}
                        className="h-10 bg-violet-50"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        הערה: הסטייה המותרת (MPE) מחושבת לפי תקן OIML R76 ויכולה להיות קטנה מ-e בעומסים נמוכים (0.5e, 1e, או 1.5e בהתאם לעומס)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        ערך d
                        <span className="text-xs text-violet-600 font-normal">(חושב אוטומטית)</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={scaleModelFormData.d_value}
                        onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, d_value: e.target.value })}
                        className="h-10 bg-violet-50"
                      />
                    </div>
                  </div>
                )}

              </div>
            </div>

            <div className="space-y-2">
              <Label>לקוח *</Label>
              <div className="relative">
                <Input
                  type="text"
                  value={customerSearchTerm}
                  onChange={(e) => {
                    const searchValue = e.target.value;
                    setCustomerSearchTerm(searchValue);
                    setCustomerDropdownOpen(true);
                    // אם המשתמש מוחק את הטקסט, ננקה את הבחירה
                    if (!searchValue) {
                      setFormData({ ...formData, customer_id: '' });
                      setScaleFormData(prev => ({ ...prev, customerId: '' }));
                    }
                  }}
                  onFocus={() => {
                    // כשפותחים את השדה, נציג את שם הלקוח הנבחר או נשאיר ריק לחיפוש
                    if (formData.customer_id && !customerSearchTerm) {
                      const selectedCustomer = customers.find(c => c.id === formData.customer_id);
                      if (selectedCustomer) {
                        setCustomerSearchTerm(selectedCustomer.name);
                      }
                    }
                    setCustomerDropdownOpen(true);
                  }}
                  onBlur={() => {
                    // נסגור את ה-dropdown אחרי קצת זמן כדי לאפשר לחיצה על פריט
                    setTimeout(() => setCustomerDropdownOpen(false), 200);
                  }}
                  placeholder="חפש או בחר לקוח..."
                  className="h-10"
                />
                {customerDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {/* כפתור הוספת לקוח חדש */}
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCustomerDialogOpen(true);
                        setCustomerDropdownOpen(false);
                      }}
                      className="px-4 py-2 cursor-pointer hover:bg-violet-100 border-b border-slate-200 bg-violet-50/50 transition-colors flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4 text-violet-600" />
                      <span className="text-violet-600 font-medium">הוסף לקוח חדש</span>
                    </div>
                    
                    {/* רשימת לקוחות */}
                    {customers.length > 0 && (
                      <>
                        {customers
                          .filter(customer => 
                            !customerSearchTerm || 
                            customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                          )
                          .map((customer) => (
                            <div
                              key={customer.id}
                              onMouseDown={(e) => {
                                // משתמשים ב-onMouseDown במקום onClick כדי למנוע onBlur
                                e.preventDefault();
                                setFormData({ ...formData, customer_id: customer.id });
                                setScaleFormData(prev => ({ ...prev, customerId: customer.id }));
                                setCustomerSearchTerm(customer.name);
                                setCustomerDropdownOpen(false);
                              }}
                              className={`px-4 py-2 cursor-pointer hover:bg-violet-50 transition-colors ${
                                formData.customer_id === customer.id ? 'bg-violet-100 font-medium' : ''
                              }`}
                            >
                              {customer.name}
                            </div>
                          ))}
                        {customers.filter(customer => 
                          !customerSearchTerm || 
                          customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                        ).length === 0 && customerSearchTerm && (
                          <div className="px-4 py-2 text-sm text-slate-500 text-center">
                            לא נמצאו לקוחות התואמים לחיפוש
                          </div>
                        )}
                      </>
                    )}
                    
                    {customers.length === 0 && !customerSearchTerm && (
                      <div className="px-4 py-2 text-sm text-slate-500 text-center">
                        אין לקוחות. לחץ על "הוסף לקוח חדש" כדי ליצור לקוח
                      </div>
                    )}
                  </div>
                )}
              </div>
              {formData.customer_id && (
                <p className="text-xs text-slate-500">
                  ✓ נבחר: {customers.find(c => c.id === formData.customer_id)?.name}
                </p>
              )}
            </div>

            <div>
              <Label className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                תאריך כיול *
              </Label>
              <Input
                type="date"
                value={formData.calibration_date}
                onChange={(e) => setFormData({ ...formData, calibration_date: e.target.value })}
                required
                className="h-10"
              />
            </div>

            <div>
              <Label>הערות טכנאי</Label>
              <Textarea
                value={formData.technician_notes}
                onChange={(e) => setFormData({ ...formData, technician_notes: e.target.value })}
                rows={3}
                placeholder="הזן הערות נוספות..."
              />
            </div>

            {/* כפתורי פעולה - שמור טיוטה ושלח לאישור */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <Button 
                variant="outline" 
                onClick={() => handleSave(false)}
                disabled={saving || !scaleFormData.manufacturer || !scaleFormData.modelName || !formData.customer_id}
                className="flex-1"
              >
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'שומר...' : 'שמור טיוטה'}
              </Button>
              <Button 
                onClick={() => handleSave(true)}
                disabled={submitting || !scaleFormData.manufacturer || !scaleFormData.modelName || !formData.customer_id || !formData.calibration_date || getOverallResult() === 'PENDING'}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
              >
                <Send className="h-4 w-4 ml-2" />
                {submitting ? 'שולח...' : 'שלח לאישור'}
              </Button>
            </div>

            {/* Overall Result */}
            <Button 
              variant="outline" 
              className={`w-full justify-start ${
                getOverallResult() === 'PASS' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' :
                getOverallResult() === 'FAIL' ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' :
                'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              disabled
            >
              <AlertCircle className={`h-4 w-4 ml-2 ${
                getOverallResult() === 'PASS' ? 'text-emerald-600' :
                getOverallResult() === 'FAIL' ? 'text-red-600' :
                'text-slate-400'
              }`} />
              {getOverallResult() === 'PASS' ? 'כל הבדיקות עברו בהצלחה' :
               getOverallResult() === 'FAIL' ? 'נמצאו כשלים בבדיקות' :
               'ממתין למדידות'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Dialog להוספת לקוח חדש */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת לקוח חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-6">
            <div>
              <Label className="text-sm font-medium text-slate-700">שם לקוח *</Label>
              <Input
                value={newCustomerData.name}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                placeholder="הזן שם לקוח"
                className="h-10 mt-2"
                required
              />
            </div>
            
              <div>
              <Label className="text-sm font-medium text-slate-700">ח.פ/ע.מ *</Label>
                <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{9}"
                maxLength={9}
                value={newCustomerData.taxId}
                onChange={(e) => {
                  // רק מספרים
                  const value = e.target.value.replace(/[^\d]/g, '').slice(0, 9);
                  setNewCustomerData({ ...newCustomerData, taxId: value });
                }}
                placeholder="הזן 9 ספרות (לדוגמה: 123456789)"
                  className="h-10 mt-2"
                required
                />
              <p className="text-xs text-slate-500 mt-1">ח.פ/ע.מ חייב להכיל בדיוק 9 ספרות מספריות</p>
              </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">טלפון *</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={newCustomerData.phone}
                  onChange={(e) => {
                    // רק מספרים
                    const value = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                    setNewCustomerData({ ...newCustomerData, phone: value });
                  }}
                  placeholder="הזן 10 ספרות (לדוגמה: 0501234567)"
                  className="h-10 mt-2"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">3 ספרות קידומת + 7 ספרות (סה"כ 10 ספרות)</p>
              </div>
            <div>
                <Label className="text-sm font-medium text-slate-700">איש קשר *</Label>
              <Input
                  value={newCustomerData.contact}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, contact: e.target.value })}
                  placeholder="הזן שם איש קשר"
                className="h-10 mt-2"
                  required
              />
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium text-slate-700">כתובת *</Label>
              <Textarea
                value={newCustomerData.address}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, address: e.target.value })}
                placeholder="הזן כתובת"
                className="mt-2"
                rows={3}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCustomerDialogOpen(false);
              setNewCustomerData({
                name: '',
                taxId: '',
                address: '',
                contact: '',
                phone: ''
              });
            }}>
              ביטול
            </Button>
            <Button 
              onClick={handleSaveCustomer}
              disabled={
                !newCustomerData.name.trim() || 
                !newCustomerData.taxId.trim() || 
                newCustomerData.taxId.trim().replace(/[^\d]/g, '').length !== 9 ||
                !newCustomerData.contact.trim() || 
                !newCustomerData.phone.trim() || 
                newCustomerData.phone.trim().replace(/[^\d]/g, '').length !== 10 ||
                !newCustomerData.address.trim() || 
                savingCustomer
              }
              className="bg-violet-600 hover:bg-violet-700"
            >
              {savingCustomer ? 'שומר...' : 'שמור לקוח'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog להוספת דגם חדש */}
      <Dialog open={scaleModelDialogOpen} onOpenChange={setScaleModelDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת דגם חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-6 overflow-y-auto flex-1">
            {/* שורה ראשונה: שם דגם ויצרן */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">שם דגם *</Label>
                <Input
                  value={scaleModelFormData.model_name}
                  onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, model_name: e.target.value })}
                  placeholder="לדוגמה: GX-30K"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">יצרן *</Label>
                <Select 
                  value={scaleModelFormData.manufacturer} 
                  onValueChange={(value) => setScaleModelFormData({ ...scaleModelFormData, manufacturer: value })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="בחר יצרן" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A&D">A&D</SelectItem>
                    <SelectItem value="Mettler Toledo">Mettler Toledo</SelectItem>
                    <SelectItem value="Ohaus">Ohaus</SelectItem>
                    <SelectItem value="Rice Lake">Rice Lake</SelectItem>
                    <SelectItem value="Sartorius">Sartorius</SelectItem>
                    <SelectItem value="Kern">Kern</SelectItem>
                    <SelectItem value="Tanita">Tanita</SelectItem>
                    <SelectItem value="אחר">אחר</SelectItem>
                  </SelectContent>
                </Select>
                {scaleModelFormData.manufacturer === 'אחר' && (
                  <Input
                    className="mt-2 h-10"
                    placeholder="הזן שם יצרן"
                    value={scaleModelFormData.manufacturer_custom}
                    onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, manufacturer_custom: e.target.value })}
                  />
                )}
              </div>
            </div>

            {/* שורה שנייה: סוג מכשיר */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">סוג מכשיר</Label>
              <Input
                value="אלקטרוני"
                readOnly
                className="bg-slate-50 h-10 cursor-not-allowed"
              />
            </div>

            {/* שורה שלישית: כושר העמסה ויחידה */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">כושר העמסה *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={scaleModelFormData.max_capacity}
                  onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, max_capacity: e.target.value })}
                  placeholder="לדוגמה: 15"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">יחידה</Label>
                <Select 
                  value={scaleModelFormData.unit} 
                  onValueChange={(value) => setScaleModelFormData({ ...scaleModelFormData, unit: value })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="mg">mg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* שורה נוספת: ערך חלוקה או מספר חלוקות (אופציונלי) */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  ערך חלוקה (אופציונלי)
                  <span className="text-xs text-slate-500 font-normal mr-2">- לדוגמה: 1 (למשקל עם חלוקה של 1 גרם)</span>
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={scaleModelFormData.division_value}
                  onChange={(e) => {
                    setScaleModelFormData({ 
                      ...scaleModelFormData, 
                      division_value: e.target.value,
                      divisions: '' // נקה מספר חלוקות כשמזינים ערך חלוקה
                    });
                  }}
                  placeholder="הזן ערך חלוקה בגרמים (למשל: 1, 0.5, 0.1)"
                  className="h-10"
                />
                <p className="text-xs text-slate-500">
                  הערה: ערך חלוקה תמיד ביחידת גרם (gram). המערכת תחשב אוטומטית: מספר חלוקות = כושר העמסה (בגרמים) / ערך חלוקה (בגרמים)
                </p>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">או</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  מספר חלוקות (אופציונלי)
                  <span className="text-xs text-slate-500 font-normal mr-2">- לדוגמה: 15000</span>
                </Label>
                <Input
                  type="number"
                  step="1"
                  value={scaleModelFormData.divisions}
                  onChange={(e) => {
                    setScaleModelFormData({ 
                      ...scaleModelFormData, 
                      divisions: e.target.value,
                      division_value: '' // נקה ערך חלוקה כשמזינים מספר חלוקות
                    });
                  }}
                  placeholder="הזן מספר חלוקות ישירות"
                  className="h-10"
                />
                <p className="text-xs text-slate-500">
                  אם תזין מספר חלוקות, המערכת תחשב את e אוטומטית לפי: e = כושר העמסה / מספר חלוקות
                </p>
              </div>
            </div>

            {/* שורה רביעית: רמת דיוק (מחושבת אוטומטית) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700">רמת דיוק</Label>
                {scaleModelFormData.max_capacity && scaleModelFormData.e_value && (
                  <span className="text-xs text-violet-600 font-medium">
                    💡 מחושב אוטומטית
                  </span>
                )}
              </div>
              <Input
                value={scaleModelFormData.accuracy_class || 'III'}
                readOnly
                className="bg-violet-50 h-10 cursor-not-allowed font-semibold text-violet-700"
              />
              <p className="text-xs text-slate-500 mt-1">
                רמת דיוק מחושבת אוטומטית לפי: n = כושר העמסה / e | לפי תקן OIML R76
              </p>
            </div>

            {/* שורה חמישית: ערך e ו-d (מוצגים אוטומטית) */}
            {scaleModelFormData.e_value && scaleModelFormData.d_value && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    ערך e
                    <span className="text-xs text-violet-600 font-normal">(חושב אוטומטית)</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={scaleModelFormData.e_value}
                    onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, e_value: e.target.value })}
                    className="h-10 bg-violet-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    ערך d
                    <span className="text-xs text-violet-600 font-normal">(חושב אוטומטית)</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={scaleModelFormData.d_value}
                    onChange={(e) => setScaleModelFormData({ ...scaleModelFormData, d_value: e.target.value })}
                    className="h-10 bg-violet-50"
                  />
                </div>
              </div>
            )}

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleModelDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleSaveScaleModel} 
              disabled={!scaleModelFormData.manufacturer || !scaleModelFormData.model_name || savingModel}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {savingModel ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog להוספת משקל חדש */}
      <Dialog open={scaleDialogOpen} onOpenChange={setScaleDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת משקל חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-6 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">לקוח *</Label>
              <Select 
                value={scaleFormData.customerId} 
                onValueChange={async (value) => {
                  setScaleFormData({ ...scaleFormData, customerId: value, siteId: '' });
                  // טעינת אתרים של הלקוח
                  try {
                    const customerRes = await api.get(`/customers/${value}`);
                    setSelectedCustomerSites(customerRes.data?.sites || []);
                  } catch (error) {
                    console.error('Error loading customer sites:', error);
                    setSelectedCustomerSites([]);
                  }
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="בחר לקוח" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scaleFormData.customerId && selectedCustomerSites.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">אתר (אופציונלי)</Label>
                <Select 
                  value={scaleFormData.siteId} 
                  onValueChange={(value) => setScaleFormData({ ...scaleFormData, siteId: value })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="בחר אתר" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCustomerSites.map((site: any) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">מספר סידורי יצרן</Label>
                <Input
                  value={scaleFormData.serialMfg}
                  onChange={(e) => setScaleFormData({ ...scaleFormData, serialMfg: e.target.value })}
                  placeholder="לדוגמה: SN12345"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">מספר סידורי פנימי</Label>
                <Input
                  value={scaleFormData.serialInternal}
                  onChange={(e) => setScaleFormData({ ...scaleFormData, serialInternal: e.target.value })}
                  placeholder="לדוגמה: INT-001"
                  className="h-10"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                💡 הערה: יש להזין לפחות מספר סידורי אחד (יצרן או פנימי)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">יצרן (אופציונלי)</Label>
                <Input
                  value={scaleFormData.manufacturer}
                  onChange={(e) => setScaleFormData({ ...scaleFormData, manufacturer: e.target.value })}
                  placeholder="לדוגמה: Mettler Toledo"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">דגם (אופציונלי)</Label>
                <Input
                  value={scaleFormData.modelName}
                  onChange={(e) => setScaleFormData({ ...scaleFormData, modelName: e.target.value })}
                  placeholder="לדוגמה: IND780"
                  className="h-10"
                />
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800">
                💡 טיפ: כדי ליצור משקל עם דגם מלא, השתמש בכפתור "הוסף דגם" תחילה, ואז יצירת המשקל תתאפשר עם כל הפרטים.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleSaveScale} 
              disabled={!scaleFormData.customerId || (!scaleFormData.serialMfg && !scaleFormData.serialInternal) || savingScale}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {savingScale ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

