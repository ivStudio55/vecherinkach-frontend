    -- Добавляем время старта вопроса и объяснения к вопросам
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS question_started_at timestamptz;

    ALTER TABLE rooms
    ALTER COLUMN question_started_at DROP NOT NULL;

    ALTER TABLE rooms
    ALTER COLUMN question_started_at DROP DEFAULT;

    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting';

    DO $$
    BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_status_check'
    ) THEN
        ALTER TABLE rooms
        ADD CONSTRAINT rooms_status_check CHECK (status IN ('waiting', 'running', 'finished'));
    END IF;
    END$$;

    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS explanation text;

    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN ('waiting', 'running', 'finished');

    UPDATE rooms
    SET question_started_at = NULL
    WHERE status = 'waiting';

    UPDATE rooms
    SET question_started_at = timezone('utc', now())
    WHERE status = 'running' AND question_started_at IS NULL;

    UPDATE questions
    SET explanation = '7 умножить на 8 — это 56.'
    WHERE text = 'Сколько будет 7 × 8?' AND (explanation IS NULL OR explanation = '');

        -- Функция для получения серверного времени (используется для синхронизации таймера)
        CREATE OR REPLACE FUNCTION get_server_time()
        RETURNS timestamptz
        LANGUAGE sql
        STABLE
        AS $$
            SELECT timezone('utc', now());
        $$;

    -- Флаг, что ведущему не нужно ждать таймер (все игроки ответили)
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS all_players_answered boolean NOT NULL DEFAULT false;

    UPDATE rooms
    SET all_players_answered = false
    WHERE all_players_answered IS NULL;
