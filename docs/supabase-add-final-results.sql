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
