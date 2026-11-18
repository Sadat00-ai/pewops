@echo off
title PewOps - build Android APK
cd /d "%~dp0"
node scripts\build.js
echo.
pause
