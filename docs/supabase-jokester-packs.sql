-- ========================================================
-- Пошути-кач — Пакеты вопросов
-- ========================================================

-- 1) Таблица пакетов вопросов для Пошутикач
CREATE TABLE IF NOT EXISTS jokester_question_packs (
  id          TEXT PRIMARY KEY,                       -- slug: "classic", "pack_birthday" и т.д.
  label       TEXT NOT NULL,                          -- отображаемое название
  description TEXT NOT NULL DEFAULT '',
  is_public   BOOLEAN NOT NULL DEFAULT false,         -- виден ли в списке выбора
  is_active   BOOLEAN NOT NULL DEFAULT true,          -- soft-delete
  json_url    TEXT NOT NULL,                           -- полный URL до jokester_questions.json
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Классический пакет (встроенный)
INSERT INTO jokester_question_packs (id, label, description, is_public, is_active, json_url)
VALUES (
  'classic',
  'Классический',
  'Стандартный набор вопросов',
  true,
  true,
  'https://storage.yandexcloud.net/vecherinkach/json/main_questions/jokester_questions.json'
)
ON CONFLICT (id) DO NOTHING;

-- 2) Добавляем pack_id в jokester_rooms
ALTER TABLE jokester_rooms
  ADD COLUMN IF NOT EXISTS pack_id TEXT DEFAULT 'classic';

-- 3) RLS‑политики (anon read для активных публичных)
ALTER TABLE jokester_question_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jokester_packs_anon_read ON jokester_question_packs
  FOR SELECT USING (is_active = true);

-- 4) Индекс
CREATE INDEX IF NOT EXISTS jokester_packs_active_public_idx
  ON jokester_question_packs (is_active, is_public);
