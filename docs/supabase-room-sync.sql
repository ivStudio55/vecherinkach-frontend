-- Room sync support
alter table rooms
  add column if not exists state_version bigint default 0;

alter table rooms
  add column if not exists transitioning_to_next boolean default false;

create or replace function bump_room_state_version()
returns trigger
language plpgsql
as $$
begin
  new.state_version := coalesce(old.state_version, 0) + 1;
  return new;
end;
$$;

-- Ensure state_version increments on every room update
DROP TRIGGER IF EXISTS trg_bump_room_state_version ON rooms;
CREATE TRIGGER trg_bump_room_state_version
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION bump_room_state_version();

-- RPC for single-call answer submit + points update (Round 1)
drop function if exists submit_answer(uuid, uuid, integer, text, boolean, integer);
create or replace function submit_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_question_index integer,
  p_answer text,
  p_is_correct boolean,
  p_points integer
)
returns table (
  player_id uuid,
  total_points integer,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  answer_exists boolean;
  updated_points integer;
begin
  select exists(
    select 1
    from answers
    where room_id = p_room_id
      and player_id = p_player_id
      and question_index = p_question_index
  ) into answer_exists;

  if answer_exists then
    select total_points into updated_points
    from players
    where id = p_player_id;

    return query
    select p_player_id, updated_points, true;
    return;
  end if;

  insert into answers (room_id, player_id, question_index, text, is_correct, points_earned)
  values (p_room_id, p_player_id, p_question_index, p_answer, p_is_correct, p_points)
  on conflict do nothing;

  if p_is_correct then
    update players
      set total_points = coalesce(total_points, 0) + p_points
    where id = p_player_id
    returning total_points into updated_points;
  else
    select total_points into updated_points
    from players
    where id = p_player_id;
  end if;

  return query
  select p_player_id, updated_points, false;
end;
$$;

grant execute on function submit_answer(uuid, uuid, integer, text, boolean, integer) to anon, authenticated;

-- Optional: ensure a unique constraint to avoid double answers
-- create unique index if not exists answers_unique on answers (room_id, player_id, question_index);
