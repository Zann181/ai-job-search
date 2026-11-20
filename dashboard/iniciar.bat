@echo off
rem Starts the job-search dashboard (Buscador, Ofertas, Postulaciones) and opens it in the browser.
rem If it is already running, only opens the page. Closing this window shuts it down.
title Busqueda de empleo
cd /d "%~dp0.."
set PORT=4317
if defined DASHBOARD_PORT set PORT=%DASHBOARD_PORT%

where bun >nul 2>nul
if errorlevel 1 (
  echo No se encontro "bun". Instalalo desde https://bun.sh y vuelve a intentar.
  pause
  exit /b 1
)

rem Already running? Just open the page (each page load gets a fresh token).
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo El dashboard ya esta abierto en http://127.0.0.1:%PORT%/
  if not defined DASHBOARD_NO_BROWSER start "" "http://127.0.0.1:%PORT%/"
  timeout /t 3 >nul
  exit /b 0
)

if not exist "dashboard\node_modules" (
  echo Instalando dependencias del dashboard...
  pushd dashboard
  bun install
  popd
)

if not defined DASHBOARD_NO_BROWSER start "" cmd /c "timeout /t 4 >nul & start "" http://127.0.0.1:%PORT%/"
echo Dashboard en http://127.0.0.1:%PORT%/  (cierra esta ventana para apagarlo)
bun run dashboard\src\main.ts
echo.
echo El dashboard se detuvo.
pause
