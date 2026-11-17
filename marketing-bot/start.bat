@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запускаю бота «Маркетолог JetisHUB»...
start "" http://localhost:3010
node build-prompts.js && node --env-file-if-exists=.env server.js
pause
