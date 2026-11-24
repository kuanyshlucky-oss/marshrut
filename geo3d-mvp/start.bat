@echo off
rem Запуск 3D-карты Караганды одним двойным кликом (демо-режим: оплата без денег).
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите его с https://nodejs.org и запустите этот файл снова.
  pause
  exit /b 1
)
echo Запускаю сервер... Закройте это окно, чтобы остановить карту.
rem через 3 секунды откроем браузер (сервер к этому времени уже запущен)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8095"
node server.js --demo
echo.
echo Сервер остановлен. Если выше написано, что порт 8095 занят, карта уже запущена в другом окне: откройте http://localhost:8095
pause
