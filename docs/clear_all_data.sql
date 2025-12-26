-- Очистка всех данных (TRUNCATE быстрее и надежнее для полной очистки)
-- Выполните этот запрос в Supabase SQL Editor

TRUNCATE TABLE 
  round4_answers,
  round3_votes,
  round3_answers,
  round2_answers,
  answers,
  players,
  rooms
CASCADE;
