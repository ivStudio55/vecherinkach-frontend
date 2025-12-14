-- Reset Round 3 state for a single room.
-- Usage: set the room code below, run in Supabase SQL editor.

-- 1) Set room code
-- Replace 'ABCDE' with your real room code
DO $$
DECLARE
  v_room_code text := 'ABCDE';
  v_room_id uuid;
BEGIN
  SELECT id INTO v_room_id FROM public.rooms WHERE code = v_room_code;
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Room with code % not found', v_room_code;
  END IF;

  -- Clear per-round tables
  DELETE FROM public.round3_votes WHERE room_id = v_room_id;
  DELETE FROM public.round3_answers WHERE room_id = v_room_id;

  -- Clear room round3 fields
  UPDATE public.rooms
  SET
    status = 'round3-ready',
    round3_phase = NULL,
    round3_question_index = NULL,
    round3_question_id = NULL,
    round3_question_started_at = NULL,
    round3_vote_started_at = NULL
  WHERE id = v_room_id;
END $$;
