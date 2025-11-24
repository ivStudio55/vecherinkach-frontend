-- ============================================
-- ВКЛЮЧЕНИЕ REALTIME ДЛЯ ТАБЛИЦ
-- ============================================
-- Выполните этот скрипт в Supabase SQL Editor

-- Включаем Realtime для таблицы rooms
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- Включаем Realtime для таблицы players
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Включаем Realtime для таблицы answers
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

-- Проверяем, что таблицы добавлены в публикацию
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
