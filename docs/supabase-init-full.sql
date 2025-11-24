-- ============================================
-- ПОЛНАЯ ИНИЦИАЛИЗАЦИЯ БД ДЛЯ ПРОЕКТА "ВЕЧЕРИНКАЧ"
-- ============================================
-- Выполните весь этот скрипт в Supabase SQL Editor
-- (https://supabase.com/dashboard/project/vqrspimfhimntbrwxvvi/sql/new)

-- 1. УДАЛЯЕМ СТАРЫЕ ТАБЛИЦЫ (если есть)
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- 2. СОЗДАЁМ ТАБЛИЦЫ

-- Таблица комнат
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    current_question_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица вопросов
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    "order" INT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица игроков
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица ответов
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    question_index INT NOT NULL,
    text TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ВКЛЮЧАЕМ RLS НА ВСЕХ ТАБЛИЦАХ
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- 4. СОЗДАЁМ ОТКРЫТЫЕ ПОЛИТИКИ (ДЛЯ MVP)
-- ⚠️ ВНИМАНИЕ: Это небезопасно для продакшена! Только для разработки!

-- Политики для rooms (полный доступ)
CREATE POLICY "Allow all operations on rooms"
ON rooms FOR ALL
USING (true)
WITH CHECK (true);

-- Политики для questions (только чтение)
CREATE POLICY "Allow read access to questions"
ON questions FOR SELECT
USING (true);

-- Для вставки вопросов (только для сервиса/админа)
CREATE POLICY "Allow insert questions"
ON questions FOR INSERT
WITH CHECK (true);

-- Политики для players (полный доступ)
CREATE POLICY "Allow all operations on players"
ON players FOR ALL
USING (true)
WITH CHECK (true);

-- Политики для answers (полный доступ)
CREATE POLICY "Allow all operations on answers"
ON answers FOR ALL
USING (true)
WITH CHECK (true);

-- 5. ДОБАВЛЯЕМ ТЕСТОВЫЕ ВОПРОСЫ
INSERT INTO questions (text, "order") VALUES
('Кто из вас последним ел пиццу?', 1),
('Кто чаще всего опаздывает на встречи?', 2),
('У кого самая странная коллекция?', 3),
('Кто первым заводит новых друзей на вечеринке?', 4),
('Кто больше всего времени проводит в соцсетях?', 5),
('Кто скорее всего станет миллионером?', 6),
('У кого самый заразительный смех?', 7),
('Кто лучше всех танцует?', 8),
('Кто чаще всего забывает про дни рождения?', 9),
('Кто самый загадочный в компании?', 10);

-- 6. СОЗДАЁМ ТЕСТОВУЮ КОМНАТУ
INSERT INTO rooms (code, current_question_index, is_active)
VALUES ('1234', 0, true);

-- 7. ПРОВЕРЯЕМ, ЧТО ВСЁ СОЗДАЛОСЬ
SELECT 'Rooms count:' as info, COUNT(*) as count FROM rooms
UNION ALL
SELECT 'Questions count:', COUNT(*) FROM questions
UNION ALL
SELECT 'Players count:', COUNT(*) FROM players
UNION ALL
SELECT 'Answers count:', COUNT(*) FROM answers;

-- Показываем тестовую комнату
SELECT * FROM rooms WHERE code = '1234';
