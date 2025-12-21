-- ============================================
-- ROUND 3: ответы + голосование
-- Выполните этот скрипт в Supabase SQL Editor
-- ============================================

-- 0) Важно про ошибку rooms_status_check
-- Если у вас уже есть CHECK constraint на rooms.status, то при ALTER TABLE ADD CONSTRAINT
-- Postgres проверяет ВСЕ существующие строки. Ошибка вида:
--   ERROR: 23514: check constraint "rooms_status_check" ... is violated by some row
-- значит, что в таблице rooms уже есть статусы, которые не входят в новый список.
--
-- Диагностика (выполните отдельно):
--   SELECT status, COUNT(*) FROM public.rooms GROUP BY status ORDER BY status;
--   SELECT id, code, status FROM public.rooms WHERE status NOT IN ('waiting','running','round2-running','round3-running','finished');
--
-- Решение: либо добавить ваши реальные статусы в CHECK, либо привести данные к допустимым значениям.
-- Для MVP этот скрипт НЕ трогает rooms_status_check, чтобы не ломать существующие данные.

-- 2) Таблица ответов игроков для Раунда 3
CREATE TABLE IF NOT EXISTS public.round3_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  text text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (room_id, player_id, question_index)
);

-- Совместимость со старой схемой (если таблица уже есть, а колонка называлась answer)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_answers'
      AND column_name = 'answer'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_answers'
      AND column_name = 'text'
  ) THEN
    ALTER TABLE public.round3_answers RENAME COLUMN answer TO text;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_round3_answers_room_question
  ON public.round3_answers (room_id, question_index);

-- 3) Таблица голосов (каждый игрок голосует 1 раз за вопрос)
CREATE TABLE IF NOT EXISTS public.round3_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  voter_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  answer_id uuid NOT NULL REFERENCES public.round3_answers(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (room_id, voter_player_id, question_index)
);

-- Совместимость со старой схемой (если таблица уже есть, а voter назывался player_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_votes'
      AND column_name = 'player_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_votes'
      AND column_name = 'voter_player_id'
  ) THEN
    ALTER TABLE public.round3_votes RENAME COLUMN player_id TO voter_player_id;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_round3_votes_room_question
  ON public.round3_votes (room_id, question_index);

-- На всякий случай: upsert в Supabase требует уникальный индекс/constraint по onConflict-колонкам.
-- Даже если UNIQUE constraint уже есть — этот индекс IF NOT EXISTS безопасен.
CREATE UNIQUE INDEX IF NOT EXISTS ux_round3_answers_room_player_question
  ON public.round3_answers (room_id, player_id, question_index);

CREATE UNIQUE INDEX IF NOT EXISTS ux_round3_votes_room_voter_question
  ON public.round3_votes (room_id, voter_player_id, question_index);

-- 4) RLS (для MVP: открытый доступ, как в других скриптах проекта)
ALTER TABLE public.round3_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round3_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round3_answers' AND policyname = 'Allow all operations on round3_answers'
  ) THEN
    CREATE POLICY "Allow all operations on round3_answers"
    ON public.round3_answers FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round3_votes' AND policyname = 'Allow all operations on round3_votes'
  ) THEN
    CREATE POLICY "Allow all operations on round3_votes"
    ON public.round3_votes FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END$$;
