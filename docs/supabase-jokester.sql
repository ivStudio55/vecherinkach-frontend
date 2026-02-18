-- ========================================================
-- Пошути-кач (Jokester) — Supabase schema
-- ========================================================

-- Комнаты игры
CREATE TABLE IF NOT EXISTS jokester_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'lobby'
              CHECK (status IN (
                'lobby',           -- ожидание подключения игроков
                'starting',        -- предыгровая анимация
                'category_vote',   -- голосование за категории
                'round_rules',     -- показ правил раунда
                'round_playing',   -- дуэли идут
                'round_voting',    -- голосование за ответы дуэли
                'round_results',   -- результаты раунда
                'final_rules',     -- правила финала
                'final_playing',   -- финал
                'final_voting',    -- голосование финала
                'final_results',   -- результаты финала
                'credits',         -- титры
                'finished'         -- игра окончена
              )),
  current_round       INT NOT NULL DEFAULT 0,        -- 1,2,3,4(финал)
  current_duel_index  INT NOT NULL DEFAULT 0,        -- индекс текущей дуэли
  current_question    INT NOT NULL DEFAULT 0,        -- текущий вопрос в дуэли (0 или 1)
  voting_phase        TEXT DEFAULT 'idle'
              CHECK (voting_phase IN ('idle','answering','voting','results')),
  timer_started_at    TIMESTAMPTZ,
  timer_duration_sec  INT DEFAULT 120,
  host_id             UUID,
  state_version       INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Игроки
CREATE TABLE IF NOT EXISTS jokester_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES jokester_rooms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  avatar     TEXT NOT NULL DEFAULT 'ava1.png',
  role       TEXT NOT NULL DEFAULT 'player'
             CHECK (role IN ('player','spectator')),
  is_host    BOOLEAN NOT NULL DEFAULT false,
  total_points       INT NOT NULL DEFAULT 0,
  player_votes       INT NOT NULL DEFAULT 0,  -- голоса от других игроков
  spectator_votes    INT NOT NULL DEFAULT 0,  -- голоса от зрителей
  seat               INT NOT NULL DEFAULT 0,
  joined_at  TIMESTAMPTZ DEFAULT now()
);

-- Голосование за категории
CREATE TABLE IF NOT EXISTS jokester_category_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES jokester_rooms(id) ON DELETE CASCADE,
  round      INT NOT NULL,
  voter_id   UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, round, voter_id, category)
);

-- Расписание дуэлей в раунде
CREATE TABLE IF NOT EXISTS jokester_duels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID NOT NULL REFERENCES jokester_rooms(id) ON DELETE CASCADE,
  round          INT NOT NULL,
  duel_index     INT NOT NULL,           -- порядковый номер дуэли
  player1_id     UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  player2_id     UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  question1_text TEXT,                    -- первый вопрос
  question1_cat  TEXT,                    -- категория первого вопроса
  question2_text TEXT,                    -- второй вопрос
  question2_cat  TEXT,                    -- категория второго вопроса
  winner_id      UUID REFERENCES jokester_players(id),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','answering','voting','done')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Ответы дуэлянтов
CREATE TABLE IF NOT EXISTS jokester_answers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id    UUID NOT NULL REFERENCES jokester_duels(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  question_index INT NOT NULL CHECK (question_index IN (0, 1)),
  answer_text    TEXT NOT NULL DEFAULT '',
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(duel_id, player_id, question_index)
);

-- Голоса за ответы (от игроков и зрителей)
CREATE TABLE IF NOT EXISTS jokester_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id     UUID NOT NULL REFERENCES jokester_duels(id) ON DELETE CASCADE,
  voter_id    UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  question_index  INT NOT NULL CHECK (question_index IN (0, 1)),
  voted_for_id    UUID NOT NULL REFERENCES jokester_players(id) ON DELETE CASCADE,
  voter_role      TEXT NOT NULL DEFAULT 'player' CHECK (voter_role IN ('player','spectator')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(duel_id, voter_id, question_index)
);

-- Использованные вопросы (чтобы не повторялись)
CREATE TABLE IF NOT EXISTS jokester_used_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES jokester_rooms(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  category      TEXT NOT NULL,
  round         INT NOT NULL
);

-- ========================================================
-- RLS (открытый для MVP)
-- ========================================================
ALTER TABLE jokester_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_category_votes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_duels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_answers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jokester_used_questions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jokester_rooms_all"           ON jokester_rooms          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_players_all"         ON jokester_players        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_category_votes_all"  ON jokester_category_votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_duels_all"           ON jokester_duels          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_answers_all"         ON jokester_answers        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_votes_all"           ON jokester_votes          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "jokester_used_questions_all"  ON jokester_used_questions FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- Realtime
-- ========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_players;
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE jokester_category_votes;
