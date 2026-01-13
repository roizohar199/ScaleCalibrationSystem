# הפעלה אוטומטית של Docker Desktop

## אפשרות 1: הפעלה אוטומטית עם Windows (מומלץ)

1. פתח את **Docker Desktop**
2. לחץ על **Settings** (הגדרות) או **⚙️**
3. עבור ל-**General**
4. סמן את התיבה **"Start Docker Desktop when you log in"** (הפעל את Docker Desktop בעת התחברות)
5. לחץ על **Apply & Restart**

מעתה, Docker Desktop יופעל אוטומטית בכל פעם שתדליק את המחשב.

## אפשרות 2: שימוש ב-Scripts האוטומטיים

הפרויקט כולל scripts שמוודאים ש-Docker Desktop פועל לפני הרצת מסד הנתונים:

### הפעלת מסד הנתונים עם בדיקה אוטומטית:
```powershell
npm run dev:db
```

פקודה זו תבדוק אם Docker Desktop פועל, ואם לא - תנסה להפעיל אותו אוטומטית.

### בדיקה בלבד (ללא הפעלת מסד נתונים):
```powershell
npm run ensure-docker
```

### הפעלה פשוטה (ללא בדיקה):
```powershell
npm run dev:db:simple
```

## אפשרות 3: Task Scheduler של Windows

אם אתה רוצה יותר שליטה, תוכל ליצור משימה ב-Task Scheduler:

1. פתח את **Task Scheduler** (מתזמן המשימות)
2. לחץ על **Create Basic Task**
3. שם: "Start Docker Desktop"
4. Trigger: "When I log on"
5. Action: "Start a program"
6. Program: `C:\Program Files\Docker\Docker\Docker Desktop.exe`
7. לחץ על **Finish**

## פתרון בעיות

### Docker Desktop לא מתחיל אוטומטית
- ודא שהתיבה "Start Docker Desktop when you log in" מסומנת בהגדרות
- בדוק שהמשתמש שלך יש לו הרשאות להפעיל תוכניות

### Script לא עובד
- ודא ש-PowerShell Execution Policy מאפשר הרצת scripts:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### עדיין שוכח להפעיל?
- השתמש באפשרות 1 (הפעלה אוטומטית עם Windows) - זה הכי אמין!

