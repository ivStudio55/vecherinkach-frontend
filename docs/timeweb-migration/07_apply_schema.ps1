# ================================================================
# ШАГ 7: Применить схему к Timeweb из локальных SQL файлов
# АЛЬТЕРНАТИВА pg_dump когда прямое подключение к Supabase недоступно
#
# Применяет файлы из docs/ в правильном порядке,
# фильтруя Supabase-специфичные строки (supabase_realtime, etc.)
# ================================================================

$TW_HOST     = "5.42.107.149"
$TW_PORT     = "5432"
$TW_USER     = "gen_user"
$TW_PASSWORD = '3WdY)K<{=Mc=rJ'
$TW_DB       = "default_db"

$DOCS_DIR   = "$PSScriptRoot\..\docs"   # <-- папка docs/ с SQL файлами
$PSQL       = "psql"
$LOG_FILE   = "$PSScriptRoot\schema_apply_log_$(Get-Date -Format 'yyyyMMdd_HHmm').txt"
$MERGED_SQL = "$PSScriptRoot\dump\schema_merged.sql"

$env:PGPASSWORD = $TW_PASSWORD

# SQL файлы в правильном порядке применения
# SKIP: supabase-enable-realtime.sql (только Supabase Realtime)
# SKIP: supabase-add-uno.sql — заменён supabase-uno-v2.sql
# SKIP: clear_all_data.sql, supabase-check-data.sql, supabase-policies-check.sql
$SQL_FILES = @(
    "supabase-init-full.sql",
    "supabase-add-quiz-system.sql",
    "supabase-add-round-timer.sql",
    "supabase-add-round3-voting.sql",
    "supabase-add-round4.sql",
    "supabase-add-round5.sql",
    "supabase-add-final-results.sql",
    "supabase-fix-round2-rls.sql",
    "supabase-room-sync.sql",
    "supabase-add-question-packs.sql",
    "supabase-jokester.sql",
    "supabase-jokester-update-v2.sql",
    "supabase-creativach.sql",
    "supabase-drawinkach.sql",
    "supabase-uno-v2.sql",
    "supabase-seed-verbs.sql"
)

Write-Host ""
Write-Host "=== Шаг 7: Применение схемы из локальных SQL файлов ===" -ForegroundColor Cyan
Write-Host "Источник: $DOCS_DIR"
Write-Host "Цель: $TW_HOST/$TW_DB"
Write-Host "Лог: $LOG_FILE"

# Проверяем все файлы
$missingFiles = @()
foreach ($f in $SQL_FILES) {
    if (-not (Test-Path "$DOCS_DIR\$f")) {
        $missingFiles += $f
    }
}
if ($missingFiles.Count -gt 0) {
    Write-Host "ОШИБКА: Не найдены файлы:" -ForegroundColor Red
    $missingFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host "Все $($SQL_FILES.Count) файлов найдены." -ForegroundColor Green

# ----------------------------------------------------------------
# Создаём объединённый SQL файл с фильтрацией
# ----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\dump" | Out-Null
$merged = [System.Collections.Generic.List[string]]::new()
$merged.Add("-- ================================================================")
$merged.Add("-- ОБЪЕДИНЁННАЯ СХЕМА ДЛЯ TIMEWEB CLOUD POSTGRESQL 18")
$merged.Add("-- Сгенерировано: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$merged.Add("-- Supabase Realtime строки удалены")
$merged.Add("-- ================================================================")
$merged.Add("")
$merged.Add("SET client_encoding = 'UTF8';")
$merged.Add("SET standard_conforming_strings = on;")
$merged.Add("")

$totalLines = 0
$skippedLines = 0

foreach ($filename in $SQL_FILES) {
    $filePath = "$DOCS_DIR\$filename"
    Write-Host "  Читаю: $filename" -ForegroundColor Gray
    
    $merged.Add("")
    $merged.Add("-- ================================================================")
    $merged.Add("-- FILE: $filename")
    $merged.Add("-- ================================================================")
    $merged.Add("")
    
    $content = Get-Content -Path $filePath -Raw -Encoding UTF8
    $totalLines += ($content -split "`n").Count

    # 1. Убираем DO $$ блоки которые содержат supabase_realtime (целиком)
    $beforeLen = $content.Length
    $content = $content -replace '(?s)DO\s+\$\$.*?supabase_realtime.*?\$\$\s*;(\r?\n)?', "-- [supabase_realtime DO block removed]`n"
    
    # 2. Убираем одиночные строки ALTER PUBLICATION supabase_realtime
    $content = $content -replace '(?im)^.*ALTER\s+PUBLICATION\s+supabase_realtime.*$(\r?\n)?', "-- [ALTER PUBLICATION supabase_realtime removed]`n"
    
    # 3. На всякий случай: любое упоминание supabase_realtime в строке
    $content = $content -replace '(?im)^.*supabase_realtime.*$(\r?\n)?', "-- [supabase_realtime line removed]`n"
    
    $afterLen = $content.Length
    if ($beforeLen -ne $afterLen) {
        $skippedLines += [math]::Round(($beforeLen - $afterLen) / 50)  # приблизительно
    }
    
    $merged.Add($content)
}

$merged | Set-Content -Path $MERGED_SQL -Encoding UTF8
$sizeKB = [math]::Round((Get-Item $MERGED_SQL).Length / 1KB, 1)
Write-Host ""
Write-Host "Объединённый SQL: $MERGED_SQL ($sizeKB КБ)" -ForegroundColor Green
Write-Host "Всего строк: $totalLines, пропущено Realtime: $skippedLines"

# ----------------------------------------------------------------
# Проверяем — нет ли оставшихся Supabase ссылок
# ----------------------------------------------------------------
$remaining = Select-String -Pattern "supabase_realtime" -Path $MERGED_SQL
if ($remaining) {
    Write-Host "ВНИМАНИЕ: Остались ссылки на supabase_realtime ($($remaining.Count) шт.):" -ForegroundColor Yellow
    $remaining | ForEach-Object { Write-Host "  L$($_.LineNumber): $($_.Line.Trim())" -ForegroundColor Yellow }
} else {
    Write-Host "OK: supabase_realtime полностью удалён" -ForegroundColor Green
}

# ----------------------------------------------------------------
# Применяем к Timeweb
# ----------------------------------------------------------------
Write-Host ""
Write-Host "=== Применяю схему к Timeweb ===" -ForegroundColor Cyan

$output = & $PSQL `
    --host=$TW_HOST `
    --port=$TW_PORT `
    --username=$TW_USER `
    --dbname=$TW_DB `
    --file=$MERGED_SQL `
    2>&1

$output | Out-File -FilePath $LOG_FILE -Encoding UTF8

# Анализируем ошибки (игнорируем NOTICE)
$errors = $output | Where-Object { $_ -match "^ERROR:" -or ($_ -match "error:" -and $_ -notmatch "NOTICE") }
$notices = $output | Where-Object { $_ -match "NOTICE:" }

Write-Host "Замечания (NOTICE): $($notices.Count)"

if ($LASTEXITCODE -ne 0 -or $errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ОШИБКИ при применении схемы ($($errors.Count) шт.):" -ForegroundColor Red
    $errors | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Полный лог: $LOG_FILE" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ПОДСКАЗКА: Если ошибки 'already exists' — это нормально," -ForegroundColor Yellow
    Write-Host "  значит таблицы/функции уже созданы. Пропустите эти ошибки." -ForegroundColor Yellow
} else {
    Write-Host "Схема применена успешно!" -ForegroundColor Green
}

# ----------------------------------------------------------------
# Проверка: считаем таблицы в Timeweb
# ----------------------------------------------------------------
Write-Host ""
Write-Host "=== Проверка: таблицы в Timeweb ===" -ForegroundColor Cyan
& $PSQL `
    --host=$TW_HOST `
    --port=$TW_PORT `
    --username=$TW_USER `
    --dbname=$TW_DB `
    --command="SELECT schemaname, COUNT(*) as tables FROM pg_tables WHERE schemaname='public' GROUP BY schemaname;" `
    2>&1

Write-Host ""
Write-Host "Полный список таблиц:" -ForegroundColor Cyan
& $PSQL `
    --host=$TW_HOST `
    --port=$TW_PORT `
    --username=$TW_USER `
    --dbname=$TW_DB `
    --command="SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" `
    2>&1

Write-Host ""
Write-Host "Следующий шаг: запустите 08_export_questions_data.ps1 (экспорт данных через REST API)" -ForegroundColor Cyan
