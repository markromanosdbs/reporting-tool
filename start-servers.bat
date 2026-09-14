@echo off
cd /d "C:\Users\PC1\Documents\reporting-tool\backend"
start "Backend Server" node dist/index.js

cd /d "C:\Users\PC1\Documents\reporting-tool\frontend"
start "Frontend Server" npm run dev

echo.
echo Both servers are starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5174
