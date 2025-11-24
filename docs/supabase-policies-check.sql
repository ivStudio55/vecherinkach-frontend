-- Проверка политик RLS для таблицы rooms
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Проверяем, включен ли RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('rooms', 'players', 'questions', 'answers');

-- 2. Смотрим существующие политики
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('rooms', 'players', 'questions', 'answers');

-- 3. Если политик нет - создаём открытые (для MVP):
-- ВАЖНО: Это небезопасно для продакшена, только для разработки!

-- Политики для rooms
DROP POLICY IF EXISTS "Allow all access to rooms" ON rooms;
CREATE POLICY "Allow all access to rooms"
ON rooms FOR ALL
USING (true)
WITH CHECK (true);

-- Политики для players
DROP POLICY IF EXISTS "Allow all access to players" ON players;
CREATE POLICY "Allow all access to players"
ON players FOR ALL
USING (true)
WITH CHECK (true);

-- Политики для questions (только чтение для всех)
DROP POLICY IF EXISTS "Allow read access to questions" ON questions;
CREATE POLICY "Allow read access to questions"
ON questions FOR SELECT
USING (true);

-- Политики для answers
DROP POLICY IF EXISTS "Allow all access to answers" ON answers;
CREATE POLICY "Allow all access to answers"
ON answers FOR ALL
USING (true)
WITH CHECK (true);
