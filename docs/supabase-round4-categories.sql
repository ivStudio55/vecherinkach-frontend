-- Round 4 categories table
-- Stores category names (Cyrillic) and their corresponding audio folder keys (Latin)

CREATE TABLE IF NOT EXISTS round4_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,           -- Cyrillic display name, e.g. "Американский кинематограф"
  folder_key TEXT NOT NULL UNIQUE,     -- Latin folder name under category_of_round4/, e.g. "american_cinema"
  audio_variants INT NOT NULL DEFAULT 3, -- Number of audio files (1.mp3, 2.mp3, ...)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE round4_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round4_categories_read" ON round4_categories
  FOR SELECT USING (true);

CREATE POLICY "round4_categories_service" ON round4_categories
  FOR ALL USING (true) WITH CHECK (true);

-- Seed existing categories
INSERT INTO round4_categories (name, folder_key, audio_variants) VALUES
  ('Новый год', 'new_year', 3),
  ('Дисней', 'disney', 3),
  ('Американский кинематограф', 'american_cinema', 3),
  ('Американские Мультфильмы', 'american_cartoons', 3),
  ('Сериалы', 'series', 3),
  ('Зарубежная эстрада', 'foreign_bandstand', 3),
  ('Русский рок', 'russian_rock', 3),
  ('Советская эстрада', 'soviet_bandstand', 3),
  ('Советский мультфильм', 'soviet_cartoon', 3),
  ('Советский кинематограф', 'soviet_cinema', 1),
  ('Классика', 'classic', 3),
  ('Сказка', 'fairy_tale', 3),
  ('Современная отечественная Эстрада', 'modern_russian_bandstand', 3),
  ('Русская литература', 'russian_literature', 3)
ON CONFLICT (name) DO NOTHING;
