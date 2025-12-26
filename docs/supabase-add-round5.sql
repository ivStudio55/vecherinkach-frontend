-- ============================================
-- ДОБАВЛЕНИЕ РАУНДА 5 «Финал» (Цифровая интуиция)
-- ============================================
-- Запустите скрипт в Supabase SQL Editor.
-- Добавляет статусы round5-running / round5-explanation и таблицу round5_answers.

-- 1) Расширяем список допустимых статусов комнаты
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_status_check') THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
    END IF;

    -- Нормализуем существующие статусы, чтобы новое ограничение не упало
    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-ready',
        'round2-running',
        'round3-running',
        'round4-running',
        'round5-running',
        'round5-explanation',
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
            'round5-running',
            'round5-explanation',
            'finished'
        )
    );
END$$;

-- 2) Таблица ответов Раунда 5
CREATE TABLE IF NOT EXISTS public.round5_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_index integer NOT NULL, -- индекс в /public/questions/5round_question.json
    answer_value integer NOT NULL,
    points_earned integer NOT NULL DEFAULT 0,
    submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    elapsed_ms integer,
    UNIQUE (room_id, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_round5_answers_room_question
    ON public.round5_answers (room_id, question_index, submitted_at);

-- 3) RLS + открытая политика (как в MVP)
ALTER TABLE public.round5_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all operations on round5_answers" ON public.round5_answers;

    CREATE POLICY "Allow all operations on round5_answers"
    ON public.round5_answers FOR ALL
    USING (true)
    WITH CHECK (true);
END$$;

-- 4) Подключаем round5_answers к Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE round5_answers;

-- 5) Быстрая проверка
-- SELECT room_id, player_id, question_index, answer_value, points_earned, submitted_at
-- FROM round5_answers
-- ORDER BY submitted_at DESC
-- LIMIT 20;
