-- ============================================
-- ВКЛЮЧЕНИЕ REALTIME ДЛЯ ТАБЛИЦ
-- ============================================
-- Выполните этот скрипт в Supabase SQL Editor

	-- Включаем Realtime для таблиц (без ошибки, если уже добавлены)
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
		) THEN
			ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
		END IF;

		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime' AND tablename = 'players'
		) THEN
			ALTER PUBLICATION supabase_realtime ADD TABLE players;
		END IF;

		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime' AND tablename = 'answers'
		) THEN
			ALTER PUBLICATION supabase_realtime ADD TABLE answers;
		END IF;

		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime' AND tablename = 'round2_answers'
		) THEN
			ALTER PUBLICATION supabase_realtime ADD TABLE round2_answers;
		END IF;
	END $$;

-- Проверяем, что таблицы добавлены в публикацию
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
