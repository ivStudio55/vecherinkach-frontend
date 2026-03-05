-- Fix broken trigger functions (wrong column references + oversized payload)

-- 1) jokester_answers: no room_id column — look it up from jokester_duels
CREATE OR REPLACE FUNCTION public.notify_jokester_answer_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_room_id uuid;
BEGIN
  SELECT room_id INTO v_room_id FROM public.jokester_duels WHERE id = NEW.duel_id;
  PERFORM pg_notify(
    'answer_changes',
    json_build_object(
      'table',     TG_TABLE_NAME,
      'op',        TG_OP,
      'room_id',   v_room_id::text,
      'player_id', NEW.player_id::text,
      'data',      row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_jokester_answer ON public.jokester_answers;
CREATE TRIGGER trg_notify_jokester_answer
  AFTER INSERT OR UPDATE ON public.jokester_answers
  FOR EACH ROW EXECUTE FUNCTION public.notify_jokester_answer_change();

-- 2) creativach_votes: no player_id column — use voter_id instead
CREATE OR REPLACE FUNCTION public.notify_creativach_vote_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'answer_changes',
    json_build_object(
      'table',     TG_TABLE_NAME,
      'op',        TG_OP,
      'room_id',   NEW.room_id::text,
      'player_id', NEW.voter_id::text,
      'data',      row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_creativach_vote ON public.creativach_votes;
CREATE TRIGGER trg_notify_creativach_vote
  AFTER INSERT OR UPDATE ON public.creativach_votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_creativach_vote_change();

-- 3) draw_steps: exclude drawing_data from pg_notify payload (base64 images exceed 8KB limit)
CREATE OR REPLACE FUNCTION public.notify_draw_step_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_room_id  uuid;
  v_chain_id uuid;
  v_row      jsonb;
BEGIN
  v_chain_id := COALESCE(NEW.chain_id, OLD.chain_id);
  SELECT room_id INTO v_room_id FROM public.draw_chains WHERE id = v_chain_id;
  IF v_room_id IS NOT NULL THEN
    v_row := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END) - 'drawing_data';
    PERFORM pg_notify(
      'player_changes',
      json_build_object(
        'table',   TG_TABLE_NAME,
        'op',      TG_OP,
        'room_id', v_room_id::text,
        'data',    v_row
      )::text
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

SELECT 'triggers fixed OK' AS result;
