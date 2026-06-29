@echo off
:: Koku Setup — Windows launcher
:: Double-click this file to run the PowerShell setup script.
:: It bypasses the execution policy restriction for this one script.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
pause
