-- ================================================================
-- ШАГ 7: NOTIFY-триггеры для игровых таблиц (PlayerS, Duels, etc.)
-- Дополняет 06_notify_triggers.sql
-- Запускать на Timeweb PostgreSQL
-- ================================================================

-- ----------------------------------------------------------------
-- Триггеры для jokester_players, jokester_duels, jokester_category_votes
-- Все используют notify_player_change() → 'player_changes'
-- pg-notifier направляет в канал jokester:{room_id}
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_notify_jokester_players ON public.jokester_players;
CREATE TRIGGER trg_notify_jokester_players
AFTER INSERT OR UPDATE OR DELETE ON public.jokester_players
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

DROP TRIGGER IF EXISTS trg_notify_jokester_duels ON public.jokester_duels;
CREATE TRIGGER trg_notify_jokester_duels
AFTER INSERT OR UPDATE OR DELETE ON public.jokester_duels
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

DROP TRIGGER IF EXISTS trg_notify_jokester_category_votes ON public.jokester_category_votes;
CREATE TRIGGER trg_notify_jokester_category_votes
AFTER INSERT OR UPDATE OR DELETE ON public.jokester_category_votes
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

-- ----------------------------------------------------------------
-- Триггеры для creativach_players
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_notify_creativach_players ON public.creativach_players;
CREATE TRIGGER trg_notify_creativach_players
AFTER INSERT OR UPDATE OR DELETE ON public.creativach_players
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

-- ----------------------------------------------------------------
-- Триггеры для draw_players
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_notify_draw_players ON public.draw_players;
CREATE TRIGGER trg_notify_draw_players
AFTER INSERT OR UPDATE OR DELETE ON public.draw_players
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

-- ----------------------------------------------------------------
-- Триггеры для uno_players
-- ----------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_notify_uno_players ON public.uno_players;
CREATE TRIGGER trg_notify_uno_players
AFTER INSERT OR UPDATE OR DELETE ON public.uno_players
FOR EACH ROW EXECUTE FUNCTION public.notify_player_change();

-- ----------------------------------------------------------------
-- Функция для draw_steps (room_id берём из draw_chains)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_draw_step_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id uuid;
  v_chain_id uuid;
BEGIN
  v_chain_id := COALESCE(NEW.chain_id, OLD.chain_id);
  SELECT room_id INTO v_room_id FROM public.draw_chains WHERE id = v_chain_id;
  IF v_room_id IS NOT NULL THEN
    PERFORM pg_notify(
      'player_changes',
      json_build_object(
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'room_id', v_room_id::text,
        'data', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
      )::text
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_draw_steps ON public.draw_steps;
CREATE TRIGGER trg_notify_draw_steps
AFTER INSERT OR UPDATE OR DELETE ON public.draw_steps
FOR EACH ROW EXECUTE FUNCTION public.notify_draw_step_change();

-- ----------------------------------------------------------------
-- Проверка
-- ----------------------------------------------------------------
SELECT trigger_name, event_object_table AS "table"
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trg_notify_%'
ORDER BY event_object_table;
