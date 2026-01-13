# מערכת כיולים - Calibration System

מערכת ניהול כיולים מלאה (MVP חזק) עם תהליך עבודה מלא מכניסת טכנאי ועד הנפקת תעודות PDF.

## תכונות

- ✅ מודל נתונים מלא (Customers / Sites / Scales / Metrological Profiles / Calibrations / Measurements / Approvals / AuditLog / Certificates)
- ✅ תהליך עבודה: טכנאי מזין → Submit → משרד בודק/מתקן עם Audit → Approve (חותמת) → הנפקת תעודה PDF
- ✅ הרשאות (Technician / Office / Admin) + JWT
- ✅ יבוא לקוחות מתוך CSV
- ✅ Docker ל-PostgreSQL
- ✅ Frontend React/Vite בסיסי (מסך טכנאי + מסך משרד + מסך אישור)

## התקנה והרצה

### דרישות מוקדמות

- Node.js 18+
- Docker & Docker Compose
- npm או yarn

### שלב 1: התקנת תלויות

```bash
npm install
cd apps/api && npm install
cd ../web && npm install
```

### שלב 2: הגדרת מסד הנתונים

```bash
# הרצת PostgreSQL ב-Docker
npm run dev:db

# המתן כמה שניות עד שהמסד מוכן
```

### שלב 3: הגדרת Prisma

```bash
cd apps/api

# יצירת מסד הנתונים והטבלאות
npm run prisma:migrate

# יצירת משתמשים לדוגמה
npm run seed
```

### שלב 4: הרצת המערכת

```bash
# מהשורש - מריץ הכל יחד
npm run dev

# או בנפרד:
# npm run dev:api   # Backend על פורט 3001
# npm run dev:web   # Frontend על פורט 5173
```

## משתמשים לדוגמה

לאחר הרצת seed, תוכל להתחבר עם:

- **מנהל מערכת**: `admin@calibration.com` / `admin123`
- **משרד**: `office@calibration.com` / `office123`
- **טכנאי**: `tech@calibration.com` / `tech123`

## מבנה הפרויקט

```
calibration-system/
├── apps/
│   ├── api/              # Backend (Express + TypeScript + Prisma)
│   │   ├── src/
│   │   │   ├── modules/  # מודולים: auth, customers, scales, profiles, calibrations, approvals, certificates, audit, imports
│   │   │   ├── db/       # Prisma client
│   │   │   ├── config/   # הגדרות
│   │   │   └── core/     # Middleware משותף
│   │   └── prisma/       # Prisma schema
│   └── web/              # Frontend (React + Vite + TypeScript)
│       └── src/
│           ├── pages/    # מסכים: Login, TechnicianDashboard, OfficeDashboard, ApprovalDashboard
│           ├── components/
│           ├── api/      # API client
│           └── auth/     # ניהול הרשאות
├── docker-compose.yml    # PostgreSQL
└── package.json          # Root scripts
```

## API Endpoints

### Auth
- `POST /api/auth/login` - התחברות
- `POST /api/auth/register` - הרשמה
- `GET /api/auth/me` - משתמש נוכחי

### Customers
- `GET /api/customers` - רשימת לקוחות
- `GET /api/customers/:id` - פרטי לקוח
- `POST /api/customers` - יצירת לקוח
- `PUT /api/customers/:id` - עדכון לקוח
- `DELETE /api/customers/:id` - מחיקת לקוח

### Scales
- `GET /api/scales` - רשימת משקלות
- `GET /api/scales/:id` - פרטי משקל
- `POST /api/scales` - יצירת משקל
- `PUT /api/scales/:id` - עדכון משקל
- `DELETE /api/scales/:id` - מחיקת משקל

### Profiles
- `GET /api/profiles` - רשימת פרופילים מטרולוגיים
- `GET /api/profiles/:id` - פרטי פרופיל
- `POST /api/profiles` - יצירת פרופיל
- `PUT /api/profiles/:id` - עדכון פרופיל
- `DELETE /api/profiles/:id` - מחיקת פרופיל

### Calibrations
- `GET /api/calibrations` - רשימת כיולים
- `GET /api/calibrations/:id` - פרטי כיול
- `POST /api/calibrations` - יצירת כיול
- `PUT /api/calibrations/:id` - עדכון כיול
- `POST /api/calibrations/submit` - שליחת כיול לאישור
- `DELETE /api/calibrations/:id` - מחיקת כיול

### Approvals
- `GET /api/approvals` - רשימת אישורים
- `POST /api/approvals/approve` - אישור כיול
- `POST /api/approvals/reject` - דחיית כיול

### Certificates
- `POST /api/certificates/generate` - יצירת תעודה PDF
- `GET /api/certificates/:id` - פרטי תעודה
- `GET /api/certificates/download/:calibrationId` - הורדת תעודה

### Imports
- `POST /api/imports/customers` - יבוא לקוחות מ-CSV

### Audit
- `GET /api/audit` - לוגים

## יבוא CSV

להעלאת קובץ CSV עם לקוחות, השתמש ב-endpoint:
```
POST /api/imports/customers
Content-Type: multipart/form-data
file: [קובץ CSV]
```

פורמט CSV (עם או בלי כותרות):
```csv
name,address,phone,email,taxId
לקוח 1,כתובת 1,03-1234567,customer1@example.com,123456789
לקוח 2,כתובת 2,03-7654321,customer2@example.com,987654321
```

## פיתוח נוסף

המערכת מוכנה לחיבור למנוע הטולרנסים/נקודות בדיקה לפי הפרופילים. ניתן להוסיף:

1. חיבור למנוע הטולרנסים
2. חישוב אוטומטי של נקודות בדיקה לפי פרופיל
3. דוחות מתקדמים
4. התראות אימייל
5. API נוסף לפי צורך

## הערות

- הקבצים מוגדרים ל-RTL (עברית)
- כל הפעולות נשמרות ב-Audit Log
- תעודות PDF נוצרות עם QR Code
- המערכת מוכנה להרחבה

## רישיון

פרטי

