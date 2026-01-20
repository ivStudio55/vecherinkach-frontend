-- Room sync support
alter table rooms
  add column if not exists state_version bigint default 0;

alter table rooms
  add column if not exists transitioning_to_next boolean default false;

-- Add missing columns for room functionality
alter table rooms
  add column if not exists status text not null default 'waiting';

alter table rooms
  add column if not exists question_started_at timestamptz;

alter table rooms
  add column if not exists pack_id text not null default 'classic';

-- Add status constraint
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'rooms_status_check'
  ) then
    alter table rooms
    drop constraint rooms_status_check;
  end if;
  alter table rooms
  add constraint rooms_status_check check (
    status in (
      'waiting',
      'running',
      'round2-running',
      'round2-ready',
      'finished'
    )
  );
end $$;

-- Add pack_id constraint
alter table rooms
  drop constraint if exists rooms_pack_id_check;

alter table rooms
  add constraint rooms_pack_id_check
  check (pack_id in ('classic', '03012026'));

create index if not exists rooms_pack_id_idx on rooms (pack_id);

-- Ensure RLS allows create_room insert
alter table public.rooms enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Allow insert rooms'
  ) then
    drop policy "Allow insert rooms" on public.rooms;
  end if;
end $$;

create policy "Allow insert rooms"
on public.rooms for insert
with check (true);

-- Add total_points to players if not exists
alter table players
  add column if not exists total_points int default 0;

-- Add is_correct and points_earned to answers if not exists
alter table answers
  add column if not exists is_correct boolean default false;

alter table answers
  add column if not exists points_earned int default 0;

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
  new_answer_id uuid;
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
  on conflict do nothing
  returning id into new_answer_id;

  if new_answer_id is null then
    select total_points into updated_points
    from players
    where id = p_player_id;

    return query
    select p_player_id, updated_points, true;
    return;
  end if;

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

-- Ensure a unique constraint to avoid double answers
create unique index if not exists answers_unique on answers (room_id, player_id, question_index);

-- Centralized logs table for client telemetry
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  client_timestamp timestamptz,
  level text not null,
  channel text not null,
  message text not null,
  event_name text,
  room_id uuid,
  player_id uuid,
  session_id text,
  page text,
  user_agent text,
  context jsonb
);

alter table public.logs enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'logs' and policyname = 'Allow insert logs'
  ) then
    drop policy "Allow insert logs" on public.logs;
  end if;
end $$;

create policy "Allow insert logs"
on public.logs for insert
with check (true);

create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_event_name_idx on public.logs (event_name);
create index if not exists logs_room_id_idx on public.logs (room_id);
create index if not exists logs_player_id_idx on public.logs (player_id);

-- Room limit settings + RPC to enforce limit on creation
create table if not exists public.app_settings (
  id bigserial primary key,
  max_rooms integer default 100
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'max_rooms'
  ) then
    alter table public.app_settings add column max_rooms integer;
  end if;
end $$;

insert into public.app_settings (max_rooms)
select 100
where exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'app_settings'
    and column_name = 'max_rooms'
)
and not exists (
  select 1 from public.app_settings where max_rooms is not null
);

create or replace function public.get_max_active_rooms()
returns integer
language plpgsql
stable
as $$
declare
  resolved_limit integer;
  has_max_rooms boolean;
begin
  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'max_rooms'
  ) into has_max_rooms;

  if has_max_rooms then
    select max_rooms
      into resolved_limit
    from public.app_settings
    where max_rooms is not null
    order by id asc
    limit 1;
  end if;

  if resolved_limit is null then
    select value::integer
      into resolved_limit
    from public.app_settings
    where key = 'max_active_rooms'
    limit 1;
  end if;

  return coalesce(resolved_limit, 100);
end;
$$;

drop function if exists public.create_room(text, text);
create or replace function public.create_room(
  p_code text,
  p_pack_id text default 'classic'
)
returns table (
  id uuid,
  code text,
  is_active boolean,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  max_rooms integer;
begin
  select count(*) into active_count from public.rooms where is_active = true;
  select public.get_max_active_rooms() into max_rooms;

  if active_count >= max_rooms then
    insert into public.logs (level, channel, message, event_name, context)
    values (
      'warn',
      'rpc',
      'Room limit reached while creating room',
      'create_room_limit',
      jsonb_build_object('active_count', active_count, 'max_rooms', max_rooms, 'code', p_code)
    );
    raise exception 'Room limit reached';
  end if;

  insert into public.rooms (code, current_question_index, is_active, status, question_started_at, pack_id)
  values (p_code, 0, true, 'waiting', null, p_pack_id)
  returning public.rooms.id, public.rooms.code, public.rooms.is_active, public.rooms.status into id, code, is_active, status;

  return query
  select id, code, is_active, status;
exception
  when others then
    insert into public.logs (level, channel, message, event_name, context)
    values (
      'error',
      'rpc',
      'create_room failed',
      'create_room_error',
      jsonb_build_object('code', p_code, 'pack_id', p_pack_id, 'error', SQLERRM)
    );
    raise;
end;
$$;

grant execute on function public.create_room(text, text) to anon, authenticated;

-- Question likes (Round 1) + best question helper
create table if not exists public.question_likes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  question_id integer not null,
  player_id uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists question_likes_unique on public.question_likes (room_id, question_id, player_id);
create index if not exists question_likes_room_idx on public.question_likes (room_id);
create index if not exists question_likes_question_idx on public.question_likes (question_id);

alter table public.question_likes enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'question_likes' and policyname = 'Allow read question likes'
  ) then
    drop policy "Allow read question likes" on public.question_likes;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'question_likes' and policyname = 'Allow insert question likes'
  ) then
    drop policy "Allow insert question likes" on public.question_likes;
  end if;
end $$;

create policy "Allow read question likes"
on public.question_likes for select
using (true);

create policy "Allow insert question likes"
on public.question_likes for insert
with check (true);

drop function if exists public.like_question(uuid, integer, uuid);
create or replace function public.like_question(
  p_room_id uuid,
  p_question_id integer,
  p_player_id uuid
)
returns table (
  was_inserted boolean,
  total_likes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  likes_count integer;
begin
  insert into public.question_likes (room_id, question_id, player_id)
  values (p_room_id, p_question_id, p_player_id)
  on conflict do nothing
  returning id into inserted_id;

  select count(*) into likes_count
  from public.question_likes
  where room_id = p_room_id and question_id = p_question_id;

  return query
  select (inserted_id is not null), likes_count;
end;
$$;

grant execute on function public.like_question(uuid, integer, uuid) to anon, authenticated;

drop function if exists public.get_best_question(uuid);
create or replace function public.get_best_question(
  p_room_id uuid
)
returns table (
  question_id integer,
  likes integer
)
language sql
stable
as $$
  select question_id, count(*)::integer as likes
  from public.question_likes
  where room_id = p_room_id
  group by question_id
  order by likes desc, question_id asc
  limit 1;
$$;

grant execute on function public.get_best_question(uuid) to anon, authenticated;
