# ================================================================
# ШАГ 2: Снятие дампа с Supabase
# Запист на ВАШЕМ компьютере (Windows PowerShell)
#
# ПЕРЕД ЗАПУСКОМ: заполните переменные в секции "НАСТРОЙКИ"
# ================================================================

# ----------------------------------------------------------------
# НАСТРОЙКИ — ЗАПОЛНИТЕ САМИ
# ----------------------------------------------------------------
$SUPABASE_PROJECT_REF = "vqrspimfhimntbrwxvvi"       # из URL Supabase
$SUPABASE_DB_PASSWORD  = "QrleMIqGfxDiJsm8"           # Settings → Database → Password
$OUTPUT_DIR            = "$PSScriptRoot\dump"          # куда сохранять файлы

# Timeweb
$TW_HOST     = "5.42.107.149"
$TW_PORT     = "5432"
$TW_USER     = "gen_user"
$TW_PASSWORD = '3WdY)K<{=Mc=rJ'
$TW_DB       = "default_db"

# ----------------------------------------------------------------
# Путь к pg_dump (если не в PATH — укажите полный путь)
# Пример: C:\Program Files\PostgreSQL\16\bin\pg_dump.exe
# ----------------------------------------------------------------
$PG_DUMP = "pg_dump"
$PSQL    = "psql"

# ----------------------------------------------------------------
# Проверяем наличие pg_dump
# ----------------------------------------------------------------
if (-not (Get-Command $PG_DUMP -ErrorAction SilentlyContinue)) {
    Write-Host "ОШИБКА: pg_dump не найден в PATH." -ForegroundColor Red
    Write-Host "Установите PostgreSQL client tools или укажите полный путь в переменной PG_DUMP" -ForegroundColor Yellow
    Write-Host "Скачать: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor Cyan
    exit 1
}

# ----------------------------------------------------------------
# Создаём папку для дампа
# ----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null
Write-Host "Папка для дампа: $OUTPUT_DIR" -ForegroundColor Cyan

# ----------------------------------------------------------------
# Строки подключения
# ----------------------------------------------------------------
$SUPABASE_CONN = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
$TW_CONN = "postgresql://${TW_USER}:${TW_PASSWORD}@${TW_HOST}:${TW_PORT}/${TW_DB}?sslmode=require"

$env:PGPASSWORD = $SUPABASE_DB_PASSWORD

Write-Host ""
Write-Host "=== ШАГ 1: Дамп ТОЛЬКО схемы (без данных) ===" -ForegroundColor Green
$schemaFile = "$OUTPUT_DIR\schema_only.sql"
& $PG_DUMP `
    $SUPABASE_CONN `
    --schema=public `
    --schema-only `
    --no-owner `
    --no-privileges `
    --no-comments `
    --file=$schemaFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА при снятии дампа схемы. Проверьте пароль и доступ к Supabase." -ForegroundColor Red
    exit 1
}
Write-Host "Схема сохранена: $schemaFile" -ForegroundColor Green

Write-Host ""
Write-Host "=== ШАГ 2: Дамп ТОЛЬКО данных ===" -ForegroundColor Green
$dataFile = "$OUTPUT_DIR\data_only.sql"
& $PG_DUMP `
    $SUPABASE_CONN `
    --schema=public `
    --data-only `
    --no-owner `
    --no-privileges `
    --disable-triggers `
    --file=$dataFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА при снятии дампа данных." -ForegroundColor Red
    exit 1
}
Write-Host "Данные сохранены: $dataFile" -ForegroundColor Green

Write-Host ""
Write-Host "=== ШАГ 3: Полный дамп (схема + данные) ===" -ForegroundColor Green
$fullFile = "$OUTPUT_DIR\full_dump.sql"
& $PG_DUMP `
    $SUPABASE_CONN `
    --schema=public `
    --no-owner `
    --no-privileges `
    --no-comments `
    --file=$fullFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА при снятии полного дампа." -ForegroundColor Red
    exit 1
}

$sizeBytes = (Get-Item $fullFile).Length
$sizeMB = [math]::Round($sizeBytes / 1MB, 2)
Write-Host "Полный дамп сохранён: $fullFile ($sizeMB МБ)" -ForegroundColor Green

Write-Host ""
Write-Host "=== Дамп завершён успешно! ===" -ForegroundColor Green
Write-Host "Следующий шаг: запустите 03_clean_dump.ps1" -ForegroundColor Cyan
