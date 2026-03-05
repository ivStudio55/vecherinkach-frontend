-- Fix jokester_votes trigger: no room_id/player_id columns, look them up from jokester_duels

CREATE OR REPLACE FUNCTION public.notify_jokester_vote_change() RETURNS trigger
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
      'player_id', NEW.voter_id::text,
      'data',      row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_jokester_vote ON public.jokester_votes;
CREATE TRIGGER trg_notify_jokester_vote
  AFTER INSERT OR UPDATE ON public.jokester_votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_jokester_vote_change();

SELECT 'jokester_votes trigger fixed' AS result;
