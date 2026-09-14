# Start backend server
Write-Host "Starting backend server..."
Push-Location "C:\Users\PC1\Documents\reporting-tool\backend"
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    cd $dir
    npm start 2>&1
} -ArgumentList "C:\Users\PC1\Documents\reporting-tool\backend" -Name "backend-server"

# Wait for backend to start
Start-Sleep -Seconds 3

# Start frontend server
Write-Host "Starting frontend server..."
Push-Location "C:\Users\PC1\Documents\reporting-tool\frontend"
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    cd $dir
    npm run dev 2>&1
} -ArgumentList "C:\Users\PC1\Documents\reporting-tool\frontend" -Name "frontend-server"

Write-Host "Servers starting..."
Write-Host "Backend job ID: $($backendJob.Id)"
Write-Host "Frontend job ID: $($frontendJob.Id)"
Write-Host ""
Write-Host "Run: Get-Job to check status"
Write-Host "Run: Receive-Job -Id <jobid> -Keep to see output"
