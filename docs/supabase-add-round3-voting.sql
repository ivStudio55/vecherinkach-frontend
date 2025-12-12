-- Раунд 3: фазы голосования и таблица голосов
-- Выполните в Supabase SQL Editor.

-- Новые статусы для Раунда 3 (рекомендуется обновить check-констрейнты вручную, если есть)
-- round3-running  – ввод ответов (30 сек)
-- round3-voting   – голосование за чужие ответы (15 сек)
-- round3-reveal   – показ правильного ответа/комментария

-- Поля комнаты для таймеров Раунда 3
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS round3_vote_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS round3_phase text;

-- Опционально: ужесточить фазы
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rooms' AND column_name = 'round3_phase'
  ) THEN
    BEGIN
      ALTER TABLE rooms
      ADD CONSTRAINT rooms_round3_phase_check CHECK (round3_phase IN ('input','vote','reveal'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;

-- Таблица голосов Раунда 3
CREATE TABLE IF NOT EXISTS public.round3_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_index integer NOT NULL,
    answer_id uuid NOT NULL REFERENCES round3_answers(id) ON DELETE CASCADE,
    submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (room_id, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_round3_votes_room_question
  ON public.round3_votes (room_id, question_index);

CREATE INDEX IF NOT EXISTS idx_round3_votes_room_player
  ON public.round3_votes (room_id, player_id);
