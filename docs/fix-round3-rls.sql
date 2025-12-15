-- Исправление политик доступа (RLS) для Раунда 3
-- Выполните этот скрипт в Supabase SQL Editor
-- Предварительно очистите окно редактора от старых запросов

-- 1. Включаем RLS (на всякий случай)
ALTER TABLE round3_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE round3_votes ENABLE ROW LEVEL SECURITY;

-- 2. Безопасно удаляем старые политики
DO $$
BEGIN
    -- Удаляем политику для ответов, если есть
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'round3_answers' 
        AND policyname = 'Allow all operations on round3_answers'
    ) THEN
        DROP POLICY "Allow all operations on round3_answers" ON round3_answers;
    END IF;

    -- Удаляем политику для голосов, если есть
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'round3_votes' 
        AND policyname = 'Allow all operations on round3_votes'
    ) THEN
        DROP POLICY "Allow all operations on round3_votes" ON round3_votes;
    END IF;
END
$$;

-- 3. Создаём новые разрешающие политики
CREATE POLICY "Allow all operations on round3_answers"
ON round3_answers FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on round3_votes"
ON round3_votes FOR ALL
USING (true)
WITH CHECK (true);
