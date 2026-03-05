-- ================================================================
-- ШАГ 8: NOTIFY-триггеры для round4_answers и round5_answers
-- Запустить на Timeweb PostgreSQL для включения real-time в 4 и 5 раундах
-- ================================================================

-- ----------------------------------------------------------------
-- Функция-нотифаер для ответов раундов 4 и 5
-- Публикует в канал "answer_changes" → pg-notifier направляет в "answers:{room_id}"
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_main_answer_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM pg_notify(
      'answer_changes',
      json_build_object(
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'room_id', NEW.room_id::text,
        'player_id', NEW.player_id::text,
        'data', row_to_json(NEW)
      )::text
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------
-- Триггеры на round4_answers
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_round4_answer ON public.round4_answers;
CREATE TRIGGER trg_notify_round4_answer
AFTER INSERT OR UPDATE ON public.round4_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_main_answer_change();

-- ----------------------------------------------------------------
-- Триггеры на round5_answers
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_round5_answer ON public.round5_answers;
CREATE TRIGGER trg_notify_round5_answer
AFTER INSERT OR UPDATE ON public.round5_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_main_answer_change();

-- ----------------------------------------------------------------
-- Проверка
-- ----------------------------------------------------------------
SELECT trigger_name, event_object_table AS "table", event_manipulation AS "event"
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('trg_notify_round4_answer', 'trg_notify_round5_answer')
ORDER BY event_object_table;
