# Components Reporting Tool - Setup Script
# Run this script to set up the project locally

Write-Host "🚀 Components Reporting Tool - Setup" -ForegroundColor Green
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
$nodeVersion = node -v 2>$null
if ($nodeVersion) {
    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Setup Backend
Write-Host ""
Write-Host "Setting up Backend..." -ForegroundColor Yellow
Set-Location backend

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✓ Created .env file - EDIT WITH YOUR CREDENTIALS" -ForegroundColor Green
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}

Set-Location ..

# Setup Frontend
Write-Host ""
Write-Host "Setting up Frontend..." -ForegroundColor Yellow
Set-Location frontend

Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

Set-Location ..

# Summary
Write-Host ""
Write-Host "✓ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit backend/.env with your Azure SQL credentials"
Write-Host "2. Run: cd backend && npm run dev"
Write-Host "3. In another terminal: cd frontend && npm run dev"
Write-Host "4. Open: http://localhost:5173"
Write-Host ""
Write-Host "For detailed instructions, see QUICKSTART.md"
