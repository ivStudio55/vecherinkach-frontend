# ================================================================
# ШАГ 4: Импорт в Timeweb PostgreSQL 18
# Запустить ПОСЛЕ 03_clean_dump.ps1
# ================================================================

# ----------------------------------------------------------------
# НАСТРОЙКИ — ЗАПОЛНИТЕ САМИ (те же, что в 02_dump_supabase.ps1)
# ----------------------------------------------------------------
$TW_HOST     = "5.42.107.149"
$TW_PORT     = "5432"
$TW_USER     = "gen_user"
$TW_PASSWORD = '3WdY)K<{=Mc=rJ'
$TW_DB       = "default_db"

$DUMP_DIR  = "$PSScriptRoot\dump"
$PSQL      = "psql"
$LOG_FILE  = "$DUMP_DIR\import_log_$(Get-Date -Format 'yyyyMMdd_HHmm').txt"

# ----------------------------------------------------------------
# Строка подключения к Timeweb
# ----------------------------------------------------------------
$TW_CONN = "postgresql://${TW_USER}:${TW_PASSWORD}@${TW_HOST}:${TW_PORT}/${TW_DB}?sslmode=require"
$env:PGPASSWORD = $TW_PASSWORD

# ----------------------------------------------------------------
# Проверяем psql
# ----------------------------------------------------------------
if (-not (Get-Command $PSQL -ErrorAction SilentlyContinue)) {
    Write-Host "ОШИБКА: psql не найден в PATH." -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------
# Функция выполнения SQL с логированием
# ----------------------------------------------------------------
function Invoke-SQL {
    param([string]$File, [string]$Description)
    if (-not (Test-Path $File)) {
        Write-Host "ОШИБКА: Файл $File не найден" -ForegroundColor Red
        return $false
    }
    Write-Host ""
    Write-Host "--- $Description ---" -ForegroundColor Cyan
    Write-Host "Файл: $File"
    
    $output = & $PSQL `
        --host=$TW_HOST `
        --port=$TW_PORT `
        --username=$TW_USER `
        --dbname=$TW_DB `
        --file=$File `
        --single-transaction `
        --set=ON_ERROR_STOP=1 `
        2>&1
    
    $output | Out-File -Append -FilePath $LOG_FILE -Encoding UTF8
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ОШИБКА при выполнении ($Description):" -ForegroundColor Red
        $output | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        return $false
    }
    
    Write-Host "OK: $Description выполнен успешно" -ForegroundColor Green
    return $true
}

# ----------------------------------------------------------------
# Проверка подключения к Timeweb
# ----------------------------------------------------------------
Write-Host "=== Проверка подключения к Timeweb ===" -ForegroundColor Green
$testResult = & $PSQL `
    --host=$TW_HOST `
    --port=$TW_PORT `
    --username=$TW_USER `
    --dbname=$TW_DB `
    --command="SELECT version();" `
    2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА подключения к Timeweb:" -ForegroundColor Red
    Write-Host $testResult
    exit 1
}

Write-Host "Подключение успешно!" -ForegroundColor Green
Write-Host $testResult

# ----------------------------------------------------------------
# ЭТАП 1: Подготовка БД (расширения, роли)
# ----------------------------------------------------------------
$step1 = Invoke-SQL -File "$PSScriptRoot\01_pre_setup.sql" -Description "Расширения и роли"
if (-not $step1) { exit 1 }

# ----------------------------------------------------------------
# ЭТАП 2: Импорт очищенного дампа
# ----------------------------------------------------------------
$cleanDump = "$DUMP_DIR\full_dump_clean.sql"
if (-not (Test-Path $cleanDump)) {
    Write-Host "ОШИБКА: $cleanDump не найден. Сначала запустите 03_clean_dump.ps1" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== ЭТАП 2: Импорт схемы и данных ===" -ForegroundColor Green
Write-Host "Это может занять 1–3 минуты для 37 МБ..." -ForegroundColor Yellow

$startTime = Get-Date
$env:PGPASSWORD = $TW_PASSWORD

$importOutput = & $PSQL `
    --host=$TW_HOST `
    --port=$TW_PORT `
    --username=$TW_USER `
    --dbname=$TW_DB `
    --file=$cleanDump `
    --echo-errors `
    2>&1

$importOutput | Out-File -Append -FilePath $LOG_FILE -Encoding UTF8
$elapsed = (Get-Date) - $startTime

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ОШИБКИ при импорте (последние 30 строк):" -ForegroundColor Red
    $importOutput | Select-Object -Last 30 | ForEach-Object {
        if ($_ -match "(ERROR|FATAL|ОШИБКА)") {
            Write-Host "  $_" -ForegroundColor Red
        } elseif ($_ -match "WARNING") {
            Write-Host "  $_" -ForegroundColor Yellow
        }
    }
    Write-Host ""
    Write-Host "Полный лог: $LOG_FILE" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Попробуем импорт без --single-transaction (для продолжения при ошибках)..." -ForegroundColor Yellow
    
    $env:PGPASSWORD = $TW_PASSWORD
    & $PSQL `
        --host=$TW_HOST `
        --port=$TW_PORT `
        --username=$TW_USER `
        --dbname=$TW_DB `
        --file=$cleanDump `
        2>&1 | Tee-Object -FilePath "$LOG_FILE.retry.txt" | 
        Where-Object { $_ -match "(ERROR|WARNING|FATAL)" } |
        ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
} else {
    Write-Host ""
    Write-Host "Импорт завершён успешно! (${elapsed.TotalSeconds:F1} сек)" -ForegroundColor Green
}

# ----------------------------------------------------------------
# ЭТАП 3: Восстановление прав после импорта
# ----------------------------------------------------------------
Write-Host ""
Write-Host "=== ЭТАП 3: Восстановление прав на функции и таблицы ===" -ForegroundColor Green

$grantsSQL = @"
-- Права на все таблицы
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Права на конкретные функции (явно, для надёжности)
GRANT EXECUTE ON FUNCTION public.submit_answer(uuid, uuid, integer, text, boolean, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_round3(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.like_question(uuid, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_best_question(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_liked_questions(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_active_rooms() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uno_create_room(text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uno_join_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uno_start_game(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uno_draw_card(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uno_play_card(text, uuid, text, text) TO anon, authenticated;

SELECT 'Права выданы' as status;
"@

$grantsFile = "$DUMP_DIR\_temp_grants.sql"
$grantsSQL | Set-Content -Path $grantsFile -Encoding UTF8

$step3 = Invoke-SQL -File $grantsFile -Description "Права на функции и таблицы"
Remove-Item $grantsFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Импорт завершён!" -ForegroundColor Green
Write-Host "Лог: $LOG_FILE" -ForegroundColor Cyan
Write-Host "Следующий шаг: запустите 05_verify.sql в psql или pgAdmin" -ForegroundColor Cyan
