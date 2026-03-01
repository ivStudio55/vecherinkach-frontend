-- ========================================================
-- Креативач (Creativach) — Supabase schema
-- ========================================================

-- Комнаты игры
CREATE TABLE IF NOT EXISTS creativach_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'lobby'
              CHECK (status IN (
                'lobby',             -- ожидание подключения игроков
                'round_rules',       -- показ правил раунда
                'round_playing',     -- игроки пишут ответы
                'round_voting',      -- голосование за ответы
                'round_results',     -- результаты раунда
                'final_rules',       -- правила финала
                'final_playing',     -- финал — игроки пишут
                'final_voting',      -- голосование финала
                'final_results',     -- финальные результаты
                'credits',           -- титры
                'finished'           -- игра окончена
              )),
  current_round       INT NOT NULL DEFAULT 0,        -- 1..5
  round_task          TEXT,                           -- текст задания (буквы, ситуация, бренд, цель)
  round_task_extra    TEXT,                           -- дополнительные данные (тема финала)
  voting_phase        TEXT DEFAULT 'idle'
              CHECK (voting_phase IN ('idle','answering','voting','results')),
  timer_started_at    TIMESTAMPTZ,
  timer_duration_sec  INT DEFAULT 60,
  host_id             UUID,
  state_version       INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Игроки
CREATE TABLE IF NOT EXISTS creativach_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES creativach_rooms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  avatar     TEXT NOT NULL DEFAULT '1.png',
  role       TEXT NOT NULL DEFAULT 'player'
             CHECK (role IN ('player','spectator')),
  is_host    BOOLEAN NOT NULL DEFAULT false,
  total_points       INT NOT NULL DEFAULT 0,
  seat               INT NOT NULL DEFAULT 0,
  joined_at  TIMESTAMPTZ DEFAULT now()
);

-- Ответы игроков (по раундам)
CREATE TABLE IF NOT EXISTS creativach_answers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES creativach_rooms(id) ON DELETE CASCADE,
  round      INT NOT NULL,
  player_id  UUID NOT NULL REFERENCES creativach_players(id) ON DELETE CASCADE,
  answer_text    TEXT NOT NULL DEFAULT '',
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, round, player_id)
);

-- Голоса за ответы (от игроков и зрителей)
CREATE TABLE IF NOT EXISTS creativach_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES creativach_rooms(id) ON DELETE CASCADE,
  round       INT NOT NULL,
  voter_id    UUID NOT NULL REFERENCES creativach_players(id) ON DELETE CASCADE,
  voted_for_id UUID NOT NULL REFERENCES creativach_players(id) ON DELETE CASCADE,
  voter_role  TEXT NOT NULL DEFAULT 'player' CHECK (voter_role IN ('player','spectator')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, round, voter_id)
);

-- ========================================================
-- RLS (открытый для MVP)
-- ========================================================
ALTER TABLE creativach_rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE creativach_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE creativach_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE creativach_votes    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'creativach_rooms' AND policyname = 'creativach_rooms_all'
  ) THEN
    CREATE POLICY "creativach_rooms_all" ON creativach_rooms FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'creativach_players' AND policyname = 'creativach_players_all'
  ) THEN
    CREATE POLICY "creativach_players_all" ON creativach_players FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'creativach_answers' AND policyname = 'creativach_answers_all'
  ) THEN
    CREATE POLICY "creativach_answers_all" ON creativach_answers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'creativach_votes' AND policyname = 'creativach_votes_all'
  ) THEN
    CREATE POLICY "creativach_votes_all" ON creativach_votes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ========================================================
-- Realtime
-- ========================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creativach_rooms;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creativach_players;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creativach_answers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE creativach_votes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
