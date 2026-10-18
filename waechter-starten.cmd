@echo off
rem Startet den Wächter des Kunden-Feedbacks. Fenster offen lassen – schließen beendet den Wächter.
title Kunden-Feedback Waechter
cd /d "%~dp0"
:neu
call npm run waechter
echo.
echo Waechter wurde beendet. Neustart in 60 Sekunden (Strg+C zum Abbrechen) ...
timeout /t 60 /nobreak >nul
goto neu
