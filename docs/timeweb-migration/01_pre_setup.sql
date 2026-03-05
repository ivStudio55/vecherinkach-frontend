-- ================================================================
-- ШАГ 1: Подготовка Timeweb PostgreSQL 18
-- Запустить ПЕРВЫМ — до импорта дампа
--
-- ВАЖНО: Timeweb managed PostgreSQL не разрешает CREATE ROLE.
-- Мы используем gen_user для всего (вместо anon/authenticated/service_role).
-- PostgREST настроен на gen_user как db-anon-role.
-- JWT-токены имеют role: "gen_user" вместо role: "authenticated".
-- ================================================================

-- ----------------------------------------------------------------
-- 1. РАСШИРЕНИЯ
--    В PostgreSQL 18 gen_random_uuid() — встроен в ядро.
--    pgcrypto и uuid-ossp для совместимости со старыми функциями.
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- 2. ПРАВА НА СХЕМУ public для gen_user
--    (Применяется и к уже существующим, и к будущим объектам)
-- ----------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO gen_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gen_user;
-- NOTE: GRANT EXECUTE ON ALL FUNCTIONS — пропускаем, extension-функции
-- (pgcrypto, uuid-ossp) уже доступны PUBLIC по умолчанию.
-- После импорта дампа пользовательские функции будут принадлежать gen_user.

-- Права на будущие объекты
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO gen_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO gen_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO gen_user;

-- ----------------------------------------------------------------
-- 3. ПРОВЕРКА
-- ----------------------------------------------------------------

SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('pgcrypto', 'uuid-ossp')
ORDER BY name;

SELECT version();
