-- =====================================================================
-- Выживач (Survivach) — Supabase schema
-- =====================================================================

-- 1. Question Packs (extensibility: create new packs here)
CREATE TABLE IF NOT EXISTS survivach_packs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  base_url    TEXT NOT NULL DEFAULT 'https://storage.yandexcloud.net/vecherinkach/json/survivach',
  cell_sequence JSONB,    -- custom cell→mode mapping (null = use default 26-cell sequence)
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO survivach_packs (id, name, description) VALUES
  ('default', 'Базовый пакет', 'Стандартные вопросы для Выживача')
ON CONFLICT (id) DO NOTHING;

-- 2. Rooms
CREATE TABLE IF NOT EXISTS survivach_rooms (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'lobby'
    CHECK (status IN (
      'lobby',
      'rules',
      'moving',
      'round_intro',
      'round_playing',
      'round_results',
      'bet_reveal',
      'duel_intro',
      'duel_setup',
      'duel_playing',
      'duel_result',
      'blitz_intro',
      'blitz_playing',
      'blitz_results',
      'finished'
    )),
  current_round        INT NOT NULL DEFAULT 0,
  current_mode         TEXT CHECK (current_mode IN (
    'umnik','mathematician','art_historian','interpreter',
    'memory_diary','tag_puzzle','blitz'
  )),
  leader_position      INT NOT NULL DEFAULT 1,
  zombie_bomb_active   BOOLEAN NOT NULL DEFAULT false,
  zombie_bomb_player_id UUID,
  timer_started_at     TIMESTAMPTZ,
  timer_duration_sec   INT DEFAULT 30,
  pack_id              TEXT NOT NULL DEFAULT 'default' REFERENCES survivach_packs(id),
  question_data        JSONB,      -- current question being presented
  round_results_data   JSONB,      -- calculated results of last round
  bet_results_data     JSONB,      -- bet resolution data
  duel_data            JSONB,      -- active duel state
  host_id              UUID,
  state_version        INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- 3. Players
CREATE TABLE IF NOT EXISTS survivach_players (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id              UUID NOT NULL REFERENCES survivach_rooms(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  avatar               TEXT NOT NULL,     -- 'duck1' … 'duck8'
  position             INT NOT NULL DEFAULT 1,
  lives                INT NOT NULL DEFAULT 3,   -- 0 = zombie
  karma                INT NOT NULL DEFAULT 0,
  correct_streak       INT NOT NULL DEFAULT 0,
  total_correct        INT NOT NULL DEFAULT 0,
  total_answer_time_ms BIGINT NOT NULL DEFAULT 0,
  is_zombie            BOOLEAN NOT NULL DEFAULT false,
  is_host              BOOLEAN NOT NULL DEFAULT false,
  joined_at            TIMESTAMPTZ DEFAULT now()
);

-- 4. Round Answers
CREATE TABLE IF NOT EXISTS survivach_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES survivach_rooms(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES survivach_players(id) ON DELETE CASCADE,
  round         INT NOT NULL,
  answer_text   TEXT,
  answer_index  INT,
  answer_data   JSONB,         -- complex answers (memory sequence, math results, puzzle time, etc.)
  is_correct    BOOLEAN,
  answer_time_ms INT,
  submitted_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id, round)
);

-- 5. Bets ("Ставка на зеро")
CREATE TABLE IF NOT EXISTS survivach_bets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES survivach_rooms(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES survivach_players(id) ON DELETE CASCADE,
  round      INT NOT NULL,
  bet_type   TEXT NOT NULL CHECK (bet_type IN ('karma', 'life')),
  resolved   BOOLEAN NOT NULL DEFAULT false,
  won        BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id, round)
);

-- 6. Duels
CREATE TABLE IF NOT EXISTS survivach_duels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES survivach_rooms(id) ON DELETE CASCADE,
  round         INT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('minesweeper','arithmetic_mean','crowd_forecast')),
  challenger_id UUID NOT NULL REFERENCES survivach_players(id),
  challenged_id UUID NOT NULL REFERENCES survivach_players(id),
  winner_id     UUID REFERENCES survivach_players(id),
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','setup','playing','done')),
  duel_data     JSONB,    -- mode-specific state
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS survivach_players_room_idx
  ON survivach_players(room_id);
CREATE INDEX IF NOT EXISTS survivach_answers_room_round_idx
  ON survivach_answers(room_id, round);
CREATE INDEX IF NOT EXISTS survivach_bets_room_round_idx
  ON survivach_bets(room_id, round);
CREATE INDEX IF NOT EXISTS survivach_duels_room_round_idx
  ON survivach_duels(room_id, round);

-- Unique avatar & name per room (non-host players only)
CREATE UNIQUE INDEX IF NOT EXISTS survivach_unique_avatar_room
  ON survivach_players(room_id, avatar)
  WHERE is_host = false;
CREATE UNIQUE INDEX IF NOT EXISTS survivach_unique_name_room
  ON survivach_players(room_id, name)
  WHERE is_host = false;

-- 8. updated_at trigger for rooms
CREATE OR REPLACE FUNCTION set_survivach_room_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_survivach_room_updated_at ON survivach_rooms;
CREATE TRIGGER trg_survivach_room_updated_at
  BEFORE UPDATE ON survivach_rooms
  FOR EACH ROW EXECUTE FUNCTION set_survivach_room_updated_at();

-- 9. RLS
ALTER TABLE survivach_rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivach_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivach_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivach_bets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivach_duels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivach_packs    ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "survivach_rooms_r"   ON survivach_rooms   FOR SELECT USING (true);
CREATE POLICY "survivach_players_r" ON survivach_players FOR SELECT USING (true);
CREATE POLICY "survivach_answers_r" ON survivach_answers FOR SELECT USING (true);
CREATE POLICY "survivach_bets_r"    ON survivach_bets    FOR SELECT USING (true);
CREATE POLICY "survivach_duels_r"   ON survivach_duels   FOR SELECT USING (true);
CREATE POLICY "survivach_packs_r"   ON survivach_packs   FOR SELECT USING (true);

-- Anon write (game clients)
CREATE POLICY "survivach_rooms_i"   ON survivach_rooms   FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_rooms_u"   ON survivach_rooms   FOR UPDATE USING (true);
CREATE POLICY "survivach_players_i" ON survivach_players FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_players_u" ON survivach_players FOR UPDATE USING (true);
CREATE POLICY "survivach_answers_i" ON survivach_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_answers_u" ON survivach_answers FOR UPDATE USING (true);
CREATE POLICY "survivach_bets_i"    ON survivach_bets    FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_bets_u"    ON survivach_bets    FOR UPDATE USING (true);
CREATE POLICY "survivach_duels_i"   ON survivach_duels   FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_duels_u"   ON survivach_duels   FOR UPDATE USING (true);
CREATE POLICY "survivach_packs_i"   ON survivach_packs   FOR INSERT WITH CHECK (true);
CREATE POLICY "survivach_packs_u"   ON survivach_packs   FOR UPDATE USING (true);

-- 10. Enable Realtime for all survivach tables
ALTER PUBLICATION supabase_realtime ADD TABLE survivach_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE survivach_players;
ALTER PUBLICATION supabase_realtime ADD TABLE survivach_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE survivach_bets;
ALTER PUBLICATION supabase_realtime ADD TABLE survivach_duels;
