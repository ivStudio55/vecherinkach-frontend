-- Question Packs table for dynamic pack management
-- Run against: postgres://gen_user:3WdY)K<{=Mc=rJ@5.42.107.149:5432/default_db

CREATE TABLE IF NOT EXISTS question_packs (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text DEFAULT '',
  is_public boolean DEFAULT false,
  is_active boolean DEFAULT true,
  json_base_url text NOT NULL,
  audio_round2_start integer DEFAULT 1,
  audio_round2_end integer DEFAULT 81,
  audio_round3_start integer DEFAULT 1,
  audio_round5_start integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed built-in packs
INSERT INTO question_packs (id, label, description, is_public, is_active, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start)
VALUES
  ('classic', 'Классический', 'Оригинальный пакет вопросов', true, true,
   'https://storage.yandexcloud.net/vecherinkach/json/main_questions',
   1, 81, 1, 1),
  ('03012026', 'Пакет от 16.01.2026', 'Альтернативный пакет вопросов', true, true,
   'https://storage.yandexcloud.net/vecherinkach/json/packs/03012026',
   82, 93, 67, 68)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE question_packs ENABLE ROW LEVEL SECURITY;

-- Public read access for active public packs
DROP POLICY IF EXISTS "read_public_packs" ON question_packs;
CREATE POLICY "read_public_packs"
  ON question_packs FOR SELECT
  USING (true);

-- Full access for gen_user (used by admin API through service role key)
GRANT SELECT, INSERT, UPDATE, DELETE ON question_packs TO gen_user;
