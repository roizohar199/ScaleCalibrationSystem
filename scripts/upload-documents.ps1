# Script להעלאת מסמכי DOCX דרך API
# שימוש: .\scripts\upload-documents.ps1 <path-to-zip-file>

param(
    [string]$ZipPath = "..\..\test-import.zip"
)

$API_URL = "http://localhost:4010"
$EMAIL = "office@local"
$PASSWORD = "1234"

Write-Host "=== Document Upload Script ===" -ForegroundColor Cyan
Write-Host ""

# Login
Write-Host "Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = $EMAIL
    password = $PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "Login successful!" -ForegroundColor Green
} catch {
    Write-Host "Login failed: $_" -ForegroundColor Red
    exit 1
}

# Check if file exists
if (-not (Test-Path $ZipPath)) {
    Write-Host "File not found: $ZipPath" -ForegroundColor Red
    exit 1
}

Write-Host "Uploading: $ZipPath" -ForegroundColor Yellow
Write-Host "File size: $([math]::Round((Get-Item $ZipPath).Length / 1MB, 2)) MB" -ForegroundColor Gray

# Upload using multipart/form-data
try {
    $fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $ZipPath))
    $fileName = Split-Path $ZipPath -Leaf
    
    # Create multipart form data manually
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyLines = @()
    $bodyLines += "--$boundary"
    $bodyLines += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`""
    $bodyLines += "Content-Type: application/zip"
    $bodyLines += ""
    
    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join $LF) + $LF)
    $footerBytes = [System.Text.Encoding]::UTF8.GetBytes($LF + "--$boundary--" + $LF)
    
    $bodyBytes = $headerBytes + $fileBytes + $footerBytes
    
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }
    
    $response = Invoke-RestMethod -Uri "$API_URL/imports/documents" -Method Post -Headers $headers -Body $bodyBytes
    
    Write-Host ""
    Write-Host "=== Upload Results ===" -ForegroundColor Cyan
    Write-Host "Processed: $($response.processed) documents" -ForegroundColor Green
    
    if ($response.errors -and $response.errors.Count -gt 0) {
        Write-Host ""
        Write-Host "Errors ($($response.errors.Count)):" -ForegroundColor Yellow
        $response.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    } else {
        Write-Host "No errors!" -ForegroundColor Green
    }
    
} catch {
    Write-Host ""
    Write-Host "Upload failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Response: $errorBody" -ForegroundColor Red
    }
    
    exit 1
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green

