-- Atomic JSON merge RPCs for duel participation data.
-- Prevents race conditions when multiple players submit votes/guesses/mines
-- within the same polling interval (last-write-wins would silently drop earlier votes).

-- crowd_forecast: player votes on an option index
CREATE OR REPLACE FUNCTION survivach_merge_duel_vote(
  p_duel_id uuid,
  p_player_id text,
  p_option_idx integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE survivach_duels
  SET duel_data = jsonb_set(
    COALESCE(duel_data, '{}'),
    ARRAY['player_votes', p_player_id],
    to_jsonb(p_option_idx)
  )
  WHERE id = p_duel_id
    AND (
      duel_data -> 'player_votes' IS NULL
      OR NOT (duel_data -> 'player_votes' ? p_player_id)
    );
END;
$$;

-- arithmetic_mean: player submits a numeric guess
CREATE OR REPLACE FUNCTION survivach_merge_duel_guess(
  p_duel_id uuid,
  p_player_id text,
  p_guess_num numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE survivach_duels
  SET duel_data = jsonb_set(
    COALESCE(duel_data, '{}'),
    ARRAY['player_guesses', p_player_id],
    to_jsonb(p_guess_num)
  )
  WHERE id = p_duel_id
    AND (
      duel_data -> 'player_guesses' IS NULL
      OR NOT (duel_data -> 'player_guesses' ? p_player_id)
    );
END;
$$;

-- minesweeper: player places their mines (array of tile indices)
CREATE OR REPLACE FUNCTION survivach_merge_duel_mine(
  p_duel_id uuid,
  p_player_id text,
  p_mine_indices integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE survivach_duels
  SET duel_data = jsonb_set(
    COALESCE(duel_data, '{}'),
    ARRAY['mined_tiles', p_player_id],
    to_jsonb(p_mine_indices)
  )
  WHERE id = p_duel_id;
END;
$$;

-- No explicit GRANT needed: PostgREST connects as gen_user who owns these functions.
