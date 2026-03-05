-- Timeweb merged schema 2026-03-04
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;


-- FILE: supabase-init-full.sql
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


-- FILE: supabase-add-quiz-system.sql
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


-- FILE: supabase-add-round-timer.sql
    -- Добавляем время старта вопроса и объяснения к вопросам
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS question_started_at timestamptz;

    ALTER TABLE rooms
    ALTER COLUMN question_started_at DROP NOT NULL;

    ALTER TABLE rooms
    ALTER COLUMN question_started_at DROP DEFAULT;

    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting';

    DO $$
    BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_status_check'
    ) THEN
        ALTER TABLE rooms
        DROP CONSTRAINT rooms_status_check;
    END IF;
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-running',
            'round2-ready',
            'round3-running',
            'round4-running',
            'round5-running',
            'round5-explanation',
            'final-results',
            'finished'
        )
    );
    END$$;

    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS explanation text;

    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-running',
        'round2-ready',
        'round3-running',
        'round4-running',
        'round5-running',
        'round5-explanation',
        'final-results',
        'finished'
    );

    UPDATE rooms
    SET question_started_at = NULL
    WHERE status = 'waiting';

    UPDATE rooms
    SET question_started_at = timezone('utc', now())
    WHERE status = 'running' AND question_started_at IS NULL;

    UPDATE questions
    SET explanation = '7 умножить на 8 — это 56.'
    WHERE text = 'Сколько будет 7 × 8?' AND (explanation IS NULL OR explanation = '');

        -- Функция для получения серверного времени (используется для синхронизации таймера)
        CREATE OR REPLACE FUNCTION get_server_time()
        RETURNS timestamptz
        LANGUAGE sql
        STABLE
        AS $$
            SELECT timezone('utc', now());
        $$;

    -- Флаг, что ведущему не нужно ждать таймер (все игроки ответили)
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS all_players_answered boolean NOT NULL DEFAULT false;

    UPDATE rooms
    SET all_players_answered = false
    WHERE all_players_answered IS NULL;

    -- Храним список выбранных вопросов для раунда
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS selected_question_ids integer[];

    -- Поля для Раунда 2 "Фейколов"
    ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS round2_item_index integer,
    ADD COLUMN IF NOT EXISTS round2_showing_fact boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS round2_phase TEXT DEFAULT 'idle';

    CREATE TABLE IF NOT EXISTS public.round2_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        item_index integer NOT NULL,
        answer_is_fact boolean NOT NULL,
        is_correct boolean NOT NULL,
        points_earned integer NOT NULL DEFAULT 0,
        submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
        UNIQUE (room_id, player_id, item_index)
    );

    CREATE INDEX IF NOT EXISTS idx_round2_answers_room_item
        ON public.round2_answers (room_id, item_index);

    DO $$
    BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_round2_phase_check'
    ) THEN
        ALTER TABLE rooms
        DROP CONSTRAINT rooms_round2_phase_check;
    END IF;
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_round2_phase_check CHECK (round2_phase IN ('idle', 'fact', 'explanation'));
    END$$;

    UPDATE rooms
    SET round2_phase = 'idle'
    WHERE round2_phase IS NULL OR round2_phase NOT IN ('idle', 'fact', 'explanation');




-- FILE: supabase-add-round3-voting.sql
-- ============================================
-- ROUND 3: ответы + голосование
-- Выполните этот скрипт в Supabase SQL Editor
-- ============================================

-- 0) Важно про ошибку rooms_status_check
-- Если у вас уже есть CHECK constraint на rooms.status, то при ALTER TABLE ADD CONSTRAINT
-- Postgres проверяет ВСЕ существующие строки. Ошибка вида:
--   ERROR: 23514: check constraint "rooms_status_check" ... is violated by some row
-- значит, что в таблице rooms уже есть статусы, которые не входят в новый список.
--
-- Диагностика (выполните отдельно):
--   SELECT status, COUNT(*) FROM public.rooms GROUP BY status ORDER BY status;
--   SELECT id, code, status FROM public.rooms WHERE status NOT IN ('waiting','running','round2-running','round3-running','finished');
--
-- Решение: либо добавить ваши реальные статусы в CHECK, либо привести данные к допустимым значениям.
-- Для MVP этот скрипт НЕ трогает rooms_status_check, чтобы не ломать существующие данные.

-- 2) Таблица ответов игроков для Раунда 3
CREATE TABLE IF NOT EXISTS public.round3_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  text text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (room_id, player_id, question_index)
);

-- Совместимость со старой схемой (если таблица уже есть, а колонка называлась answer)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_answers'
      AND column_name = 'answer'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_answers'
      AND column_name = 'text'
  ) THEN
    ALTER TABLE public.round3_answers RENAME COLUMN answer TO text;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_round3_answers_room_question
  ON public.round3_answers (room_id, question_index);

-- 3) Таблица голосов (каждый игрок голосует 1 раз за вопрос)
CREATE TABLE IF NOT EXISTS public.round3_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  voter_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  answer_id uuid NOT NULL REFERENCES public.round3_answers(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (room_id, voter_player_id, question_index)
);

-- Совместимость со старой схемой (если таблица уже есть, а voter назывался player_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_votes'
      AND column_name = 'player_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round3_votes'
      AND column_name = 'voter_player_id'
  ) THEN
    ALTER TABLE public.round3_votes RENAME COLUMN player_id TO voter_player_id;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_round3_votes_room_question
  ON public.round3_votes (room_id, question_index);

-- На всякий случай: upsert в Supabase требует уникальный индекс/constraint по onConflict-колонкам.
-- Даже если UNIQUE constraint уже есть — этот индекс IF NOT EXISTS безопасен.
CREATE UNIQUE INDEX IF NOT EXISTS ux_round3_answers_room_player_question
  ON public.round3_answers (room_id, player_id, question_index);

CREATE UNIQUE INDEX IF NOT EXISTS ux_round3_votes_room_voter_question
  ON public.round3_votes (room_id, voter_player_id, question_index);

-- 4) RLS (для MVP: открытый доступ, как в других скриптах проекта)
ALTER TABLE public.round3_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round3_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round3_answers' AND policyname = 'Allow all operations on round3_answers'
  ) THEN
    CREATE POLICY "Allow all operations on round3_answers"
    ON public.round3_answers FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round3_votes' AND policyname = 'Allow all operations on round3_votes'
  ) THEN
    CREATE POLICY "Allow all operations on round3_votes"
    ON public.round3_votes FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END$$;

-- 5) Realtime публикация (идемпотентно)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'round3_answers'
  ) THEN
-- [ALTER PUBLICATION supabase_realtime removed]
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'round3_votes'
  ) THEN
-- [ALTER PUBLICATION supabase_realtime removed]
  END IF;
END $$;


-- FILE: supabase-add-round4.sql
-- ============================================
-- ДОБАВЛЕНИЕ РАУНДА 4 «Дэшифровщик»
-- ============================================
-- Запустите скрипт в Supabase SQL Editor.
-- После применения таблица round4_answers будет доступна в Realtime, а rooms сможет
-- хранить статус round4-running.

-- 1) Расширяем список допустимых статусов комнаты (добавляем round3-running, round4-running)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_status_check') THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
    END IF;

    -- Сначала нормализуем все существующие статусы, чтобы новое ограничение не упало
    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-ready',
        'round2-running',
        'round3-running',
        'round4-running',
        'round5-running',
        'round5-explanation',
        'final-results',
        'finished'
    );

    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-ready',
            'round2-running',
            'round3-running',
            'round4-running',
            'round5-running',
            'round5-explanation',
            'final-results',
            'finished'
        )
    );

END$$;

-- 2) Таблица ответов Раунда 4 (фиксируем очки и корректность)
CREATE TABLE IF NOT EXISTS public.round4_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_id integer NOT NULL, -- id из app/public/questions/4round.json
    answer_text text NOT NULL DEFAULT '',
    is_correct boolean NOT NULL DEFAULT false,
    correct_rank integer, -- 1 для первого правильного, 2+ для следующих, NULL если неверно
    points_earned integer NOT NULL DEFAULT 0,
    submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    elapsed_ms integer, -- опционально: время ответа в мс с начала вопроса
    UNIQUE (room_id, player_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_round4_answers_room_puzzle
    ON public.round4_answers (room_id, puzzle_id, submitted_at);

-- 3) Включаем RLS и разрешаем доступ (как в остальных таблицах)
ALTER TABLE public.round4_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- PostgreSQL не поддерживает IF NOT EXISTS для CREATE POLICY, поэтому удаляем и создаём заново.
    DROP POLICY IF EXISTS "Allow all operations on round4_answers" ON public.round4_answers;

    CREATE POLICY "Allow all operations on round4_answers"
    ON public.round4_answers FOR ALL
    USING (true)
    WITH CHECK (true);
END$$;

-- 4) Подключаем round4_answers к Realtime публикации (идемпотентно)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'round4_answers'
    ) THEN
-- [ALTER PUBLICATION supabase_realtime removed]
    END IF;
END $$;

-- 5) Быстрая проверка
-- SELECT room_id, player_id, puzzle_id, answer_text, is_correct, correct_rank, points_earned, submitted_at
-- FROM round4_answers
-- ORDER BY submitted_at DESC
-- LIMIT 20;


-- FILE: supabase-add-round5.sql
-- ============================================
-- ДОБАВЛЕНИЕ РАУНДА 5 «Финал» (Цифровая интуиция)
-- ============================================
-- Запустите скрипт в Supabase SQL Editor.
-- Добавляет статусы round5-running / round5-explanation и таблицу round5_answers.

-- 1) Расширяем список допустимых статусов комнаты
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_status_check') THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
    END IF;

    -- Нормализуем существующие статусы, чтобы новое ограничение не упало
    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-ready',
        'round2-running',
        'round3-running',
        'round4-running',
        'round5-running',
        'round5-explanation',
        'final-results',
        'finished'
    );

    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-ready',
            'round2-running',
            'round3-running',
            'round4-running',
            'round5-running',
            'round5-explanation',
            'final-results',
            'finished'
        )
    );
END$$;

-- 2) Таблица ответов Раунда 5
CREATE TABLE IF NOT EXISTS public.round5_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_index integer NOT NULL, -- индекс в /public/questions/5round_question.json
    answer_value integer NOT NULL,
    points_earned integer NOT NULL DEFAULT 0,
    submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    elapsed_ms integer,
    UNIQUE (room_id, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_round5_answers_room_question
    ON public.round5_answers (room_id, question_index, submitted_at);

-- 3) RLS + открытая политика (как в MVP)
ALTER TABLE public.round5_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all operations on round5_answers" ON public.round5_answers;

    CREATE POLICY "Allow all operations on round5_answers"
    ON public.round5_answers FOR ALL
    USING (true)
    WITH CHECK (true);
END$$;

-- 4) Подключаем round5_answers к Realtime (идемпотентно)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'round5_answers'
    ) THEN
-- [ALTER PUBLICATION supabase_realtime removed]
    END IF;
END $$;

-- 5) Быстрая проверка
-- SELECT room_id, player_id, question_index, answer_value, points_earned, submitted_at
-- FROM round5_answers
-- ORDER BY submitted_at DESC
-- LIMIT 20;


-- FILE: supabase-add-final-results.sql
-- ============================================
-- ДОБАВЛЕНИЕ СТАТУСА final-results (ФИНАЛЬНЫЕ ИТОГИ)
-- ============================================
-- Запустите скрипт в Supabase SQL Editor.
-- Нужен для финального экрана турнирной таблицы после Раунда 5.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_status_check') THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
    END IF;

    -- Нормализуем существующие статусы, чтобы новое ограничение не упало
    UPDATE rooms
    SET status = 'waiting'
    WHERE status IS NULL OR status NOT IN (
        'waiting',
        'running',
        'round2-ready',
        'round2-running',
        'round3-running',
        'round4-running',
        'round5-running',
        'round5-explanation',
        'final-results',
        'finished'
    );

    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (
        status IN (
            'waiting',
            'running',
            'round2-ready',
            'round2-running',
            'round3-running',
            'round4-running',
            'round5-running',
            'round5-explanation',
            'final-results',
            'finished'
        )
    );
END$$;


-- FILE: supabase-fix-round2-rls.sql
-- Fix: enable RLS for public.round2_answers (with backup)
-- Project: vqrspimfhimntbrwxvvi
-- Run in Supabase SQL Editor.

begin;

-- 0) Private schema for backups (avoid PostgREST exposure)
create schema if not exists backups;
revoke all on schema backups from public;
revoke all on schema backups from anon;
revoke all on schema backups from authenticated;

-- 1) Backup (structure + data)
-- Creates/refreshes a dated backup table you can roll back to.
-- NOTE: adjust the suffix if you run this on another date.
do $$
begin
  if to_regclass('backups.round2_answers_backup_20251231') is null then
    execute 'create table backups.round2_answers_backup_20251231 (like public.round2_answers including all)';
    execute 'alter table backups.round2_answers_backup_20251231 enable row level security';
    execute 'revoke all on table backups.round2_answers_backup_20251231 from anon';
    execute 'revoke all on table backups.round2_answers_backup_20251231 from authenticated';
  else
    execute 'truncate table backups.round2_answers_backup_20251231';
  end if;
end $$;

insert into backups.round2_answers_backup_20251231
select * from public.round2_answers;

-- 2) Enable RLS
alter table public.round2_answers enable row level security;

-- 3) Policies (MVP / keep existing functionality)
-- This matches your existing pattern in docs/supabase-init-full.sql (open access).
-- If you want stricter policies later, replace this with room-scoped policies.
drop policy if exists "Allow all operations on round2_answers" on public.round2_answers;
create policy "Allow all operations on round2_answers"
on public.round2_answers
for all
using (true)
with check (true);

commit;

-- Quick sanity checks
-- select count(*) as round2_answers_count from public.round2_answers;
-- select count(*) as backup_count from backups.round2_answers_backup_20251231;


-- FILE: supabase-room-sync.sql
-- Room sync support
alter table rooms
  add column if not exists state_version bigint default 0;

alter table rooms
  add column if not exists transitioning_to_next boolean default false;

-- Add missing columns for room functionality
alter table rooms
  add column if not exists current_question_index int default 0;

alter table rooms
  add column if not exists is_active boolean default true;

alter table rooms
  add column if not exists status text not null default 'waiting';

alter table rooms
  add column if not exists question_started_at timestamptz;

alter table rooms
  add column if not exists pack_id text not null default 'classic';

alter table rooms
  add column if not exists all_players_answered boolean default false;

alter table rooms
  add column if not exists selected_question_ids integer[];

alter table rooms
  add column if not exists round2_item_index int;

alter table rooms
  add column if not exists round2_showing_fact boolean default true;

alter table rooms
  add column if not exists round2_phase text default 'idle';

-- Add status constraint
update rooms
set status = 'waiting'
where status is null
  or status not in (
    'waiting',
    'running',
    'round2-running',
    'round2-ready',
    'round3-running',
    'round4-running',
    'round5-running',
    'round5-explanation',
    'final-results',
    'finished'
  );

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'rooms_status_check'
  ) then
    alter table rooms
    drop constraint rooms_status_check;
  end if;
  alter table rooms
  add constraint rooms_status_check check (
    status in (
      'waiting',
      'running',
      'round2-running',
      'round2-ready',
      'round3-running',
      'round4-running',
      'round5-running',
      'round5-explanation',
      'final-results',
      'finished'
    )
  );
end $$;

-- Add pack_id constraint
alter table rooms
  drop constraint if exists rooms_pack_id_check;

alter table rooms
  add constraint rooms_pack_id_check
  check (pack_id in ('classic', '03012026'));

create index if not exists rooms_pack_id_idx on rooms (pack_id);

-- Ensure RLS allows create_room insert
alter table public.rooms enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Allow insert rooms'
  ) then
    drop policy "Allow insert rooms" on public.rooms;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Allow select rooms'
  ) then
    drop policy "Allow select rooms" on public.rooms;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Allow update rooms'
  ) then
    drop policy "Allow update rooms" on public.rooms;
  end if;
end $$;

create policy "Allow insert rooms"
on public.rooms for insert
with check (true);

create policy "Allow select rooms"
on public.rooms for select
using (true);

create policy "Allow update rooms"
on public.rooms for update
using (true)
with check (true);

-- Add total_points to players if not exists
alter table players
  add column if not exists total_points int default 0;

-- Add is_correct and points_earned to answers if not exists
alter table answers
  add column if not exists is_correct boolean default false;

alter table answers
  add column if not exists points_earned int default 0;

create or replace function bump_room_state_version()
returns trigger
language plpgsql
as $$
begin
  new.state_version := coalesce(old.state_version, 0) + 1;
  return new;
end;
$$;

-- Ensure state_version increments on every room update
DROP TRIGGER IF EXISTS trg_bump_room_state_version ON rooms;
CREATE TRIGGER trg_bump_room_state_version
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION bump_room_state_version();

-- RPC for single-call answer submit + points update (Round 1)
drop function if exists submit_answer(uuid, uuid, integer, text, boolean, integer);
create or replace function submit_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_question_index integer,
  p_answer text,
  p_is_correct boolean,
  p_points integer
)
returns table (
  player_id uuid,
  total_points integer,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  answer_exists boolean;
  updated_points integer;
  new_answer_id uuid;
begin
  select exists(
    select 1
    from answers
    where room_id = p_room_id
      and player_id = p_player_id
      and question_index = p_question_index
  ) into answer_exists;

  if answer_exists then
    select total_points into updated_points
    from players
    where id = p_player_id;

    return query
    select p_player_id, updated_points, true;
    return;
  end if;

  insert into answers (room_id, player_id, question_index, text, is_correct, points_earned)
  values (p_room_id, p_player_id, p_question_index, p_answer, p_is_correct, p_points)
  on conflict do nothing
  returning id into new_answer_id;

  if new_answer_id is null then
    select total_points into updated_points
    from players
    where id = p_player_id;

    return query
    select p_player_id, updated_points, true;
    return;
  end if;

  if p_is_correct then
    update players
      set total_points = coalesce(total_points, 0) + p_points
    where id = p_player_id
    returning total_points into updated_points;
  else
    select total_points into updated_points
    from players
    where id = p_player_id;
  end if;

  return query
  select p_player_id, updated_points, false;
end;
$$;

grant execute on function submit_answer(uuid, uuid, integer, text, boolean, integer) to anon, authenticated;

-- Ensure a unique constraint to avoid double answers
create unique index if not exists answers_unique on answers (room_id, player_id, question_index);

-- Centralized logs table for client telemetry
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  client_timestamp timestamptz,
  level text not null,
  channel text not null,
  message text not null,
  event_name text,
  room_id uuid,
  player_id uuid,
  session_id text,
  page text,
  user_agent text,
  context jsonb
);

alter table public.logs enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'logs' and policyname = 'Allow insert logs'
  ) then
    drop policy "Allow insert logs" on public.logs;
  end if;
end $$;

create policy "Allow insert logs"
on public.logs for insert
with check (true);

create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_event_name_idx on public.logs (event_name);
create index if not exists logs_room_id_idx on public.logs (room_id);
create index if not exists logs_player_id_idx on public.logs (player_id);

-- Room limit settings + RPC to enforce limit on creation
create table if not exists public.app_settings (
  id bigserial primary key,
  max_rooms integer default 100
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'max_rooms'
  ) then
    alter table public.app_settings add column max_rooms integer;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'key'
  ) then
    insert into public.app_settings (key, value, max_rooms)
    values ('max_active_rooms', '100', 100)
    on conflict (key) do nothing;
  else
    insert into public.app_settings (max_rooms)
    select 100
    where not exists (
      select 1 from public.app_settings where max_rooms is not null
    );
  end if;
end $$;

create or replace function public.get_max_active_rooms()
returns integer
language plpgsql
stable
as $$
declare
  resolved_limit integer;
  has_max_rooms boolean;
  has_key boolean;
  has_id boolean;
begin
  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'max_rooms'
  ) into has_max_rooms;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'key'
  ) into has_key;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'id'
  ) into has_id;

  if has_max_rooms then
    if has_id then
      select max_rooms
        into resolved_limit
      from public.app_settings
      where max_rooms is not null
      order by id asc
      limit 1;
    else
      select max_rooms
        into resolved_limit
      from public.app_settings
      where max_rooms is not null
      order by max_rooms asc
      limit 1;
    end if;
  end if;

  if resolved_limit is null and has_key then
    select value::integer
      into resolved_limit
    from public.app_settings
    where key = 'max_active_rooms'
    limit 1;
  end if;

  return coalesce(resolved_limit, 100);
end;
$$;

drop function if exists public.create_room(text, text);
create or replace function public.create_room(
  p_code text,
  p_pack_id text default 'classic'
)
returns table (
  id uuid,
  code text,
  is_active boolean,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  max_rooms integer;
begin
  select count(*) into active_count from public.rooms where public.rooms.is_active = true;
  select public.get_max_active_rooms() into max_rooms;

  if active_count >= max_rooms then
    insert into public.logs (level, channel, message, event_name, context)
    values (
      'warn',
      'rpc',
      'Room limit reached while creating room',
      'create_room_limit',
      jsonb_build_object('active_count', active_count, 'max_rooms', max_rooms, 'code', p_code)
    );
    raise exception 'Room limit reached';
  end if;

  insert into public.rooms (code, current_question_index, is_active, status, question_started_at, pack_id)
  values (p_code, 0, true, 'waiting', null, p_pack_id)
  returning public.rooms.id, public.rooms.code, public.rooms.is_active, public.rooms.status into id, code, is_active, status;

  return query
  select id, code, is_active, status;
exception
  when others then
    insert into public.logs (level, channel, message, event_name, context)
    values (
      'error',
      'rpc',
      'create_room failed',
      'create_room_error',
      jsonb_build_object('code', p_code, 'pack_id', p_pack_id, 'error', SQLERRM)
    );
    raise;
end;
$$;

grant execute on function public.create_room(text, text) to anon, authenticated;

drop function if exists public.start_round3(uuid);
create or replace function public.start_round3(
  p_room_id uuid
)
returns table (
  id uuid,
  status text,
  current_question_index int,
  question_started_at timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row record;
begin
  update public.rooms as r
  set is_active = true,
      status = 'round3-running',
      current_question_index = 0,
      question_started_at = null,
      all_players_answered = false,
      round2_phase = 'idle'
  where r.id = p_room_id
  returning r.id, r.status, r.current_question_index, r.question_started_at, r.state_version into updated_row;

  if updated_row.id is null then
    raise exception 'Room not found';
  end if;

  return query
  select updated_row.id, updated_row.status, updated_row.current_question_index, updated_row.question_started_at, updated_row.state_version;
exception
  when others then
    insert into public.logs (level, channel, message, event_name, context)
    values (
      'error',
      'rpc',
      'start_round3 failed',
      'start_round3_error',
      jsonb_build_object('room_id', p_room_id, 'error', SQLERRM)
    );
    raise;
end;
$$;

grant execute on function public.start_round3(uuid) to anon, authenticated;

-- Question likes (all rounds) + best question helper
create table if not exists public.question_likes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  question_id integer not null,
  player_id uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists question_likes_unique on public.question_likes (room_id, question_id, player_id);
create index if not exists question_likes_room_idx on public.question_likes (room_id);
create index if not exists question_likes_question_idx on public.question_likes (question_id);

alter table public.question_likes enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'question_likes' and policyname = 'Allow read question likes'
  ) then
    drop policy "Allow read question likes" on public.question_likes;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'question_likes' and policyname = 'Allow insert question likes'
  ) then
    drop policy "Allow insert question likes" on public.question_likes;
  end if;
end $$;

create policy "Allow read question likes"
on public.question_likes for select
using (true);

create policy "Allow insert question likes"
on public.question_likes for insert
with check (true);

drop function if exists public.like_question(uuid, integer, uuid);
create or replace function public.like_question(
  p_room_id uuid,
  p_question_id integer,
  p_player_id uuid
)
returns table (
  was_inserted boolean,
  total_likes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  likes_count integer;
  room_selected_ids integer[];
  is_round1 boolean;
begin
  select selected_question_ids into room_selected_ids
  from public.rooms
  where id = p_room_id;

  if room_selected_ids is null then
    return query
    select false, 0;
  end if;

  is_round1 := p_question_id < 200000;
  if is_round1 and not (p_question_id = any(room_selected_ids)) then
    select count(*) into likes_count
    from public.question_likes
    where room_id = p_room_id and question_id = p_question_id;
    return query
    select false, coalesce(likes_count, 0);
  end if;

  insert into public.question_likes (room_id, question_id, player_id)
  values (p_room_id, p_question_id, p_player_id)
  on conflict do nothing
  returning id into inserted_id;

  select count(*) into likes_count
  from public.question_likes
  where room_id = p_room_id and question_id = p_question_id;

  return query
  select (inserted_id is not null), likes_count;
end;
$$;

grant execute on function public.like_question(uuid, integer, uuid) to anon, authenticated;

drop function if exists public.get_best_question(uuid);
create or replace function public.get_best_question(
  p_room_id uuid
)
returns table (
  question_id integer,
  likes integer
)
language sql
stable
as $$
  select question_id, count(*)::integer as likes
  from public.question_likes
  where room_id = p_room_id
  group by question_id
  order by likes desc, question_id asc
  limit 1;
$$;

grant execute on function public.get_best_question(uuid) to anon, authenticated;

drop function if exists public.get_top_liked_questions(integer);
create or replace function public.get_top_liked_questions(
  p_limit integer default 10
)
returns table (
  question_id integer,
  likes integer
)
language sql
stable
as $$
  select question_id, count(*)::integer as likes
  from public.question_likes
  group by question_id
  order by likes desc, question_id asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.get_top_liked_questions(integer) to anon, authenticated;


-- FILE: supabase-add-question-packs.sql
-- Adds question-pack support to rooms.
--
-- After applying this migration, the frontend can store which question pack
-- a room is using, so players and host load the same JSON/audio.

begin;

alter table public.rooms
  add column if not exists pack_id text not null default 'classic';

-- Keep values constrained to known packs.
-- (Extend this list when you add new packs.)
alter table public.rooms
  drop constraint if exists rooms_pack_id_check;

alter table public.rooms
  add constraint rooms_pack_id_check
  check (pack_id in ('classic', '03012026'));

create index if not exists rooms_pack_id_idx on public.rooms (pack_id);

commit;


-- FILE: supabase-jokester.sql
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
  avatar     TEXT NOT NULL DEFAULT '1.png',
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_rooms' AND policyname = 'jokester_rooms_all'
  ) THEN
    CREATE POLICY "jokester_rooms_all" ON jokester_rooms FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_players' AND policyname = 'jokester_players_all'
  ) THEN
    CREATE POLICY "jokester_players_all" ON jokester_players FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_category_votes' AND policyname = 'jokester_category_votes_all'
  ) THEN
    CREATE POLICY "jokester_category_votes_all" ON jokester_category_votes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_duels' AND policyname = 'jokester_duels_all'
  ) THEN
    CREATE POLICY "jokester_duels_all" ON jokester_duels FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_answers' AND policyname = 'jokester_answers_all'
  ) THEN
    CREATE POLICY "jokester_answers_all" ON jokester_answers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_votes' AND policyname = 'jokester_votes_all'
  ) THEN
    CREATE POLICY "jokester_votes_all" ON jokester_votes FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jokester_used_questions' AND policyname = 'jokester_used_questions_all'
  ) THEN
    CREATE POLICY "jokester_used_questions_all" ON jokester_used_questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ========================================================
-- Realtime
-- ========================================================
DO $$
BEGIN
  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- FILE: supabase-jokester-update-v2.sql
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


-- FILE: supabase-creativach.sql
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
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
-- [ALTER PUBLICATION supabase_realtime removed]
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- FILE: supabase-drawinkach.sql
-- ================================================================
-- РИСУНКАЧ (Drawinkach): Drawing chain party game
-- Run this file in Supabase SQL Editor
-- Includes: tables, word dictionary, RLS, Realtime
-- ================================================================

-- Drop old tables to recreate cleanly
drop table if exists public.draw_votes cascade;
drop table if exists public.draw_steps cascade;
drop table if exists public.draw_chains cascade;
drop table if exists public.draw_players cascade;
drop table if exists public.draw_rooms cascade;
drop table if exists public.draw_words cascade;

-- ===================== DRAWING WORDS DICTIONARY ===================

create table public.draw_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  category text default 'general',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.draw_words enable row level security;
create policy "Allow read draw_words" on public.draw_words for select using (true);

-- Seed ~100 fun drawing words
insert into public.draw_words (word, category) values
  -- Животные
  ('кот', 'животные'),
  ('собака', 'животные'),
  ('рыба', 'животные'),
  ('слон', 'животные'),
  ('заяц', 'животные'),
  ('медведь', 'животные'),
  ('лошадь', 'животные'),
  ('птица', 'животные'),
  ('змея', 'животные'),
  ('жираф', 'животные'),
  ('черепаха', 'животные'),
  ('бабочка', 'животные'),
  ('корова', 'животные'),
  ('обезьяна', 'животные'),
  ('пингвин', 'животные'),
  ('крокодил', 'животные'),
  ('дельфин', 'животные'),
  ('паук', 'животные'),
  ('мышь', 'животные'),
  ('лягушка', 'животные'),
  ('акула', 'животные'),
  ('краб', 'животные'),
  ('улитка', 'животные'),
  ('осьминог', 'животные'),
  ('кит', 'животные'),
  ('пчела', 'животные'),
  ('лев', 'животные'),
  ('волк', 'животные'),
  ('олень', 'животные'),
  ('ёж', 'животные'),
  -- Еда
  ('пицца', 'еда'),
  ('торт', 'еда'),
  ('мороженое', 'еда'),
  ('банан', 'еда'),
  ('яблоко', 'еда'),
  ('арбуз', 'еда'),
  ('сыр', 'еда'),
  ('бургер', 'еда'),
  ('попкорн', 'еда'),
  ('пончик', 'еда'),
  ('конфета', 'еда'),
  ('виноград', 'еда'),
  ('морковь', 'еда'),
  ('ананас', 'еда'),
  ('вишня', 'еда'),
  -- Предметы
  ('дом', 'предметы'),
  ('машина', 'предметы'),
  ('велосипед', 'предметы'),
  ('зонт', 'предметы'),
  ('ключ', 'предметы'),
  ('часы', 'предметы'),
  ('телефон', 'предметы'),
  ('лампа', 'предметы'),
  ('стул', 'предметы'),
  ('очки', 'предметы'),
  ('книга', 'предметы'),
  ('гитара', 'предметы'),
  ('ножницы', 'предметы'),
  ('самолёт', 'предметы'),
  ('ракета', 'предметы'),
  ('корабль', 'предметы'),
  ('поезд', 'предметы'),
  ('свеча', 'предметы'),
  ('робот', 'предметы'),
  ('меч', 'предметы'),
  -- Природа
  ('дерево', 'природа'),
  ('цветок', 'природа'),
  ('солнце', 'природа'),
  ('луна', 'природа'),
  ('звезда', 'природа'),
  ('облако', 'природа'),
  ('гора', 'природа'),
  ('радуга', 'природа'),
  ('снежинка', 'природа'),
  ('молния', 'природа'),
  ('костёр', 'природа'),
  ('вулкан', 'природа'),
  ('остров', 'природа'),
  ('водопад', 'природа'),
  ('кактус', 'природа'),
  -- Персонажи
  ('пират', 'персонажи'),
  ('космонавт', 'персонажи'),
  ('клоун', 'персонажи'),
  ('принцесса', 'персонажи'),
  ('дракон', 'персонажи'),
  ('привидение', 'персонажи'),
  ('снеговик', 'персонажи'),
  ('ниндзя', 'персонажи'),
  ('русалка', 'персонажи'),
  ('ведьма', 'персонажи'),
  -- Разное
  ('мяч', 'разное'),
  ('корона', 'разное'),
  ('сердце', 'разное'),
  ('якорь', 'разное'),
  ('флаг', 'разное'),
  ('воздушный шар', 'разное'),
  ('подарок', 'разное'),
  ('замок', 'разное'),
  ('маяк', 'разное'),
  ('колесо', 'разное'),
  ('череп', 'разное'),
  ('алмаз', 'разное'),
  ('щит', 'разное'),
  ('барабан', 'разное'),
  ('шляпа', 'разное');

-- ===================== ROOMS ======================================

create table public.draw_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'voting', 'results', 'finished')),
  mode text not null default 'russian'
    check (mode in ('russian', 'english', 'free')),
  current_round integer not null default 0,
  current_step integer not null default 0,
  total_steps integer not null default 0,
  step_started_at timestamptz,
  step_duration integer not null default 60,
  voting_chain_index integer not null default 0,
  host_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ===================== PLAYERS ====================================

create table public.draw_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  seat integer not null default 0,
  score integer not null default 0,
  joined_at timestamptz not null default timezone('utc', now())
);

-- ===================== CHAINS =====================================

create table public.draw_chains (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  round integer not null,
  chain_index integer not null,
  original_word text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ===================== STEPS ======================================

create table public.draw_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.draw_chains(id) on delete cascade,
  step_number integer not null,
  player_id uuid not null references public.draw_players(id) on delete cascade,
  target_word text,
  guess text,
  drawing_data text,
  is_correct boolean not null default false,
  submitted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- ===================== VOTES ======================================

create table public.draw_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  round integer not null,
  chain_id uuid not null references public.draw_chains(id) on delete cascade,
  voter_id uuid not null references public.draw_players(id) on delete cascade,
  voted_for_player_id uuid not null references public.draw_players(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(chain_id, voter_id)
);

-- ===================== INDEXES ====================================

create index draw_rooms_code_idx on public.draw_rooms(code);
create index draw_players_room_idx on public.draw_players(room_id);
create index draw_chains_room_round_idx on public.draw_chains(room_id, round);
create index draw_steps_chain_idx on public.draw_steps(chain_id);
create index draw_steps_player_idx on public.draw_steps(player_id);
create index draw_votes_room_idx on public.draw_votes(room_id);

-- ===================== RLS (open for MVP) =========================

alter table public.draw_rooms enable row level security;
alter table public.draw_players enable row level security;
alter table public.draw_chains enable row level security;
alter table public.draw_steps enable row level security;
alter table public.draw_votes enable row level security;

create policy "Allow all on draw_rooms" on public.draw_rooms for all using (true) with check (true);
create policy "Allow all on draw_players" on public.draw_players for all using (true) with check (true);
create policy "Allow all on draw_chains" on public.draw_chains for all using (true) with check (true);
create policy "Allow all on draw_steps" on public.draw_steps for all using (true) with check (true);
create policy "Allow all on draw_votes" on public.draw_votes for all using (true) with check (true);

-- ===================== REALTIME ===================================

alter publication supabase_realtime add table public.draw_rooms;
alter publication supabase_realtime add table public.draw_players;
alter publication supabase_realtime add table public.draw_steps;

-- ===================== VERIFICATION ===============================

select 'draw_words' as "table", count(*) as "rows" from public.draw_words
union all select 'draw_rooms', count(*) from public.draw_rooms
union all select 'draw_players', count(*) from public.draw_players;


-- FILE: supabase-uno-v2.sql
-- ================================================================
-- UNO: FULL self-contained schema v2
-- Run this SINGLE file in Supabase SQL Editor — no other files needed
-- Includes: tables, verbs dictionary, seed data, all RPC functions
-- ================================================================

-- Drop old tables to recreate with correct types
drop table if exists public.uno_events cascade;
drop table if exists public.uno_players cascade;
drop table if exists public.uno_rooms cascade;

-- ===================== IRREGULAR VERBS DICTIONARY =================
create table if not exists public.irregular_verbs (
  id uuid primary key default gen_random_uuid(),
  infinitive text not null,
  past_simple text not null,
  past_participle text not null,
  translation text,
  level text,
  tags text[],
  audio_url text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.irregular_verbs enable row level security;
drop policy if exists "Allow read verbs" on public.irregular_verbs;
drop policy if exists "Allow insert verbs" on public.irregular_verbs;
create policy "Allow read verbs" on public.irregular_verbs for select using (true);
create policy "Allow insert verbs" on public.irregular_verbs for insert with check (true);

-- Seed verbs (clear + insert 150+ irregular verbs)
delete from public.irregular_verbs;

insert into public.irregular_verbs (infinitive, past_simple, past_participle, translation) values
  ('be', 'was/were', 'been', 'быть'),
  ('beat', 'beat', 'beaten', 'бить'),
  ('become', 'became', 'become', 'становиться'),
  ('begin', 'began', 'begun', 'начинать'),
  ('bend', 'bent', 'bent', 'гнуть'),
  ('bet', 'bet', 'bet', 'ставить (пари)'),
  ('bind', 'bound', 'bound', 'связывать'),
  ('bite', 'bit', 'bitten', 'кусать'),
  ('bleed', 'bled', 'bled', 'кровоточить'),
  ('blow', 'blew', 'blown', 'дуть'),
  ('break', 'broke', 'broken', 'ломать'),
  ('breed', 'bred', 'bred', 'разводить'),
  ('bring', 'brought', 'brought', 'приносить'),
  ('broadcast', 'broadcast', 'broadcast', 'транслировать'),
  ('build', 'built', 'built', 'строить'),
  ('burn', 'burnt', 'burnt', 'жечь'),
  ('burst', 'burst', 'burst', 'лопаться'),
  ('buy', 'bought', 'bought', 'покупать'),
  ('catch', 'caught', 'caught', 'ловить'),
  ('choose', 'chose', 'chosen', 'выбирать'),
  ('cling', 'clung', 'clung', 'цепляться'),
  ('come', 'came', 'come', 'приходить'),
  ('cost', 'cost', 'cost', 'стоить'),
  ('creep', 'crept', 'crept', 'ползать'),
  ('cut', 'cut', 'cut', 'резать'),
  ('deal', 'dealt', 'dealt', 'иметь дело'),
  ('dig', 'dug', 'dug', 'копать'),
  ('do', 'did', 'done', 'делать'),
  ('draw', 'drew', 'drawn', 'рисовать'),
  ('dream', 'dreamt', 'dreamt', 'мечтать'),
  ('drink', 'drank', 'drunk', 'пить'),
  ('drive', 'drove', 'driven', 'водить'),
  ('eat', 'ate', 'eaten', 'есть'),
  ('fall', 'fell', 'fallen', 'падать'),
  ('feed', 'fed', 'fed', 'кормить'),
  ('feel', 'felt', 'felt', 'чувствовать'),
  ('fight', 'fought', 'fought', 'драться'),
  ('find', 'found', 'found', 'находить'),
  ('flee', 'fled', 'fled', 'бежать'),
  ('fly', 'flew', 'flown', 'летать'),
  ('forbid', 'forbade', 'forbidden', 'запрещать'),
  ('forget', 'forgot', 'forgotten', 'забывать'),
  ('forgive', 'forgave', 'forgiven', 'прощать'),
  ('freeze', 'froze', 'frozen', 'замерзать'),
  ('get', 'got', 'got', 'получать'),
  ('give', 'gave', 'given', 'давать'),
  ('go', 'went', 'gone', 'идти'),
  ('grow', 'grew', 'grown', 'расти'),
  ('hang', 'hung', 'hung', 'вешать'),
  ('have', 'had', 'had', 'иметь'),
  ('hear', 'heard', 'heard', 'слышать'),
  ('hide', 'hid', 'hidden', 'прятать'),
  ('hit', 'hit', 'hit', 'ударять'),
  ('hold', 'held', 'held', 'держать'),
  ('hurt', 'hurt', 'hurt', 'причинять боль'),
  ('keep', 'kept', 'kept', 'хранить'),
  ('kneel', 'knelt', 'knelt', 'стоять на коленях'),
  ('knit', 'knit', 'knit', 'вязать'),
  ('know', 'knew', 'known', 'знать'),
  ('lay', 'laid', 'laid', 'класть'),
  ('lead', 'led', 'led', 'вести'),
  ('lean', 'leant', 'leant', 'наклоняться'),
  ('leap', 'leapt', 'leapt', 'прыгать'),
  ('learn', 'learnt', 'learnt', 'учиться'),
  ('leave', 'left', 'left', 'покидать'),
  ('lend', 'lent', 'lent', 'одалживать'),
  ('let', 'let', 'let', 'позволять'),
  ('lie', 'lay', 'lain', 'лежать'),
  ('light', 'lit', 'lit', 'зажигать'),
  ('lose', 'lost', 'lost', 'терять'),
  ('make', 'made', 'made', 'делать'),
  ('mean', 'meant', 'meant', 'значить'),
  ('meet', 'met', 'met', 'встречать'),
  ('mow', 'mowed', 'mown', 'косить'),
  ('overcome', 'overcame', 'overcome', 'преодолевать'),
  ('pay', 'paid', 'paid', 'платить'),
  ('put', 'put', 'put', 'класть'),
  ('quit', 'quit', 'quit', 'бросать'),
  ('read', 'read', 'read', 'читать'),
  ('ride', 'rode', 'ridden', 'ехать верхом'),
  ('ring', 'rang', 'rung', 'звонить'),
  ('rise', 'rose', 'risen', 'подниматься'),
  ('run', 'ran', 'run', 'бегать'),
  ('say', 'said', 'said', 'говорить'),
  ('see', 'saw', 'seen', 'видеть'),
  ('seek', 'sought', 'sought', 'искать'),
  ('sell', 'sold', 'sold', 'продавать'),
  ('send', 'sent', 'sent', 'отправлять'),
  ('set', 'set', 'set', 'устанавливать'),
  ('sew', 'sewed', 'sewn', 'шить'),
  ('shake', 'shook', 'shaken', 'трясти'),
  ('shine', 'shone', 'shone', 'светить'),
  ('shoot', 'shot', 'shot', 'стрелять'),
  ('show', 'showed', 'shown', 'показывать'),
  ('shrink', 'shrank', 'shrunk', 'сжиматься'),
  ('shut', 'shut', 'shut', 'закрывать'),
  ('sing', 'sang', 'sung', 'петь'),
  ('sink', 'sank', 'sunk', 'тонуть'),
  ('sit', 'sat', 'sat', 'сидеть'),
  ('sleep', 'slept', 'slept', 'спать'),
  ('slide', 'slid', 'slid', 'скользить'),
  ('smell', 'smelt', 'smelt', 'нюхать'),
  ('sow', 'sowed', 'sown', 'сеять'),
  ('speak', 'spoke', 'spoken', 'разговаривать'),
  ('speed', 'sped', 'sped', 'мчаться'),
  ('spell', 'spelt', 'spelt', 'произносить по буквам'),
  ('spend', 'spent', 'spent', 'тратить'),
  ('spill', 'spilt', 'spilt', 'проливать'),
  ('spin', 'spun', 'spun', 'вращать'),
  ('spit', 'spat', 'spat', 'плевать'),
  ('split', 'split', 'split', 'раскалывать'),
  ('spoil', 'spoilt', 'spoilt', 'портить'),
  ('spread', 'spread', 'spread', 'распространять'),
  ('spring', 'sprang', 'sprung', 'прыгать'),
  ('stand', 'stood', 'stood', 'стоять'),
  ('steal', 'stole', 'stolen', 'красть'),
  ('stick', 'stuck', 'stuck', 'приклеивать'),
  ('sting', 'stung', 'stung', 'жалить'),
  ('stink', 'stank', 'stunk', 'вонять'),
  ('strike', 'struck', 'struck', 'ударять'),
  ('strive', 'strove', 'striven', 'стремиться'),
  ('swear', 'swore', 'sworn', 'клясться'),
  ('sweep', 'swept', 'swept', 'подметать'),
  ('swim', 'swam', 'swum', 'плавать'),
  ('swing', 'swung', 'swung', 'качаться'),
  ('take', 'took', 'taken', 'брать'),
  ('teach', 'taught', 'taught', 'учить'),
  ('tear', 'tore', 'torn', 'рвать'),
  ('tell', 'told', 'told', 'рассказывать'),
  ('think', 'thought', 'thought', 'думать'),
  ('throw', 'threw', 'thrown', 'бросать'),
  ('tread', 'trod', 'trodden', 'ступать'),
  ('understand', 'understood', 'understood', 'понимать'),
  ('upset', 'upset', 'upset', 'расстраивать'),
  ('wake', 'woke', 'woken', 'просыпаться'),
  ('wear', 'wore', 'worn', 'носить'),
  ('weave', 'wove', 'woven', 'ткать'),
  ('weep', 'wept', 'wept', 'плакать'),
  ('win', 'won', 'won', 'побеждать'),
  ('wind', 'wound', 'wound', 'наматывать'),
  ('withdraw', 'withdrew', 'withdrawn', 'отступать'),
  ('wring', 'wrung', 'wrung', 'выжимать'),
  ('write', 'wrote', 'written', 'писать'),
  ('arise', 'arose', 'arisen', 'возникать'),
  ('awake', 'awoke', 'awoken', 'просыпаться'),
  ('bear', 'bore', 'borne', 'нести'),
  ('bid', 'bid', 'bid', 'предлагать цену'),
  ('dwell', 'dwelt', 'dwelt', 'обитать'),
  ('fling', 'flung', 'flung', 'бросать'),
  ('grind', 'ground', 'ground', 'молоть'),
  ('mistake', 'mistook', 'mistaken', 'ошибаться'),
  ('overtake', 'overtook', 'overtaken', 'обгонять'),
  ('prove', 'proved', 'proven', 'доказывать'),
  ('rid', 'rid', 'rid', 'избавляться'),
  ('slay', 'slew', 'slain', 'убивать'),
  ('sling', 'slung', 'slung', 'бросать (камень)'),
  ('slit', 'slit', 'slit', 'разрезать'),
  ('sneak', 'snuck', 'snuck', 'красться'),
  ('stride', 'strode', 'stridden', 'шагать'),
  ('string', 'strung', 'strung', 'нанизывать'),
  ('thrust', 'thrust', 'thrust', 'толкать'),
  ('undergo', 'underwent', 'undergone', 'проходить'),
  ('undertake', 'undertook', 'undertaken', 'предпринимать'),
  ('undo', 'undid', 'undone', 'отменять'),
  ('uphold', 'upheld', 'upheld', 'поддерживать'),
  ('withstand', 'withstood', 'withstood', 'выдерживать');

-- =====================================================================

-- Rooms — all game state in jsonb (not jsonb[]) for Realtime compat
create table public.uno_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('classic', 'irregular-verbs', 'verb-match')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  direction smallint not null default 1,
  current_player_id uuid,
  host_id uuid,
  draw_pile jsonb not null default '[]'::jsonb,
  discard_pile jsonb not null default '[]'::jsonb,
  hands jsonb not null default '{}'::jsonb,
  winner_id uuid,
  verb_count integer not null default 20,
  state_version bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.uno_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  seat integer not null default 0,
  joined_at timestamptz not null default timezone('utc', now())
);

create table public.uno_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  player_id uuid,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index uno_rooms_code_idx on public.uno_rooms(code);
create index uno_players_room_idx on public.uno_players(room_id);
create index uno_events_room_idx on public.uno_events(room_id);

-- RLS (open for MVP)
alter table public.uno_rooms enable row level security;
alter table public.uno_players enable row level security;
alter table public.uno_events enable row level security;

create policy "Allow all on uno_rooms" on public.uno_rooms for all using (true) with check (true);
create policy "Allow all on uno_players" on public.uno_players for all using (true) with check (true);
create policy "Allow insert on uno_events" on public.uno_events for insert with check (true);
create policy "Allow select on uno_events" on public.uno_events for select using (true);

-- Enable Realtime on uno tables
alter publication supabase_realtime add table public.uno_rooms;
alter publication supabase_realtime add table public.uno_players;

-- ========================== HELPERS ================================

-- Build a shuffled classic UNO deck (108 cards) as jsonb array
create or replace function public._uno_build_classic_deck()
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
begin
  foreach c in array colors loop
    -- one 0 per color
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', 0));
    for i in 1..9 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', i));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', i));
    end loop;
    -- 2x action cards per color
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- 4x wild, 4x wild+4
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- Pick N random verbs and return as jsonb array
create or replace function public._uno_pick_verbs(p_count integer default 20)
returns jsonb
language sql as $$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (select id::text, infinitive, past_simple, past_participle, translation
        from public.irregular_verbs order by random() limit greatest(15, least(p_count, 25))) v;
$$;

-- Build verb-mode deck: each verb in 4 colors + action + wild cards
create or replace function public._uno_build_verb_deck(p_verbs jsonb)
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
  v jsonb;
begin
  for i in 0..jsonb_array_length(p_verbs)-1 loop
    v := p_verbs -> i;
    foreach c in array colors loop
      deck := deck || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'color', c,
        'kind', 'verb',
        'verb', v
      ));
    end loop;
  end loop;
  -- action cards
  foreach c in array colors loop
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- wild
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- Fisher-Yates shuffle on a jsonb array
create or replace function public._uno_shuffle(arr jsonb)
returns jsonb
language plpgsql as $$
declare
  n integer := jsonb_array_length(arr);
  tmp jsonb;
  j integer;
  result jsonb[];
  k integer;
begin
  -- convert to pg array for in-place swap
  result := array(select arr -> i from generate_series(0, n-1) i);
  for i in reverse n-1 .. 1 loop
    j := floor(random() * (i + 1))::integer;
    tmp := result[i+1];
    result[i+1] := result[j+1];
    result[j+1] := tmp;
  end loop;
  return array_to_json(result)::jsonb;
end;
$$;

-- Next player helper
create or replace function public._uno_next_player(p_room_id uuid, p_current uuid)
returns uuid
language plpgsql as $$
declare
  dir integer;
  ids uuid[];
  idx integer;
begin
  select direction into dir from public.uno_rooms where id = p_room_id;
  select array_agg(id order by seat) into ids from public.uno_players where room_id = p_room_id;
  if ids is null or array_length(ids,1) = 0 then return null; end if;
  idx := array_position(ids, p_current);
  if idx is null then return ids[1]; end if;
  idx := idx + dir;
  if idx < 1 then idx := array_length(ids,1);
  elsif idx > array_length(ids,1) then idx := 1;
  end if;
  return ids[idx];
end;
$$;

-- Skip-then-next (for skip / draw specials the NEXT player after skipped)
create or replace function public._uno_skip_next(p_room_id uuid, p_current uuid)
returns uuid
language plpgsql as $$
declare skipped uuid;
begin
  skipped := public._uno_next_player(p_room_id, p_current);
  return public._uno_next_player(p_room_id, skipped);
end;
$$;

-- Deal N cards from draw_pile into a hand (returns updated draw_pile, hand)
create or replace function public._uno_deal(p_pile jsonb, p_hand jsonb, p_count integer)
returns jsonb -- { "pile": [...], "hand": [...] }
language plpgsql as $$
declare
  n integer := least(p_count, jsonb_array_length(p_pile));
begin
  for i in 0..n-1 loop
    p_hand := p_hand || jsonb_build_array(p_pile -> 0);
    p_pile := p_pile - 0;
  end loop;
  return jsonb_build_object('pile', p_pile, 'hand', p_hand);
end;
$$;

-- Build verb-match deck: each verb produces 4 cards (one per form),
-- each card shows ONLY one word. Cards of the same verb share verb_id.
-- Colors are cycled so that the 4 forms get different colors.
create or replace function public._uno_build_match_deck(p_verbs jsonb)
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
  v jsonb;
  forms text[];
  displays text[];
  cIdx integer;
begin
  for i in 0..jsonb_array_length(p_verbs)-1 loop
    v := p_verbs -> i;
    forms := array['infinitive','past_simple','past_participle','translation'];
    displays := array[
      v ->> 'infinitive',
      v ->> 'past_simple',
      v ->> 'past_participle',
      coalesce(v ->> 'translation', v ->> 'infinitive')
    ];
    for fi in 1..4 loop
      cIdx := ((i * 4 + fi - 1) % 4) + 1;  -- rotate colours
      deck := deck || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'color', colors[cIdx],
        'kind', 'verb-match',
        'verb_id', v ->> 'id',
        'display', displays[fi],
        'form', forms[fi]
      ));
    end loop;
  end loop;
  -- action cards
  foreach c in array colors loop
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- wild
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- ======================= ROOM CREATION =============================

drop function if exists public.uno_create_room(text, text, integer, text);
create or replace function public.uno_create_room(
  p_code text,
  p_mode text default 'classic',
  p_verb_count integer default 20,
  p_host_name text default 'Host'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  deck jsonb;
  dealt jsonb;
  room_row public.uno_rooms;
  host_row public.uno_players;
begin
  if p_mode = 'verb-match' then
    deck := public._uno_build_match_deck(public._uno_pick_verbs(p_verb_count));
  elsif p_mode = 'irregular-verbs' then
    deck := public._uno_build_verb_deck(public._uno_pick_verbs(p_verb_count));
  else
    deck := public._uno_build_classic_deck();
  end if;
  deck := public._uno_shuffle(deck);

  insert into public.uno_rooms (code, mode, verb_count, draw_pile)
  values (p_code, p_mode, greatest(15, least(p_verb_count, 25)), deck)
  returning * into room_row;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_host_name,''), 'Host'), true, 1)
  returning * into host_row;

  -- deal 7 cards
  dealt := public._uno_deal(room_row.draw_pile, '[]'::jsonb, 7);

  update public.uno_rooms
  set draw_pile = dealt -> 'pile',
      hands = jsonb_build_object(host_row.id::text, dealt -> 'hand'),
      host_id = host_row.id,
      current_player_id = host_row.id,
      state_version = state_version + 1
  where id = room_row.id
  returning * into room_row;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(host_row));
end;
$$;

grant execute on function public.uno_create_room(text, text, integer, text) to anon, authenticated;

-- ======================= JOIN ROOM =================================

drop function if exists public.uno_join_room(text, text);
create or replace function public.uno_join_room(
  p_room_code text,
  p_player_name text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  player_row public.uno_players;
  dealt jsonb;
  seat_no integer;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;

  select coalesce(max(seat),0)+1 into seat_no from public.uno_players where room_id = room_row.id;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_player_name,''), 'Игрок'), false, seat_no)
  returning * into player_row;

  -- deal 7 cards if still in lobby
  if room_row.status = 'lobby' then
    dealt := public._uno_deal(room_row.draw_pile, '[]'::jsonb, 7);
    update public.uno_rooms
    set draw_pile = dealt -> 'pile',
        hands = room_row.hands || jsonb_build_object(player_row.id::text, dealt -> 'hand'),
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  end if;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(player_row));
end;
$$;

grant execute on function public.uno_join_room(text, text) to anon, authenticated;

-- ======================= START GAME ================================

drop function if exists public.uno_start_game(text);
create or replace function public.uno_start_game(p_room_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  first_card jsonb;
  idx integer := 0;
  pile jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;

  pile := room_row.draw_pile;
  -- find first non-wild4 card to start discard
  while idx < jsonb_array_length(pile) loop
    first_card := pile -> idx;
    exit when first_card ->> 'kind' <> 'wild4';
    idx := idx + 1;
  end loop;
  if first_card is null then raise exception 'Колода пуста'; end if;

  pile := pile - idx;  -- remove that card from pile

  update public.uno_rooms
  set draw_pile = pile,
      discard_pile = jsonb_build_array(first_card),
      status = 'playing',
      state_version = state_version + 1,
      updated_at = now()
  where id = room_row.id
  returning * into room_row;

  return to_jsonb(room_row);
end;
$$;

grant execute on function public.uno_start_game(text) to anon, authenticated;

-- ======================= DRAW CARD =================================

drop function if exists public.uno_draw_card(text, uuid);
create or replace function public.uno_draw_card(
  p_room_code text,
  p_player_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  card jsonb;
  hand jsonb;
  reshuffled jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if room_row.status <> 'playing' then raise exception 'Игра не запущена'; end if;
  if room_row.current_player_id <> p_player_id then raise exception 'Сейчас ход другого игрока'; end if;

  -- If draw pile is empty, reshuffle discard pile (keep top card)
  if jsonb_array_length(room_row.draw_pile) = 0 then
    if jsonb_array_length(room_row.discard_pile) <= 1 then
      raise exception 'Колода пуста и нечего перемешивать';
    end if;
    -- Keep only the top card in discard, rest goes to draw pile
    reshuffled := '[]'::jsonb;
    for i in 0..(jsonb_array_length(room_row.discard_pile) - 2) loop
      reshuffled := reshuffled || jsonb_build_array(room_row.discard_pile -> i);
    end loop;
    room_row.draw_pile := public._uno_shuffle(reshuffled);
    room_row.discard_pile := jsonb_build_array(room_row.discard_pile -> (jsonb_array_length(room_row.discard_pile) - 1));
  end if;

  card := room_row.draw_pile -> 0;
  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);
  hand := hand || jsonb_build_array(card);
  room_row.draw_pile := room_row.draw_pile - 0;

  update public.uno_rooms
  set draw_pile = room_row.draw_pile,
      discard_pile = room_row.discard_pile,
      hands = jsonb_set(room_row.hands, array[p_player_id::text], hand, true),
      current_player_id = public._uno_next_player(room_row.id, p_player_id),
      state_version = state_version + 1,
      updated_at = now()
  where id = room_row.id
  returning * into room_row;

  -- log event
  insert into public.uno_events (room_id, player_id, event_type, payload)
  values (room_row.id, p_player_id, 'draw_card', jsonb_build_object('card_id', card ->> 'id'));

  return jsonb_build_object('card', card, 'room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_draw_card(text, uuid) to anon, authenticated;

-- ======================= PLAY CARD =================================

drop function if exists public.uno_play_card(text, uuid, uuid, text);
create or replace function public.uno_play_card(
  p_room_code text,
  p_player_id uuid,
  p_card_id text,
  p_chosen_color text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  hand jsonb;
  card jsonb;
  top_card jsonb;
  idx integer := -1;
  pile jsonb;
  dir integer;
  next_p uuid;
  draw_n integer := 0;
  target_hand jsonb;
  dealt jsonb;
  player_count integer;
  reshuffled jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if room_row.status <> 'playing' then raise exception 'Игра не запущена'; end if;
  if room_row.current_player_id <> p_player_id then raise exception 'Сейчас ход другого игрока'; end if;

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);

  -- find card in hand
  for i in 0..jsonb_array_length(hand)-1 loop
    if (hand -> i) ->> 'id' = p_card_id then
      idx := i; card := hand -> i; exit;
    end if;
  end loop;
  if card is null then raise exception 'Карта не найдена в руке'; end if;

  -- top card
  if jsonb_array_length(room_row.discard_pile) > 0 then
    top_card := room_row.discard_pile -> (jsonb_array_length(room_row.discard_pile) - 1);
  end if;

  -- rule validation
  if card ->> 'kind' not in ('wild','wild4') and top_card is not null then
    if not (
         (card ->> 'color') = (top_card ->> 'color')
      or ((card ->> 'kind') = 'verb-match' and (top_card ->> 'kind') = 'verb-match' and (card ->> 'verb_id') = (top_card ->> 'verb_id'))
      or ((card ->> 'kind') = 'verb' and (top_card ->> 'kind') = 'verb' and (card -> 'verb' ->> 'id') = (top_card -> 'verb' ->> 'id'))
      or ((card ->> 'kind') = 'number' and (top_card ->> 'kind') = 'number' and (card ->> 'value') = (top_card ->> 'value'))
      or ((card ->> 'kind') = (top_card ->> 'kind') and (card ->> 'kind') in ('skip','reverse','draw2'))
    ) then
      raise exception 'Нельзя сходить этой картой';
    end if;
  end if;

  -- wild → override colour
  if card ->> 'kind' in ('wild','wild4') then
    if p_chosen_color is null then raise exception 'Нужно выбрать цвет для wild'; end if;
    card := jsonb_set(card, '{color}', to_jsonb(p_chosen_color));
  end if;

  -- remove card from hand
  hand := hand - idx;

  -- push to discard
  pile := room_row.discard_pile || jsonb_build_array(card);

  -- direction
  dir := room_row.direction;
  if card ->> 'kind' = 'reverse' then dir := dir * -1; end if;

  -- count players for 2-player Reverse=Skip rule
  select count(*) into player_count from public.uno_players where room_id = room_row.id;

  -- determine next player + specials
  if card ->> 'kind' = 'skip' then
    next_p := public._uno_skip_next(room_row.id, p_player_id);
  elsif card ->> 'kind' = 'reverse' and player_count = 2 then
    -- In 2-player UNO, Reverse acts as Skip
    next_p := public._uno_skip_next(room_row.id, p_player_id);
  elsif card ->> 'kind' = 'draw2' then
    next_p := public._uno_next_player(room_row.id, p_player_id);
    draw_n := 2;
  elsif card ->> 'kind' = 'wild4' then
    next_p := public._uno_next_player(room_row.id, p_player_id);
    draw_n := 4;
  else
    next_p := public._uno_next_player(room_row.id, p_player_id);
  end if;

  -- update the playing player's hand in room_row
  room_row.hands := jsonb_set(room_row.hands, array[p_player_id::text], hand, true);

  -- apply draws to target player (for +2 and +4)
  if draw_n > 0 and next_p is not null then
    -- If draw pile exhausted, reshuffle discard (keep top card which is the one just played)
    if jsonb_array_length(room_row.draw_pile) < draw_n then
      -- Move all but the last card from the current discard pile into draw
      -- Note: 'pile' already includes the card just played at the end
      if jsonb_array_length(pile) > 1 then
        reshuffled := '[]'::jsonb;
        for ri in 0..(jsonb_array_length(pile) - 2) loop
          reshuffled := reshuffled || jsonb_build_array(pile -> ri);
        end loop;
        room_row.draw_pile := room_row.draw_pile || public._uno_shuffle(reshuffled);
        pile := jsonb_build_array(pile -> (jsonb_array_length(pile) - 1));
      end if;
    end if;

    target_hand := coalesce(room_row.hands -> next_p::text, '[]'::jsonb);
    dealt := public._uno_deal(room_row.draw_pile, target_hand, draw_n);
    room_row.draw_pile := dealt -> 'pile';
    room_row.hands := jsonb_set(room_row.hands, array[next_p::text], dealt -> 'hand', true);
    -- after drawing, skip that player's turn (standard UNO rule)
    next_p := public._uno_next_player(room_row.id, next_p);
  end if;

  -- check win
  if jsonb_array_length(hand) = 0 then
    update public.uno_rooms
    set discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = null,
        winner_id = p_player_id,
        status = 'finished',
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  else
    update public.uno_rooms
    set discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = next_p,
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  end if;

  -- log event
  insert into public.uno_events (room_id, player_id, event_type, payload)
  values (room_row.id, p_player_id, 'play_card', jsonb_build_object('card', card));

  return jsonb_build_object('room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_play_card(text, uuid, text, text) to anon, authenticated;

-- ===================== VERIFICATION ================================
select 'irregular_verbs' as "table", count(*) as "rows" from public.irregular_verbs
union all
select 'uno_rooms', count(*) from public.uno_rooms;


-- FILE: supabase-seed-verbs.sql
-- ==========================================================
-- 150+ Irregular Verbs for UNO "Неправильные глаголы" mode
-- Run after supabase-add-uno.sql
-- ==========================================================

-- Clear old seed data to avoid duplicates
delete from public.irregular_verbs;

insert into public.irregular_verbs (infinitive, past_simple, past_participle, translation) values
  ('be', 'was/were', 'been', 'быть'),
  ('beat', 'beat', 'beaten', 'бить'),
  ('become', 'became', 'become', 'становиться'),
  ('begin', 'began', 'begun', 'начинать'),
  ('bend', 'bent', 'bent', 'гнуть'),
  ('bet', 'bet', 'bet', 'ставить (пари)'),
  ('bind', 'bound', 'bound', 'связывать'),
  ('bite', 'bit', 'bitten', 'кусать'),
  ('bleed', 'bled', 'bled', 'кровоточить'),
  ('blow', 'blew', 'blown', 'дуть'),
  ('break', 'broke', 'broken', 'ломать'),
  ('breed', 'bred', 'bred', 'разводить'),
  ('bring', 'brought', 'brought', 'приносить'),
  ('broadcast', 'broadcast', 'broadcast', 'транслировать'),
  ('build', 'built', 'built', 'строить'),
  ('burn', 'burnt', 'burnt', 'жечь'),
  ('burst', 'burst', 'burst', 'лопаться'),
  ('buy', 'bought', 'bought', 'покупать'),
  ('catch', 'caught', 'caught', 'ловить'),
  ('choose', 'chose', 'chosen', 'выбирать'),
  ('cling', 'clung', 'clung', 'цепляться'),
  ('come', 'came', 'come', 'приходить'),
  ('cost', 'cost', 'cost', 'стоить'),
  ('creep', 'crept', 'crept', 'ползать'),
  ('cut', 'cut', 'cut', 'резать'),
  ('deal', 'dealt', 'dealt', 'иметь дело'),
  ('dig', 'dug', 'dug', 'копать'),
  ('do', 'did', 'done', 'делать'),
  ('draw', 'drew', 'drawn', 'рисовать'),
  ('dream', 'dreamt', 'dreamt', 'мечтать'),
  ('drink', 'drank', 'drunk', 'пить'),
  ('drive', 'drove', 'driven', 'водить'),
  ('eat', 'ate', 'eaten', 'есть'),
  ('fall', 'fell', 'fallen', 'падать'),
  ('feed', 'fed', 'fed', 'кормить'),
  ('feel', 'felt', 'felt', 'чувствовать'),
  ('fight', 'fought', 'fought', 'драться'),
  ('find', 'found', 'found', 'находить'),
  ('flee', 'fled', 'fled', 'бежать'),
  ('fly', 'flew', 'flown', 'летать'),
  ('forbid', 'forbade', 'forbidden', 'запрещать'),
  ('forget', 'forgot', 'forgotten', 'забывать'),
  ('forgive', 'forgave', 'forgiven', 'прощать'),
  ('freeze', 'froze', 'frozen', 'замерзать'),
  ('get', 'got', 'got', 'получать'),
  ('give', 'gave', 'given', 'давать'),
  ('go', 'went', 'gone', 'идти'),
  ('grow', 'grew', 'grown', 'расти'),
  ('hang', 'hung', 'hung', 'вешать'),
  ('have', 'had', 'had', 'иметь'),
  ('hear', 'heard', 'heard', 'слышать'),
  ('hide', 'hid', 'hidden', 'прятать'),
  ('hit', 'hit', 'hit', 'ударять'),
  ('hold', 'held', 'held', 'держать'),
  ('hurt', 'hurt', 'hurt', 'причинять боль'),
  ('keep', 'kept', 'kept', 'хранить'),
  ('kneel', 'knelt', 'knelt', 'стоять на коленях'),
  ('knit', 'knit', 'knit', 'вязать'),
  ('know', 'knew', 'known', 'знать'),
  ('lay', 'laid', 'laid', 'класть'),
  ('lead', 'led', 'led', 'вести'),
  ('lean', 'leant', 'leant', 'наклоняться'),
  ('leap', 'leapt', 'leapt', 'прыгать'),
  ('learn', 'learnt', 'learnt', 'учиться'),
  ('leave', 'left', 'left', 'покидать'),
  ('lend', 'lent', 'lent', 'одалживать'),
  ('let', 'let', 'let', 'позволять'),
  ('lie', 'lay', 'lain', 'лежать'),
  ('light', 'lit', 'lit', 'зажигать'),
  ('lose', 'lost', 'lost', 'терять'),
  ('make', 'made', 'made', 'делать'),
  ('mean', 'meant', 'meant', 'значить'),
  ('meet', 'met', 'met', 'встречать'),
  ('mow', 'mowed', 'mown', 'косить'),
  ('overcome', 'overcame', 'overcome', 'преодолевать'),
  ('pay', 'paid', 'paid', 'платить'),
  ('put', 'put', 'put', 'класть'),
  ('quit', 'quit', 'quit', 'бросать'),
  ('read', 'read', 'read', 'читать'),
  ('ride', 'rode', 'ridden', 'ехать верхом'),
  ('ring', 'rang', 'rung', 'звонить'),
  ('rise', 'rose', 'risen', 'подниматься'),
  ('run', 'ran', 'run', 'бегать'),
  ('say', 'said', 'said', 'говорить'),
  ('see', 'saw', 'seen', 'видеть'),
  ('seek', 'sought', 'sought', 'искать'),
  ('sell', 'sold', 'sold', 'продавать'),
  ('send', 'sent', 'sent', 'отправлять'),
  ('set', 'set', 'set', 'устанавливать'),
  ('sew', 'sewed', 'sewn', 'шить'),
  ('shake', 'shook', 'shaken', 'трясти'),
  ('shine', 'shone', 'shone', 'светить'),
  ('shoot', 'shot', 'shot', 'стрелять'),
  ('show', 'showed', 'shown', 'показывать'),
  ('shrink', 'shrank', 'shrunk', 'сжиматься'),
  ('shut', 'shut', 'shut', 'закрывать'),
  ('sing', 'sang', 'sung', 'петь'),
  ('sink', 'sank', 'sunk', 'тонуть'),
  ('sit', 'sat', 'sat', 'сидеть'),
  ('sleep', 'slept', 'slept', 'спать'),
  ('slide', 'slid', 'slid', 'скользить'),
  ('smell', 'smelt', 'smelt', 'нюхать'),
  ('sow', 'sowed', 'sown', 'сеять'),
  ('speak', 'spoke', 'spoken', 'разговаривать'),
  ('speed', 'sped', 'sped', 'мчаться'),
  ('spell', 'spelt', 'spelt', 'произносить по буквам'),
  ('spend', 'spent', 'spent', 'тратить'),
  ('spill', 'spilt', 'spilt', 'проливать'),
  ('spin', 'spun', 'spun', 'вращать'),
  ('spit', 'spat', 'spat', 'плевать'),
  ('split', 'split', 'split', 'раскалывать'),
  ('spoil', 'spoilt', 'spoilt', 'портить'),
  ('spread', 'spread', 'spread', 'распространять'),
  ('spring', 'sprang', 'sprung', 'прыгать'),
  ('stand', 'stood', 'stood', 'стоять'),
  ('steal', 'stole', 'stolen', 'красть'),
  ('stick', 'stuck', 'stuck', 'приклеивать'),
  ('sting', 'stung', 'stung', 'жалить'),
  ('stink', 'stank', 'stunk', 'вонять'),
  ('strike', 'struck', 'struck', 'ударять'),
  ('strive', 'strove', 'striven', 'стремиться'),
  ('swear', 'swore', 'sworn', 'клясться'),
  ('sweep', 'swept', 'swept', 'подметать'),
  ('swim', 'swam', 'swum', 'плавать'),
  ('swing', 'swung', 'swung', 'качаться'),
  ('take', 'took', 'taken', 'брать'),
  ('teach', 'taught', 'taught', 'учить'),
  ('tear', 'tore', 'torn', 'рвать'),
  ('tell', 'told', 'told', 'рассказывать'),
  ('think', 'thought', 'thought', 'думать'),
  ('throw', 'threw', 'thrown', 'бросать'),
  ('tread', 'trod', 'trodden', 'ступать'),
  ('understand', 'understood', 'understood', 'понимать'),
  ('upset', 'upset', 'upset', 'расстраивать'),
  ('wake', 'woke', 'woken', 'просыпаться'),
  ('wear', 'wore', 'worn', 'носить'),
  ('weave', 'wove', 'woven', 'ткать'),
  ('weep', 'wept', 'wept', 'плакать'),
  ('win', 'won', 'won', 'побеждать'),
  ('wind', 'wound', 'wound', 'наматывать'),
  ('withdraw', 'withdrew', 'withdrawn', 'отступать'),
  ('wring', 'wrung', 'wrung', 'выжимать'),
  ('write', 'wrote', 'written', 'писать'),
  ('arise', 'arose', 'arisen', 'возникать'),
  ('awake', 'awoke', 'awoken', 'просыпаться'),
  ('bear', 'bore', 'borne', 'нести'),
  ('bid', 'bid', 'bid', 'предлагать цену'),
  ('bleed', 'bled', 'bled', 'истекать кровью'),
  ('cling', 'clung', 'clung', 'прилипать'),
  ('creep', 'crept', 'crept', 'красться'),
  ('dare', 'dared', 'dared', 'осмеливаться'),
  ('dig', 'dug', 'dug', 'рыть'),
  ('dwell', 'dwelt', 'dwelt', 'обитать'),
  ('fling', 'flung', 'flung', 'бросать'),
  ('grind', 'ground', 'ground', 'молоть'),
  ('leap', 'leapt', 'leapt', 'перепрыгивать'),
  ('mistake', 'mistook', 'mistaken', 'ошибаться'),
  ('overcome', 'overcame', 'overcome', 'побеждать'),
  ('overtake', 'overtook', 'overtaken', 'обгонять'),
  ('prove', 'proved', 'proven', 'доказывать'),
  ('rid', 'rid', 'rid', 'избавляться'),
  ('saw', 'sawed', 'sawn', 'пилить'),
  ('slay', 'slew', 'slain', 'убивать'),
  ('sling', 'slung', 'slung', 'бросать (камень)'),
  ('slit', 'slit', 'slit', 'разрезать'),
  ('sneak', 'snuck', 'snuck', 'красться'),
  ('stride', 'strode', 'stridden', 'шагать'),
  ('string', 'strung', 'strung', 'нанизывать'),
  ('swear', 'swore', 'sworn', 'ругаться'),
  ('thrust', 'thrust', 'thrust', 'толкать'),
  ('undergo', 'underwent', 'undergone', 'проходить'),
  ('undertake', 'undertook', 'undertaken', 'предпринимать'),
  ('undo', 'undid', 'undone', 'отменять'),
  ('uphold', 'upheld', 'upheld', 'поддерживать'),
  ('withstand', 'withstood', 'withstood', 'выдерживать'),
  ('wring', 'wrung', 'wrung', 'скручивать');

-- Verify count
select count(*) as total_irregular_verbs from public.irregular_verbs;

