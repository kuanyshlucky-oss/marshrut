# Резервная копия данных (скважины, заказы, заявки, слои, справочник) в папку backups\ГГГГ-ММ-ДД_ЧЧ-ММ
# Запуск из папки geo3d-mvp:   .\tools\backup-data.ps1
# Если Windows запрещает запуск скриптов, выполните те же три команды вручную:
#   $dst = "backups\$(Get-Date -Format 'yyyy-MM-dd_HH-mm')"; New-Item -ItemType Directory -Force $dst; Copy-Item data\* $dst -Recurse
param([string]$Dest = (Join-Path $PSScriptRoot '..\backups'))
$src = Join-Path $PSScriptRoot '..\data'
if (-not (Test-Path $src)) { Write-Host "Папка data не найдена: $src"; exit 1 }
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$dst = Join-Path $Dest $stamp
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
$n = (Get-ChildItem $dst -Recurse -File | Measure-Object).Count
Write-Host "Резервная копия готова: $dst ($n файлов)"
