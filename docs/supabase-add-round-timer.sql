-- Добавляем время старта вопроса и объяснения к вопросам
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS question_started_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS explanation text;

-- Сбрасываем таймер для уже созданных комнат
UPDATE rooms
SET question_started_at = timezone('utc', now())
WHERE question_started_at IS NULL;

-- Пример заполнения объяснений (обновите по необходимости)
UPDATE questions
SET explanation = '7 умножить на 8 — это 56.'
WHERE text = 'Сколько будет 7 × 8?' AND (explanation IS NULL OR explanation = '');
