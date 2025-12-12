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
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_status_check'
    ) THEN
        ALTER TABLE rooms
        DROP CONSTRAINT rooms_status_check;
    END IF;
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-running',
            'round2-ready',
            'round3-ready',
            'round3-running',
            'finished'
        )
    );
    END$$;

    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS explanation text;

    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-running',
        'round2-ready',
        'round3-ready',
        'round3-running',
        'finished'
    );

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

    -- Храним список выбранных вопросов для раунда
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS selected_question_ids integer[];

    -- Поля для Раунда 2 "Фейколов"
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS round2_item_index integer,
    ADD COLUMN IF NOT EXISTS round2_showing_fact boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS round2_phase TEXT DEFAULT 'idle';

    CREATE TABLE IF NOT EXISTS public.round2_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        item_index integer NOT NULL,
        answer_is_fact boolean NOT NULL,
        is_correct boolean NOT NULL,
        points_earned integer NOT NULL DEFAULT 0,
        submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
        UNIQUE (room_id, player_id, item_index)
    );

    CREATE INDEX IF NOT EXISTS idx_round2_answers_room_item
        ON public.round2_answers (room_id, item_index);

    DO $$
    BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_round2_phase_check'
    ) THEN
        ALTER TABLE rooms
        DROP CONSTRAINT rooms_round2_phase_check;
    END IF;
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_round2_phase_check CHECK (round2_phase IN ('idle', 'fact', 'explanation'));
    END$$;

    UPDATE rooms
    SET round2_phase = 'idle'
    WHERE round2_phase IS NULL OR round2_phase NOT IN ('idle', 'fact', 'explanation');

    -- Поля для Раунда 3 «МозгоШтурм»
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS round3_question_id integer,
    ADD COLUMN IF NOT EXISTS round3_question_index integer,
    ADD COLUMN IF NOT EXISTS round3_question_started_at timestamptz;

    CREATE TABLE IF NOT EXISTS public.round3_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        question_index integer NOT NULL,
        answer text NOT NULL,
        submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
        updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
        UNIQUE (room_id, player_id, question_index)
    );

    CREATE INDEX IF NOT EXISTS idx_round3_answers_room_question
        ON public.round3_answers (room_id, question_index);

    CREATE INDEX IF NOT EXISTS idx_round3_answers_room_player
        ON public.round3_answers (room_id, player_id);
