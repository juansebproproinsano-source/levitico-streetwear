@echo off
title LEVITICO - publicador automatico
cd /d "%~dp0"
echo Iniciando el publicador de LEVITICO...
echo Al guardar un cambio, se publica solo en Vercel.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1" %*
echo.
echo El publicador se detuvo.
pause
