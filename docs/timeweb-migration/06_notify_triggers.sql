-- ================================================================
-- ШАГ 6: Добавить NOTIFY-триггеры для Centrifugo
-- Запускать ПОСЛЕ импорта дампа в Timeweb
-- Эти триггеры заменяют supabase_realtime публикации
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Функция-нотифаер для таблицы rooms
--    Публикует в канал "room:<room_id>" при любом изменении
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_room_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Для INSERT и UPDATE публикуем новую строку
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM pg_notify(
      'room_changes',
      json_build_object(
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'room_id', NEW.id::text,
        'data', row_to_json(NEW)
      )::text
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------
-- 2. Триггеры на изменения комнат (основной realtime)
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_room_change ON public.rooms;
CREATE TRIGGER trg_notify_room_change
AFTER INSERT OR UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();

-- ----------------------------------------------------------------
-- 3. Функция-нотифаер для таблиц игроков (подключение/отключение)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_player_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    PERFORM pg_notify(
      'player_changes',
      json_build_object(
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'room_id', COALESCE(NEW.room_id, OLD.room_id)::text,
        'data', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
      )::text
    );
    RETURN COALESCE(NEW, OLD);
  END IF;
  RETURN NULL;
END;
$$;

-- Применяем ко всем таблицам игроков
DROP TRIGGER IF EXISTS trg_notify_player_change ON public.players;
CREATE TRIGGER trg_notify_player_change
AFTER INSERT OR UPDATE OR DELETE ON public.players
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

DROP TRIGGER IF EXISTS trg_notify_jokester_room ON public.jokester_rooms;
CREATE TRIGGER trg_notify_jokester_room
AFTER INSERT OR UPDATE ON public.jokester_rooms
FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();

DROP TRIGGER IF EXISTS trg_notify_creativach_room ON public.creativach_rooms;
CREATE TRIGGER trg_notify_creativach_room
AFTER INSERT OR UPDATE ON public.creativach_rooms
FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();

DROP TRIGGER IF EXISTS trg_notify_draw_room ON public.draw_rooms;
CREATE TRIGGER trg_notify_draw_room
AFTER INSERT OR UPDATE ON public.draw_rooms
FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();

DROP TRIGGER IF EXISTS trg_notify_uno_room ON public.uno_rooms;
CREATE TRIGGER trg_notify_uno_room
AFTER INSERT OR UPDATE ON public.uno_rooms
FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();

-- ----------------------------------------------------------------
-- 4. Функция-нотифаер для ответов (realtime синхронизация ответов)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_answer_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_round3_answer ON public.round3_answers;
CREATE TRIGGER trg_notify_round3_answer
AFTER INSERT OR UPDATE ON public.round3_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

DROP TRIGGER IF EXISTS trg_notify_round3_vote ON public.round3_votes;
CREATE TRIGGER trg_notify_round3_vote
AFTER INSERT OR UPDATE ON public.round3_votes
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

DROP TRIGGER IF EXISTS trg_notify_jokester_answer ON public.jokester_answers;
CREATE TRIGGER trg_notify_jokester_answer
AFTER INSERT OR UPDATE ON public.jokester_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

DROP TRIGGER IF EXISTS trg_notify_jokester_vote ON public.jokester_votes;
CREATE TRIGGER trg_notify_jokester_vote
AFTER INSERT OR UPDATE ON public.jokester_votes
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

DROP TRIGGER IF EXISTS trg_notify_creativach_answer ON public.creativach_answers;
CREATE TRIGGER trg_notify_creativach_answer
AFTER INSERT OR UPDATE ON public.creativach_answers
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

DROP TRIGGER IF EXISTS trg_notify_creativach_vote ON public.creativach_votes;
CREATE TRIGGER trg_notify_creativach_vote
AFTER INSERT OR UPDATE ON public.creativach_votes
FOR EACH ROW EXECUTE FUNCTION public.notify_answer_change();

-- ----------------------------------------------------------------
-- 5. Проверка created триггеров
-- ----------------------------------------------------------------
SELECT
    trigger_name,
    event_object_table AS "table",
    event_manipulation AS event,
    action_timing AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trg_notify_%'
ORDER BY event_object_table, trigger_name;
