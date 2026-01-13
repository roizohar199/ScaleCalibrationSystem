# Script להפעלת מסד הנתונים עם בדיקה אוטומטית של Docker
# שימוש: .\scripts\start-db.ps1

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

# בדיקה והפעלה של Docker Desktop
& "$scriptPath\ensure-docker.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "לא ניתן להמשיך ללא Docker Desktop" -ForegroundColor Red
    exit 1
}

# המתן קצת זמן ל-Docker להתחיל לגמרי
Start-Sleep -Seconds 3

Write-Host "מפעיל את מסד הנתונים..." -ForegroundColor Yellow
Set-Location $projectRoot
docker compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ מסד הנתונים הופעל בהצלחה!" -ForegroundColor Green
    Write-Host "המתן 10-15 שניות עד שהמסד מוכן לחיבורים..." -ForegroundColor Yellow
} else {
    Write-Host "✗ שגיאה בהפעלת מסד הנתונים" -ForegroundColor Red
    exit 1
}

