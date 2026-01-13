# הוראות התקנה מהירות

## שלב 1: התקנת תלויות

```bash
# מהשורש
npm install

# Backend
cd apps/api
npm install

# Frontend
cd ../web
npm install
```

## שלב 2: הרצת מסד הנתונים

```bash
# מהשורש
npm run dev:db
```

המתן 10-15 שניות עד שהמסד מוכן.

## שלב 3: הגדרת Prisma

```bash
cd apps/api

# יצירת מסד הנתונים
npm run prisma:migrate

# יצירת משתמשים לדוגמה
npm run seed
```

## שלב 4: הרצת המערכת

```bash
# מהשורש - מריץ הכל יחד
npm run dev
```

או בנפרד:

```bash
# Terminal 1 - Backend
cd apps/api
npm run dev

# Terminal 2 - Frontend  
cd apps/web
npm run dev
```

## התחברות

פתח דפדפן: http://localhost:5173

משתמשים לדוגמה:
- **מנהל**: `admin@calibration.com` / `admin123`
- **משרד**: `office@calibration.com` / `office123`
- **טכנאי**: `tech@calibration.com` / `tech123`

## בעיות נפוצות

### מסד הנתונים לא עולה
```bash
# בדוק שהפורט 5434 פנוי
# או שנה את הפורט ב-docker-compose.yml
```

### שגיאת Prisma
```bash
cd apps/api
npm run prisma:generate
npm run prisma:migrate
```

### שגיאת Port כבר בשימוש
שנה את הפורטים ב:
- `apps/api/.env` - PORT=3001
- `apps/web/vite.config.ts` - port: 5173
- `docker-compose.yml` - 5434:5432

