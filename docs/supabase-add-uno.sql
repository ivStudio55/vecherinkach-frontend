-- UNO mini-game schema
-- Run in Supabase SQL editor

-- Base dictionary: irregular verbs
create table if not exists public.irregular_verbs (
  id uuid primary key default gen_random_uuid(),
  infinitive text not null,
  past_simple text not null,
  past_participle text not null,
  translation text,
  level text,
  tags text[],
  audio_url text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.irregular_verbs enable row level security;
create policy "Allow read verbs" on public.irregular_verbs for select using (true);
create policy "Allow insert verbs" on public.irregular_verbs for insert with check (true);

-- UNO tables
create table if not exists public.uno_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('classic', 'irregular-verbs')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  direction smallint not null default 1,
  current_player_id uuid,
  host_id uuid,
  draw_pile jsonb[] not null default '{}',
  discard_pile jsonb[] not null default '{}',
  hands jsonb not null default '{}'::jsonb,
  verb_count integer not null default 20,
  state_version bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.uno_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  seat integer not null default 0,
  joined_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.uno_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  player_id uuid,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists uno_rooms_code_idx on public.uno_rooms(code);
create index if not exists uno_players_room_idx on public.uno_players(room_id);
create index if not exists uno_events_room_idx on public.uno_events(room_id);

alter table public.uno_rooms enable row level security;
alter table public.uno_players enable row level security;
alter table public.uno_events enable row level security;

create policy "Allow all on uno_rooms" on public.uno_rooms for all using (true) with check (true);
create policy "Allow all on uno_players" on public.uno_players for all using (true) with check (true);
create policy "Allow insert on uno_events" on public.uno_events for insert with check (true);
create policy "Allow select on uno_events" on public.uno_events for select using (true);

-- Helpers
create or replace function public._uno_shuffle(cards jsonb[])
returns jsonb[]
language sql
as $$
  select coalesce(array_agg(card order by random()), '{}') from unnest(cards) card;
$$;

drop function if exists public.uno_pick_verbs(integer);
create or replace function public.uno_pick_verbs(p_count integer default 20)
returns jsonb[]
language sql
as $$
  select coalesce(array_agg(to_jsonb(v)), '{}')
  from (
    select * from public.irregular_verbs order by random() limit greatest(15, least(p_count, 25))
  ) v;
$$;

create or replace function public._uno_build_deck(p_mode text, p_verbs jsonb[])
returns jsonb[]
language plpgsql
as $$
declare
  deck jsonb[] := '{}';
  colors text[] := array['red','yellow','green','blue'];
  c text;
  v jsonb;
begin
  if p_mode = 'classic' then
    foreach c in array colors loop
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'number', 'value', 0);
      for i in 1..9 loop
        deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'number', 'value', i);
        deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'number', 'value', i);
      end loop;
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'skip');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'skip');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'reverse');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'reverse');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'draw2');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'draw2');
    end loop;
  else
    foreach v in array p_verbs loop
      foreach c in array colors loop
        deck := deck || jsonb_build_object(
          'id', gen_random_uuid(),
          'color', c,
          'kind', 'verb',
          'verb', v
        );
      end loop;
    end loop;
    foreach c in array colors loop
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'skip');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'skip');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'reverse');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'reverse');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'draw2');
      deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', c, 'kind', 'draw2');
    end loop;
  end if;

  -- wild cards
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild4');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild4');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild4');
  deck := deck || jsonb_build_object('id', gen_random_uuid(), 'color', 'wild', 'kind', 'wild4');

  return _uno_shuffle(deck);
end;
$$;

create or replace function public._uno_next_player(p_room_id uuid, p_current uuid)
returns uuid
language plpgsql
as $$
declare
  next_id uuid;
  direction integer;
  ids uuid[];
  idx integer;
begin
  select direction into direction from public.uno_rooms where id = p_room_id;
  select array_agg(id order by seat) into ids from public.uno_players where room_id = p_room_id;
  if ids is null then
    return null;
  end if;
  idx := array_position(ids, p_current);
  if idx is null then
    return ids[1];
  end if;
  idx := idx + direction;
  if idx < 1 then
    idx := array_length(ids,1);
  elsif idx > array_length(ids,1) then
    idx := 1;
  end if;
  next_id := ids[idx];
  return next_id;
end;
$$;

-- Room creation
create or replace function public.uno_create_room(
  p_code text,
  p_mode text default 'classic',
  p_verb_count integer default 20,
  p_host_name text default 'Host'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  verbs jsonb[] := '{}';
  deck jsonb[] := '{}';
  room_row public.uno_rooms;
  host_row public.uno_players;
  hand jsonb := '[]'::jsonb;
  i integer;
begin
  if p_mode = 'irregular-verbs' then
    verbs := public.uno_pick_verbs(p_verb_count);
    if array_length(verbs,1) is null then
      raise exception 'Нет глаголов в словаре';
    end if;
  end if;

  deck := public._uno_build_deck(p_mode, verbs);

  insert into public.uno_rooms (code, mode, verb_count, draw_pile, discard_pile, hands)
  values (p_code, p_mode, greatest(15, least(p_verb_count, 25)), deck, '[]'::jsonb, '{}'::jsonb)
  returning * into room_row;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_host_name, ''), 'Host'), true, 1)
  returning * into host_row;

  -- deal 7 cards to host
  for i in 1..7 loop
    if array_length(room_row.draw_pile,1) is null then
      raise exception 'Пустая колода при раздаче';
    end if;
    hand := hand || room_row.draw_pile[1];
    room_row.draw_pile := room_row.draw_pile[2:array_length(room_row.draw_pile,1)];
  end loop;

  room_row.hands := jsonb_set(room_row.hands, ARRAY[host_row.id::text], hand, true);
  room_row.current_player_id := host_row.id;
  update public.uno_rooms set draw_pile = room_row.draw_pile, hands = room_row.hands, current_player_id = room_row.current_player_id where id = room_row.id;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(host_row));
end;
$$;

grant execute on function public.uno_create_room(text, text, integer, text) to anon, authenticated;

-- Join room
create or replace function public.uno_join_room(
  p_room_code text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.uno_rooms;
  player_row public.uno_players;
  hand jsonb := '[]'::jsonb;
  seat_no integer;
  i integer;
begin
  select * into room_row from public.uno_rooms where code = p_room_code limit 1;
  if room_row.id is null then
    raise exception 'Комната не найдена';
  end if;

  select coalesce(max(seat),0)+1 into seat_no from public.uno_players where room_id = room_row.id;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_player_name,''), 'Игрок'), false, seat_no)
  returning * into player_row;

  if room_row.status = 'lobby' then
    for i in 1..7 loop
      if array_length(room_row.draw_pile,1) is null then
        exit;
      end if;
      hand := hand || room_row.draw_pile[1];
      room_row.draw_pile := room_row.draw_pile[2:array_length(room_row.draw_pile,1)];
    end loop;
    room_row.hands := jsonb_set(room_row.hands, ARRAY[player_row.id::text], hand, true);
    update public.uno_rooms
    set draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        updated_at = timezone('utc', now())
    where id = room_row.id;
  end if;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(player_row));
end;
$$;

grant execute on function public.uno_join_room(text, text) to anon, authenticated;

-- Start game: flip first card to discard, set status playing
create or replace function public.uno_start_game(p_room_code text)
returns public.uno_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.uno_rooms;
  first_card jsonb;
  idx integer;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if array_length(room_row.draw_pile,1) is null then raise exception 'Колода пуста'; end if;

  first_card := room_row.draw_pile[1];
  idx := 1;
  -- avoid starting with wild+4 if можно
  while first_card ->> 'kind' in ('wild4') and idx < array_length(room_row.draw_pile,1) loop
    idx := idx + 1;
    first_card := room_row.draw_pile[idx];
  end loop;

  room_row.discard_pile := room_row.discard_pile || first_card;
  room_row.draw_pile := room_row.draw_pile[(idx+1):array_length(room_row.draw_pile,1)];
  room_row.status := 'playing';
  room_row.updated_at := timezone('utc', now());

  update public.uno_rooms
  set discard_pile = room_row.discard_pile,
      draw_pile = room_row.draw_pile,
      status = room_row.status,
      updated_at = room_row.updated_at
  where id = room_row.id
  returning * into room_row;

  return room_row;
end;
$$;

grant execute on function public.uno_start_game(text) to anon, authenticated;

-- Draw card
create or replace function public.uno_draw_card(
  p_room_code text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.uno_rooms;
  card jsonb;
  hand jsonb;
  new_hand jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if array_length(room_row.draw_pile,1) is null then raise exception 'Колода пуста'; end if;

  card := room_row.draw_pile[1];
  room_row.draw_pile := room_row.draw_pile[2:array_length(room_row.draw_pile,1)];

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);
  new_hand := hand || card;
  room_row.hands := jsonb_set(room_row.hands, ARRAY[p_player_id::text], new_hand, true);
  room_row.updated_at := timezone('utc', now());

  update public.uno_rooms set draw_pile = room_row.draw_pile, hands = room_row.hands, updated_at = room_row.updated_at where id = room_row.id;

  return jsonb_build_object('card', card, 'room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_draw_card(text, uuid) to anon, authenticated;

-- Play card with basic rule checks
create or replace function public.uno_play_card(
  p_room_code text,
  p_player_id uuid,
  p_card_id uuid,
  p_chosen_color text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.uno_rooms;
  hand jsonb;
  idx integer := 0;
  card jsonb;
  top_card jsonb;
  new_color text;
  direction integer;
  next_player uuid;
  draw_count integer := 0;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if room_row.current_player_id is not null and room_row.current_player_id <> p_player_id then
    raise exception 'Сейчас ход другого игрока';
  end if;

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);
  for i in 0..jsonb_array_length(hand)-1 loop
    if (hand -> i) ->> 'id' = p_card_id::text then
      idx := i;
      card := hand -> i;
      exit;
    end if;
  end loop;

  if card is null then raise exception 'Карта не найдена в руке'; end if;
  if room_row.discard_pile is null or array_length(room_row.discard_pile,1) = 0 then
    top_card := null;
  else
    top_card := room_row.discard_pile[array_length(room_row.discard_pile,1)];
  end if;

  -- rule check (color OR value/verb OR wild)
  if card ->> 'kind' not in ('wild','wild4') then
    if top_card is not null then
      if (card ->> 'color') = (top_card ->> 'color') then
        -- ok
      elsif (card ->> 'kind') = 'verb' and (top_card ->> 'kind') = 'verb' and (card -> 'verb' ->> 'id') = (top_card -> 'verb' ->> 'id') then
        -- ok same verb
      elsif (card ->> 'kind') = 'number' and (top_card ->> 'kind') = 'number' and (card ->> 'value') = (top_card ->> 'value') then
        -- ok same number
      elsif card ->> 'kind' = top_card ->> 'kind' then
        -- action match
      else
        raise exception 'Нельзя сходить этой картой';
      end if;
    end if;
  end if;

  -- apply chosen color for wild
  if card ->> 'kind' in ('wild','wild4') then
    if p_chosen_color is null then
      raise exception 'Нужно выбрать цвет для wild';
    end if;
    card := jsonb_set(card, '{color}', to_jsonb(p_chosen_color));
  end if;

  -- remove from hand
  hand := hand - idx;
  room_row.hands := jsonb_set(room_row.hands, ARRAY[p_player_id::text], hand, true);

  -- push to discard
  room_row.discard_pile := room_row.discard_pile || card;

  -- specials
  direction := room_row.direction;
  if card ->> 'kind' = 'reverse' then
    direction := direction * -1;
  elsif card ->> 'kind' = 'skip' then
    next_player := public._uno_next_player(room_row.id, p_player_id);
  elsif card ->> 'kind' = 'draw2' then
    next_player := public._uno_next_player(room_row.id, p_player_id);
    draw_count := 2;
  elsif card ->> 'kind' = 'wild4' then
    next_player := public._uno_next_player(room_row.id, p_player_id);
    draw_count := 4;
  end if;

  if next_player is null then
    next_player := public._uno_next_player(room_row.id, p_player_id);
  end if;

  if draw_count > 0 and next_player is not null then
    for i in 1..draw_count loop
      exit when array_length(room_row.draw_pile,1) is null;
      hand := coalesce(room_row.hands -> next_player::text, '[]'::jsonb);
      hand := hand || room_row.draw_pile[1];
      room_row.draw_pile := room_row.draw_pile[2:array_length(room_row.draw_pile,1)];
      room_row.hands := jsonb_set(room_row.hands, ARRAY[next_player::text], hand, true);
    end loop;
  end if;

  room_row.direction := direction;
  room_row.current_player_id := next_player;
  room_row.updated_at := timezone('utc', now());

  update public.uno_rooms
  set discard_pile = room_row.discard_pile,
      draw_pile = room_row.draw_pile,
      hands = room_row.hands,
      direction = room_row.direction,
      current_player_id = room_row.current_player_id,
      updated_at = room_row.updated_at
  where id = room_row.id;

  return jsonb_build_object('room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_play_card(text, uuid, uuid, text) to anon, authenticated;

-- Simple seed verbs (optional)
insert into public.irregular_verbs (infinitive, past_simple, past_participle, translation)
values
  ('be', 'was/were', 'been', 'быть'),
  ('begin', 'began', 'begun', 'начинать'),
  ('bring', 'brought', 'brought', 'приносить'),
  ('build', 'built', 'built', 'строить'),
  ('buy', 'bought', 'bought', 'покупать')
on conflict do nothing;
