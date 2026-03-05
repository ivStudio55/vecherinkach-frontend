-- ================================================================
-- ШАГ 5: Верификация после импорта
-- Запустить в psql или pgAdmin для Timeweb
-- Все запросы должны вернуть ожидаемые результаты
-- ================================================================

\set ON_ERROR_STOP off
\timing on

-- ----------------------------------------------------------------
-- 1. ВЕРСИЯ POSTGRESQL
-- ----------------------------------------------------------------
\echo '=== PostgreSQL Version ==='
SELECT version();

-- ----------------------------------------------------------------
-- 2. РАСШИРЕНИЯ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Установленные расширения ==='
SELECT name, installed_version
FROM pg_extension e
JOIN pg_available_extensions a ON a.name = e.extname
ORDER BY name;

-- ----------------------------------------------------------------
-- 3. РОЛИ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Роли (anon, authenticated, service_role) ==='
SELECT rolname, rolcanlogin, rolinherit, rolsuper
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY rolname;

-- ----------------------------------------------------------------
-- 4. ВСЕ ТАБЛИЦЫ В СХЕМЕ public
-- ----------------------------------------------------------------
\echo ''
\echo '=== Таблицы и количество строк ==='
SELECT
    schemaname,
    tablename,
    (xpath('/row/c/text()',
           query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', schemaname, tablename), false, true, ''))
    )[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ----------------------------------------------------------------
-- 5. ОЖИДАЕМЫЕ ТАБЛИЦЫ (проверка наличия)
-- ----------------------------------------------------------------
\echo ''
\echo '=== Проверка наличия ключевых таблиц ==='
SELECT
    tablename,
    CASE WHEN tablename = ANY(ARRAY[
        'rooms', 'players', 'questions', 'answers',
        'round2_answers', 'round3_answers', 'round3_votes',
        'round4_answers', 'round5_answers',
        'game_results', 'logs', 'app_settings', 'question_likes',
        'jokester_rooms', 'jokester_players', 'jokester_duels',
        'jokester_answers', 'jokester_votes', 'jokester_category_votes', 'jokester_used_questions',
        'creativach_rooms', 'creativach_players', 'creativach_answers', 'creativach_votes',
        'draw_rooms', 'draw_players', 'draw_chains', 'draw_steps', 'draw_votes', 'draw_words',
        'uno_rooms', 'uno_players', 'uno_events', 'irregular_verbs'
    ]) THEN '✓ OK' ELSE '← дополнительная' END AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ----------------------------------------------------------------
-- 6. ФУНКЦИИ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Созданные функции ==='
SELECT
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    l.lanname AS language
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- ----------------------------------------------------------------
-- 7. ТРИГГЕРЫ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Триггеры ==='
SELECT
    trigger_name,
    event_object_table AS table_name,
    event_manipulation AS event,
    action_timing AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ----------------------------------------------------------------
-- 8. RLS СТАТУС
-- ----------------------------------------------------------------
\echo ''
\echo '=== Row Level Security (должно быть enabled на всех таблицах) ==='
SELECT
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ----------------------------------------------------------------
-- 9. RLS ПОЛИТИКИ
-- ----------------------------------------------------------------
\echo ''
\echo '=== RLS Политики ==='
SELECT
    tablename,
    policyname,
    cmd AS operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------
-- 10. ИНДЕКСЫ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Индексы ==='
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;

-- ----------------------------------------------------------------
-- 11. ОГРАНИЧЕНИЯ ВНЕШНИХ КЛЮЧЕЙ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Внешние ключи ==='
SELECT
    tc.table_name AS from_table,
    kcu.column_name AS from_column,
    ccu.table_name AS to_table,
    ccu.column_name AS to_column,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ----------------------------------------------------------------
-- 12. ПРОВЕРКА КЛЮЧЕВЫХ ДАННЫХ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Данные: irregular_verbs (UNO — должно быть ~150 слов) ==='
SELECT COUNT(*) AS verb_count FROM irregular_verbs;

\echo ''
\echo '=== Данные: draw_words (Рисункач — должно быть ~100 слов) ==='
SELECT COUNT(*) AS word_count FROM draw_words;

\echo ''
\echo '=== Данные: app_settings ==='
SELECT * FROM app_settings;

-- ----------------------------------------------------------------
-- 13. ТЕСТ RPC ФУНКЦИЙ
-- ----------------------------------------------------------------
\echo ''
\echo '=== Тест функции get_server_time() ==='
SELECT public.get_server_time() AS server_time;

\echo ''
\echo '=== Тест функции get_max_active_rooms() ==='
SELECT public.get_max_active_rooms() AS max_rooms;

-- ----------------------------------------------------------------
-- 14. ПРОВЕРКА BUMP TRIGGER
-- ----------------------------------------------------------------
\echo ''
\echo '=== Тест триггера state_version на rooms ==='
-- Создаём тестовую комнату
INSERT INTO public.rooms (code, is_active, status) VALUES ('__test__', false, 'waiting');
SELECT code, state_version AS "version_before_update"
FROM public.rooms WHERE code = '__test__';

-- Обновляем
UPDATE public.rooms SET is_active = false WHERE code = '__test__';
SELECT code, state_version AS "version_after_update (должно быть +1)"
FROM public.rooms WHERE code = '__test__';

-- Удаляем тестовую строку
DELETE FROM public.rooms WHERE code = '__test__';
\echo 'Тестовая строка удалена'

-- ----------------------------------------------------------------
-- ИТОГ
-- ----------------------------------------------------------------
\echo ''
\echo '=== ИТОГ ВЕРИФИКАЦИИ ==='
\echo 'Проверьте:'
\echo '  1. Все ~33 таблицы присутствуют (row_count в п.4)'
\echo '  2. Все функции созданы (п.6)'
\echo '  3. Триггеры trg_bump_room_state_version и trg_jokester_room_updated_at присутствуют (п.7)'
\echo '  4. RLS включён на всех таблицах (п.8)'
\echo '  5. irregular_verbs ~150 записей (п.12)'
\echo '  6. draw_words ~100 записей (п.12)'
\echo '  7. state_version увеличился на 1 (п.14)'
