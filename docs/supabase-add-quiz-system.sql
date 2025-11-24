-- ============================================
-- ОБНОВЛЕНИЕ БД: ДОБАВЛЕНИЕ ВАРИАНТОВ ОТВЕТОВ И БАЛЛОВ
-- ============================================

-- 1. Удаляем старые вопросы
DELETE FROM questions;

-- 2. Изменяем структуру таблицы questions
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'easy',
ADD COLUMN IF NOT EXISTS points INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS option_a TEXT,
ADD COLUMN IF NOT EXISTS option_b TEXT,
ADD COLUMN IF NOT EXISTS option_c TEXT,
ADD COLUMN IF NOT EXISTS option_d TEXT,
ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- 3. Изменяем таблицу answers - теперь сохраняем выбранный вариант
ALTER TABLE answers 
ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS points_earned INT DEFAULT 0;

-- 4. Добавляем поле points в таблицу players
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS total_points INT DEFAULT 0;

-- 5. Добавляем разогревочные вопросы по математике

INSERT INTO questions (text, "order", difficulty, points, option_a, option_b, option_c, option_d, correct_answer) VALUES
-- Лёгкие вопросы (10 баллов)
('Сколько будет 7 × 8?', 1, 'easy', 10, '54', '56', '64', '48', 'b'),
('Чему равен корень из 64?', 2, 'easy', 10, '6', '7', '8', '9', 'c'),

-- Средние вопросы (20 баллов)
('Чему равно 15% от 200?', 3, 'medium', 20, '25', '30', '35', '40', 'b'),
('Решите: 3x + 5 = 20. Чему равен x?', 4, 'medium', 20, '3', '4', '5', '6', 'c'),

-- Сложные вопросы (30 баллов)
('Чему равна площадь треугольника с основанием 10 см и высотой 8 см?', 5, 'hard', 30, '80 см²', '40 см²', '20 см²', '18 см²', 'b'),
('Чему равно значение: 2³ + 3² - 5?', 6, 'hard', 30, '10', '12', '14', '16', 'b');

-- 6. Создаём таблицу для хранения результатов
CREATE TABLE IF NOT EXISTS game_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    total_points INT DEFAULT 0,
    correct_answers INT DEFAULT 0,
    total_questions INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Включаем RLS для новой таблицы
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on game_results"
ON game_results FOR ALL
USING (true)
WITH CHECK (true);

-- 7. Проверяем результат
SELECT 
    "order" as "№",
    text as "Вопрос",
    difficulty as "Сложность",
    points as "Баллы",
    option_a as "А",
    option_b as "Б",
    option_c as "В",
    option_d as "Г",
    correct_answer as "Правильный"
FROM questions
ORDER BY "order";
