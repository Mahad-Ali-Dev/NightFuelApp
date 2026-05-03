@echo off
title NightFuel Service Launcher

:: ── Give ts-node / Node.js 4 GB heap so TypeScript compilation never OOMs ──
set NODE_OPTIONS=--max-old-space-size=4096

echo =====================================================================
echo                NIGHTFUEL MICROSERVICES LAUNCHER
echo =====================================================================

:: ── Kill any stale processes on our ports before starting ─────────────────
echo Clearing stale processes on ports 3000-3016...
for /L %%P in (3000,1,3016) do (
    for /f "tokens=5 delims= " %%i in ('netstat -ano 2^>nul ^| findstr ":%%P " 2^>nul') do (
        if not "%%i"=="" (
            taskkill /PID %%i /F >nul 2>&1
        )
    )
)
echo Ports cleared. Waiting 1 second...
timeout /t 1 /nobreak >nul

echo Starting all 16 microservices + web client in separate windows...
echo.

:: 1. Auth Service (3001)
echo [1/17] Launching Auth Service (3001)...
start "Auth Service" cmd /k "cd services\auth-service && npm run dev"

:: 2. Shift Service (3002)
echo [2/17] Launching Shift Service (3002)...
start "Shift Service" cmd /k "cd services\shift-service && npm run dev"

:: 3. Circadian Engine (3003)
echo [3/17] Launching Circadian Engine (3003)...
start "Circadian Engine" cmd /k "cd services\circadian-engine && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 3003"

:: 4. AI Pipeline (3004)
echo [4/17] Launching AI Pipeline (3004)...
start "AI Pipeline" cmd /k "cd services\ai-pipeline && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 3004"

:: 5. Plan Service (3005)
echo [5/17] Launching Plan Service (3005)...
start "Plan Service" cmd /k "cd services\plan-service && npm run dev"

:: 6. Meal Service (3006)
echo [6/17] Launching Meal Service (3006)...
start "Meal Service" cmd /k "cd services\meal-service && npm run dev"

:: 7. Progress Service (3007)
echo [7/17] Launching Progress Service (3007)...
start "Progress Service" cmd /k "cd services\progress-service && npm run dev"

:: 8. Notification Service (3008)
echo [8/17] Launching Notification Service (3008)...
start "Notification Service" cmd /k "cd services\notification-service && npm run dev"

:: 9. User Service (3009)
echo [9/17] Launching User Service (3009)...
start "User Service" cmd /k "cd services\user-service && npm run dev"

:: 10. Subscription Service (3010)
echo [10/17] Launching Subscription Service (3010)...
start "Subscription Service" cmd /k "cd services\subscription-service && npm run dev"

:: 11. Exercise Service (3011)
echo [11/17] Launching Exercise Service (3011)...
start "Exercise Service" cmd /k "cd services\exercise-service && npm run dev"

:: 12. Sleep Service (3012)
echo [12/17] Launching Sleep Service (3012)...
start "Sleep Service" cmd /k "cd services\sleep-service && npm run dev"

:: 13. Community Service (3013)
echo [13/17] Launching Community Service (3013)...
start "Community Service" cmd /k "cd services\community-service && npm run dev"

:: 14. Chat Service (3014)
echo [14/17] Launching Chat Service (3014)...
start "Chat Service" cmd /k "cd services\chat-service && npm run dev"

:: 15. State Service (3015)
echo [15/17] Launching State Service (3015)...
start "State Service" cmd /k "cd services\state-service && npm run dev"

:: 16. Decision Engine (3016)
echo [16/17] Launching Decision Engine (3016)...
start "Decision Engine" cmd /k "cd services\decision-engine && npm run dev"

:: 17. Web Client (3000)
echo [17/17] Launching Web Client (3000)...
start "Web Client" cmd /k "cd clients\web && npm run dev"

echo.
echo =====================================================================
echo All 16 services + web client are starting.
echo Check individual windows for logs.
echo.
echo Service Map:
echo   3000  Web Client     (Next.js)
echo   3001  Auth Service
echo   3002  Shift Service
echo   3003  Circadian Engine  (Python)
echo   3004  AI Pipeline       (Python)
echo   3005  Plan Service
echo   3006  Meal Service
echo   3007  Progress Service
echo   3008  Notification Service
echo   3009  User Service
echo   3010  Subscription Service
echo   3011  Exercise Service
echo   3012  Sleep Service
echo   3013  Community Service
echo   3014  Chat Service
echo   3015  State Service
echo   3016  Decision Engine
echo =====================================================================
pause
