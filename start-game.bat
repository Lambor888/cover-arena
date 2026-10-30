@echo off
setlocal
title Cover Arena - Local Server
pushd "%~dp0"
if errorlevel 1 goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_missing

echo ========================================
echo   Cover Arena - Local Game Launcher
echo ========================================
echo.

if exist "node_modules\.bin\vite.cmd" goto launch
echo Installing project dependencies. Internet access is required...
call npm.cmd install
if errorlevel 1 goto install_error

:launch
echo Game URL: http://127.0.0.1:5173/
echo The browser will open after the server starts.
echo Keep this window open while playing.
echo Press Ctrl+C to stop the server.
echo.
call npm.cmd run dev -- --open
if errorlevel 1 goto server_error
popd
exit /b 0

:node_missing
echo ERROR: Node.js or npm was not found.
echo Install Node.js 24 LTS, then run this launcher again.
goto failed

:install_error
echo ERROR: Dependency installation failed. Check the output and network connection.
goto failed

:server_error
echo ERROR: The server could not start or stopped unexpectedly.
echo If port 5173 is in use, an existing game server may already be running.
echo Open http://127.0.0.1:5173/ or stop the old server and try again.
goto failed

:folder_error
echo ERROR: Could not open the project folder.
pause
exit /b 1

:failed
echo.
pause
popd
exit /b 1
