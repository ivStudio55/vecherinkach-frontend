-- =====================================================================
-- Добавление статусов "Горячая картошка" в Выживач
-- =====================================================================

-- Удаляем старый CHECK constraint
ALTER TABLE survivach_rooms DROP CONSTRAINT IF EXISTS survivach_rooms_status_check;

-- Добавляем новый CHECK constraint с дополнительными статусами
ALTER TABLE survivach_rooms ADD CONSTRAINT survivach_rooms_status_check
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
    'potato_intro',
    'potato_playing',
    'potato_result',
    'finished'
  ));

-- Проверка: выводим список допустимых статусов
SELECT conname, consrc
FROM pg_constraint
WHERE conname = 'survivach_rooms_status_check';
