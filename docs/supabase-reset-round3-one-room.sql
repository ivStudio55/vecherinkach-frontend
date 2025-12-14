-- Reset Round 3 state for ALL rooms (clears all round3 data).
-- Usage: run in Supabase SQL editor.
-- WARNING: This will reset ALL Round 3 progress across all rooms!

DO $$
BEGIN
  -- Clear per-round tables for all rooms
  DELETE FROM public.round3_votes;
  DELETE FROM public.round3_answers;

  -- Reset round3 fields for all rooms that are in round3 states
  UPDATE public.rooms
  SET
    status = 'round3-ready',
    round3_phase = NULL,
    round3_question_index = NULL,
    round3_question_id = NULL,
    round3_question_started_at = NULL,
    round3_vote_started_at = NULL
  WHERE status LIKE 'round3%';
END $$;
