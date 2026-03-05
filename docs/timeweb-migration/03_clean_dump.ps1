# ================================================================
# ШАГ 3: Очистка дампа от Supabase-специфичных объектов
# Запустить ПОСЛЕ снятия дампа (02_dump_supabase.ps1)
#
# Что удаляется:
#   - ALTER PUBLICATION supabase_realtime ...  (Realtime у нас будет через Centrifugo)
#   - SET search_path (не нужно, может сбивать импорт)
#   - Ссылки на схемы auth., storage., vault. (не существуют в Timeweb)
#   - Комментарии с упоминанием Supabase (косметика)
# ================================================================

$INPUT_DIR   = "$PSScriptRoot\dump"
$OUTPUT_DIR  = "$PSScriptRoot\dump"
$FULL_DUMP   = "$INPUT_DIR\full_dump.sql"
$CLEAN_DUMP  = "$OUTPUT_DIR\full_dump_clean.sql"

if (-not (Test-Path $FULL_DUMP)) {
    Write-Host "ОШИБКА: Файл $FULL_DUMP не найден. Сначала запустите 02_dump_supabase.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "Читаю дамп: $FULL_DUMP ..." -ForegroundColor Cyan
$content = Get-Content -Path $FULL_DUMP -Raw -Encoding UTF8

$originalSize = $content.Length
Write-Host "Размер до очистки: $([math]::Round($originalSize/1KB, 1)) КБ"

# ----------------------------------------------------------------
# 1. Удаляем блоки supabase_realtime публикации
#    Паттерн: ALTER PUBLICATION supabase_realtime ...;
# ----------------------------------------------------------------
$before = ($content | Select-String -Pattern "supabase_realtime" -AllMatches).Matches.Count
$content = $content -replace '(?im)^.*supabase_realtime.*$(\r?\n)?', ''
$after = ($content | Select-String -Pattern "supabase_realtime" -AllMatches).Matches.Count
Write-Host "Удалено упоминаний supabase_realtime: $($before - $after)" -ForegroundColor Yellow

# ----------------------------------------------------------------
# 2. Удаляем SELECT pg_catalog.set_config('search_path', '', false)
#    Это Supabase-специфичная строка в начале дампа
# ----------------------------------------------------------------
$content = $content -replace "(?im)SELECT pg_catalog\.set_config\('search_path',.*?\).*?;(\r?\n)?", ''

# ----------------------------------------------------------------
# 3. Суpabase добавляет в дамп GRANT ... TO supabase_admin и т.п.
#    Удаляем гранты для несуществующих ролей
# ----------------------------------------------------------------
$content = $content -replace '(?im)^GRANT .* TO supabase[_a-z]*;.*$(\r?\n)?', ''
$content = $content -replace '(?im)^GRANT .* TO dashboard_user;.*$(\r?\n)?', ''
$content = $content -replace '(?im)^REVOKE .* FROM supabase[_a-z]*;.*$(\r?\n)?', ''

# ----------------------------------------------------------------
# 4. Убираем SET строки Supabase (supabase.auth.jwt_secret и т.п.)
# ----------------------------------------------------------------
$content = $content -replace '(?im)^SET supabase\..*$(\r?\n)?', ''

# ----------------------------------------------------------------
# 5. Комментарии с упоминанием Supabase Dashboard URL
# ----------------------------------------------------------------
$content = $content -replace '(?im)^-- .*supabase\.com.*$(\r?\n)?', ''

# ----------------------------------------------------------------
# 6. Пустые DO $$ $$ блоки (которые могут остаться после удалений)
# ----------------------------------------------------------------
$content = $content -replace '(?s)DO \$\$\s*BEGIN\s*END\s*\$\$;\s*', ''

# ----------------------------------------------------------------
# 7. Удаляем двойные пустые строки (косметика)
# ----------------------------------------------------------------
$content = $content -replace '(\r?\n){3,}', "`r`n`r`n"

# ----------------------------------------------------------------
# 8. Добавляем заголовок
# ----------------------------------------------------------------
$header = @"
-- ================================================================
-- ОЧИЩЕННЫЙ ДАМП ДЛЯ TIMEWEB CLOUD POSTGRESQL 18
-- Исходник: Supabase (схема public)
-- Дата генерации: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
-- Supabase-специфичные объекты удалены
-- Запускать ПОСЛЕ 01_pre_setup.sql
-- ================================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

"@

$content = $header + $content

# ----------------------------------------------------------------
# Сохраняем
# ----------------------------------------------------------------
$content | Set-Content -Path $CLEAN_DUMP -Encoding UTF8
$cleanSize = (Get-Item $CLEAN_DUMP).Length
Write-Host ""
Write-Host "Очищенный дамп сохранён: $CLEAN_DUMP" -ForegroundColor Green
Write-Host "Размер после очистки: $([math]::Round($cleanSize/1KB, 1)) КБ"

# ----------------------------------------------------------------
# Проверка: ищем оставшиеся Supabase-специфичные строки
# ----------------------------------------------------------------
Write-Host ""
Write-Host "=== Проверка остатков Supabase-специфики ===" -ForegroundColor Cyan
$checks = @(
    @{ Pattern = "supabase_realtime"; Name = "supabase_realtime" },
    @{ Pattern = "supabase\.com"; Name = "supabase.com URL" },
    @{ Pattern = "auth\.uid\(\)"; Name = "auth.uid()" },
    @{ Pattern = "storage\."; Name = "storage. schema" },
    @{ Pattern = "vault\."; Name = "vault. schema" }
)

$foundIssues = $false
foreach ($check in $checks) {
    $matches = ($content | Select-String -Pattern $check.Pattern -AllMatches).Matches.Count
    if ($matches -gt 0) {
        Write-Host "  ВНИМАНИЕ: найдено '$($check.Name)' — $matches раз" -ForegroundColor Yellow
        $foundIssues = $true
    } else {
        Write-Host "  OK: '$($check.Name)' — не найдено" -ForegroundColor Green
    }
}

if (-not $foundIssues) {
    Write-Host ""
    Write-Host "Все проверки пройдены! Дамп чист." -ForegroundColor Green
}

Write-Host ""
Write-Host "Следующий шаг: запустите 04_import.ps1" -ForegroundColor Cyan
