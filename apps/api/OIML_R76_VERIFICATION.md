# איך לוודא שהמערכת משתמשת במנוע OIML R76

## 1. בדיקה באמצעות סקריפט בדיקה

הרץ את הסקריפט הבא:

```bash
cd apps/api
npm run test:oiml
```

הסקריפט יבדוק מספר מקרי בדיקה ויציג את התוצאות. אם כל הבדיקות עוברות, המנוע עובד נכון.

## 2. בדיקה באמצעות API Endpoint

### בדיקה ישירה של המנוע:

```bash
curl -X POST http://localhost:4010/api/oiml/r76/mpe \
  -H "Content-Type: application/json" \
  -d '{
    "accuracyClass": "III",
    "e": 0.001,
    "load": 15,
    "stage": "initial"
  }'
```

תשובה צפויה:
```json
{
  "mpeAbs": 0.001,
  "mpeAbsInE": 1,
  "mOverE": 15000,
  "stage": "initial"
}
```

### בדיקה דרך Tolerance Plan API:

```bash
# עבור פרופיל עם OIML_ENGINE mode
curl "http://localhost:4010/api/tolerances/plan?profileId=YOUR_PROFILE_ID&testType=ACCURACY" \
  -H "Cookie: your-auth-cookie"
```

## 3. בדיקה באמצעות Logs

כאשר המנוע נקרא, תראה הודעות ב-console:

```
[OIML R76] Class=III, e=0.001, load=15, m/e=15000.00, MPE=0.001 (1e), stage=initial
[OIML Engine] Calculating tolerance plan for profile xxx, testType=ACCURACY, Class=III, e=0.001, 6 test points
```

**איך לראות את הלוגים:**
- אם אתה מריץ `npm run dev`, הלוגים יופיעו בטרמינל
- אם אתה מריץ ב-production, בדוק את הלוגים של PM2 או Docker

## 4. בדיקה בקוד

### בדיקה 1: האם הפרופיל משתמש ב-OIML_ENGINE?

```sql
SELECT id, toleranceMode, accuracyCls, e, capacity, unit 
FROM metrological_profiles 
WHERE toleranceMode = 'OIML_ENGINE';
```

### בדיקה 2: האם יש testPoints לפרופיל?

```sql
SELECT tp.* 
FROM test_points tp
JOIN metrological_profiles p ON tp.profile_id = p.id
WHERE p.toleranceMode = 'OIML_ENGINE' 
  AND tp.test_type = 'ACCURACY';
```

### בדיקה 3: בדיקת הערכים בפועל

כאשר אתה קורא ל-`/api/tolerances/plan`, התשובה תכיל:
- `toleranceMode: "OIML_ENGINE"` - אם הפרופיל משתמש במנוע
- `plan` - מערך עם `{load, mpe, unit, orderNo}` - ה-MPE מחושב דינמית

## 5. השוואה בין HUB_REFERENCE ל-OIML_ENGINE

### HUB_REFERENCE:
- משתמש בערכים קבועים מ-`tolerance_rows` טבלה
- הערכים נשמרים מראש (מ-HUB templates)
- לא משתמש במנוע OIML R76

### OIML_ENGINE:
- מחשב MPE דינמית לפי OIML R76 Table 6
- משתמש ב-`test_points` מהפרופיל
- **משתמש במנוע OIML R76** ✅

## 6. איך להמיר פרופיל ל-OIML_ENGINE

```typescript
// דרך API או ישירות ב-DB
await prisma.metrologicalProfile.update({
  where: { id: profileId },
  data: {
    toleranceMode: "OIML_ENGINE",
    // וודא שיש testPoints
  }
});
```

או השתמש ב-`seedOimlExample`:
```typescript
import { seedOimlEngine } from "./modules/tolerances/seedOimlExample.js";
await seedOimlEngine(profileId);
```

## 7. בדיקת ערכים ספציפיים

עבור משקל 15 ק"ג עם e=0.001 (Class III):
- load=0: MPE = 0.0005 (0.5e)
- load=0.5: MPE = 0.0005 (0.5e) 
- load=1: MPE = 0.0005 (0.5e)
- load=5: MPE = 0.0005 (0.5e)
- load=10: MPE = 0.001 (1e) - כי m/e = 10000 > 2000
- load=15: MPE = 0.001 (1e) - כי m/e = 15000 > 2000

**הערה:** הערכים האלה תלויים ב-m/e (load/e), לא רק ב-load!

## 8. איפה המערכת משתמשת במנוע החדש?

### ✅ משתמש במנוע OIML R76:

1. **ב-`seedMetrologicalData.ts`** - כאשר יוצרים פרופילים חדשים:
   - הפונקציה `calculateOIMLMPE` קוראת ל-`calcOimlR76Mpe`
   - כל נקודת בדיקה מקבלת MPE מחושב לפי OIML R76

2. **ב-`/api/tolerances/plan`** - כאשר הפרופיל הוא `OIML_ENGINE`:
   - הפונקציה `getOimlTolerancePlan` קוראת ל-`calcOimlR76Mpe` לכל נקודת בדיקה
   - הערכים מחושבים דינמית לפי OIML R76 Table 6

3. **ב-`/api/oiml/r76/mpe`** - API endpoint ישיר:
   - כל קריאה למנוע עוברת דרך `calcOimlR76Mpe`

### ⚠️ לא משתמש במנוע (עדיין):

1. **ב-`NewCalibration.tsx`** - יש פונקציה `calculateOIMLMPE` מקומית:
   - זו פונקציה לדוגמה/סימולציה בלבד
   - הערכים האמיתיים נטענים מהפרופיל (מ-`toleranceRows`)
   - אם הפרופיל הוא `OIML_ENGINE`, הערכים כבר מחושבים במנוע בצד השרת

## סיכום

המערכת משתמשת במנוע OIML R76 כאשר:
1. ✅ הפרופיל מוגדר כ-`toleranceMode = "OIML_ENGINE"`
2. ✅ יש `test_points` לפרופיל
3. ✅ הקריאה ל-`/api/tolerances/plan` מחזירה `toleranceMode: "OIML_ENGINE"`
4. ✅ הלוגים מציגים `[OIML R76]` ו-`[OIML Engine]`
5. ✅ ב-`seedMetrologicalData.ts` - כל פרופיל חדש משתמש במנוע

**איך לבדוק בפועל:**
1. הרץ `npm run test:oiml` - אם כל הבדיקות עוברות, המנוע עובד ✅
2. בדוק את הלוגים כשאתה יוצר פרופיל חדש - תראה `[OIML R76]` ✅
3. בדוק את הלוגים כשאתה קורא ל-`/api/tolerances/plan` עם פרופיל `OIML_ENGINE` - תראה `[OIML Engine]` ✅

אם אתה רואה את הלוגים האלה, המנוע עובד! 🎉

