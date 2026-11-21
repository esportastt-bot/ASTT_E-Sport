@echo off
title ASTT Planning - Serveur Local
chcp 65001 >nul

echo ======================================================
echo    Lancement du serveur ASTT Planning...
echo ======================================================
echo.

cd /d "%~dp0"

:: Vérifier si node_modules existe
if not exist "node_modules\" (
    echo Installation des dependances npm...
    call npm install
)

:: Lancer Vite en arrière-plan
echo Demarrage du serveur Vite sur http://localhost:5173/ASTT_E-Sport/ ...
start "Vite Dev Server" /B npm run dev -- --host --port 5173

:: Petite pause pour laisser le serveur demarrer
timeout /t 3 /nobreak >nul

:: URL locale du site
set URL=http://localhost:5173/ASTT_E-Sport/

:: Chercher Opera sur la machine
set OPERA_EXE="%LOCALAPPDATA%\Programs\Opera\opera.exe"
set OPERA_GX="%LOCALAPPDATA%\Programs\Opera GX\opera.exe"

if exist %OPERA_EXE% (
    echo Ouverture dans Opera...
    start "" %OPERA_EXE% %URL%
) else if exist %OPERA_GX% (
    echo Ouverture dans Opera GX...
    start "" %OPERA_GX% %URL%
) else (
    echo Ouverture avec le navigateur par defaut...
    start %URL%
)

echo.
echo ======================================================
echo  Le serveur est actif !
echo  URL : %URL%
echo  Laissez cette fenetre ouverte tant que vous travaillez.
echo  Appuyez sur une touche pour arreter le serveur.
echo ======================================================
pause >nul
taskkill /FI "WINDOWTITLE eq Vite Dev Server*" /F >nul 2>&1
