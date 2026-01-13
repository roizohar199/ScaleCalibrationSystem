# Script to check and start Docker Desktop automatically
# Usage: .\scripts\ensure-docker.ps1

Write-Host "Checking if Docker Desktop is running..." -ForegroundColor Yellow

# Check if Docker is running
try {
    docker ps 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker Desktop is running" -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "Docker Desktop is not running" -ForegroundColor Red
}

Write-Host "Attempting to start Docker Desktop..." -ForegroundColor Yellow

# Try to start Docker Desktop
$dockerPath = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerPath) {
    Write-Host "Starting Docker Desktop..." -ForegroundColor Yellow
    Start-Process $dockerPath
    
    Write-Host "Waiting for Docker Desktop to start (up to 60 seconds)..." -ForegroundColor Yellow
    
    $timeout = 60
    $elapsed = 0
    $interval = 2
    
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        
        try {
            docker ps 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Docker Desktop started successfully!" -ForegroundColor Green
                exit 0
            }
        } catch {
            # Still not running
        }
        
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Docker Desktop failed to start in time. Please start it manually." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Docker Desktop not found at $dockerPath" -ForegroundColor Red
    Write-Host "Please install Docker Desktop or start it manually." -ForegroundColor Yellow
    exit 1
}
