-- ============================================
-- ДОБАВЛЕНИЕ РАУНДА 4 «Дэшифровщик»
-- ============================================
-- Запустите скрипт в Supabase SQL Editor.
-- После применения таблица round4_answers будет доступна в Realtime, а rooms сможет
-- хранить статус round4-running.

-- 1) Расширяем список допустимых статусов комнаты (добавляем round3-running, round4-running)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_status_check') THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
    END IF;

    -- Сначала нормализуем все существующие статусы, чтобы новое ограничение не упало
    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-ready',
        'round2-running',
        'round3-running',
        'round4-running',
        'finished'
    );

    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-ready',
            'round2-running',
            'round3-running',
            'round4-running',
            'finished'
        )
    );

END$$;

-- 2) Таблица ответов Раунда 4 (фиксируем очки и корректность)
CREATE TABLE IF NOT EXISTS public.round4_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_id integer NOT NULL, -- id из app/public/questions/4round.json
    answer_text text NOT NULL DEFAULT '',
    is_correct boolean NOT NULL DEFAULT false,
    correct_rank integer, -- 1 для первого правильного, 2+ для следующих, NULL если неверно
    points_earned integer NOT NULL DEFAULT 0,
    submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    elapsed_ms integer, -- опционально: время ответа в мс с начала вопроса
    UNIQUE (room_id, player_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_round4_answers_room_puzzle
    ON public.round4_answers (room_id, puzzle_id, submitted_at);

-- 3) Включаем RLS и разрешаем доступ (как в остальных таблицах)
ALTER TABLE public.round4_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- PostgreSQL не поддерживает IF NOT EXISTS для CREATE POLICY, поэтому удаляем и создаём заново.
    DROP POLICY IF EXISTS "Allow all operations on round4_answers" ON public.round4_answers;

    CREATE POLICY "Allow all operations on round4_answers"
    ON public.round4_answers FOR ALL
    USING (true)
    WITH CHECK (true);
END$$;

-- 4) Подключаем round4_answers к Realtime публикации
ALTER PUBLICATION supabase_realtime ADD TABLE round4_answers;

-- 5) Быстрая проверка
-- SELECT room_id, player_id, puzzle_id, answer_text, is_correct, correct_rank, points_earned, submitted_at
-- FROM round4_answers
-- ORDER BY submitted_at DESC
-- LIMIT 20;
