-- ========================================================
-- Пошути-кач (Jokester) — update v2
-- Применять ПОСЛЕ базового docs/supabase-jokester.sql
-- ========================================================

-- 1) Уникальность аватарки среди ИГРОКОВ в рамках комнаты
-- (зрителям разрешён повтор)
CREATE UNIQUE INDEX IF NOT EXISTS jokester_unique_player_avatar_in_room
ON jokester_players (room_id, avatar)
WHERE role = 'player' AND is_host = false;

-- 2) Индексы для быстрого realtime/fetch
CREATE INDEX IF NOT EXISTS jokester_players_room_role_idx
  ON jokester_players (room_id, role);

CREATE INDEX IF NOT EXISTS jokester_duels_room_round_idx
  ON jokester_duels (room_id, round, duel_index);

CREATE INDEX IF NOT EXISTS jokester_answers_duel_player_question_idx
  ON jokester_answers (duel_id, player_id, question_index);

CREATE INDEX IF NOT EXISTS jokester_votes_duel_question_idx
  ON jokester_votes (duel_id, question_index);

CREATE INDEX IF NOT EXISTS jokester_category_votes_room_round_idx
  ON jokester_category_votes (room_id, round, voter_id);

CREATE INDEX IF NOT EXISTS jokester_used_questions_room_idx
  ON jokester_used_questions (room_id, round);

-- 3) Триггер обновления updated_at для room
CREATE OR REPLACE FUNCTION set_jokester_room_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jokester_room_updated_at ON jokester_rooms;
CREATE TRIGGER trg_jokester_room_updated_at
BEFORE UPDATE ON jokester_rooms
FOR EACH ROW
EXECUTE FUNCTION set_jokester_room_updated_at();

-- 4) Защита от дублей дуэлей по round+index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jokester_duels_room_round_duel_index_key'
  ) THEN
    ALTER TABLE jokester_duels
      ADD CONSTRAINT jokester_duels_room_round_duel_index_key
      UNIQUE (room_id, round, duel_index);
  END IF;
END $$;

-- 5) Нормализация аватаров под файлы public/audio/sound/Jokester/ava (1.png..14.png)
ALTER TABLE jokester_players
  ALTER COLUMN avatar SET DEFAULT '1.png';

UPDATE jokester_players
SET avatar = regexp_replace(avatar, '^ava([0-9]+)\\.png$', '\\1.png', 'i')
WHERE avatar ~* '^ava[0-9]+\\.png$';
