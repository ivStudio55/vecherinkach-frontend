-- ================================================================
-- UNO: schema v2 — fixes for Realtime + jsonb piles
-- Run AFTER supabase-add-uno.sql (drops & recreates functions/tables)
-- ================================================================

-- Drop old tables to recreate with correct types
drop table if exists public.uno_events cascade;
drop table if exists public.uno_players cascade;
drop table if exists public.uno_rooms cascade;

-- Rooms — all game state in jsonb (not jsonb[]) for Realtime compat
create table public.uno_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('classic', 'irregular-verbs', 'verb-match')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  direction smallint not null default 1,
  current_player_id uuid,
  host_id uuid,
  draw_pile jsonb not null default '[]'::jsonb,
  discard_pile jsonb not null default '[]'::jsonb,
  hands jsonb not null default '{}'::jsonb,
  winner_id uuid,
  verb_count integer not null default 20,
  state_version bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.uno_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  seat integer not null default 0,
  joined_at timestamptz not null default timezone('utc', now())
);

create table public.uno_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.uno_rooms(id) on delete cascade,
  player_id uuid,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index uno_rooms_code_idx on public.uno_rooms(code);
create index uno_players_room_idx on public.uno_players(room_id);
create index uno_events_room_idx on public.uno_events(room_id);

-- RLS (open for MVP)
alter table public.uno_rooms enable row level security;
alter table public.uno_players enable row level security;
alter table public.uno_events enable row level security;

create policy "Allow all on uno_rooms" on public.uno_rooms for all using (true) with check (true);
create policy "Allow all on uno_players" on public.uno_players for all using (true) with check (true);
create policy "Allow insert on uno_events" on public.uno_events for insert with check (true);
create policy "Allow select on uno_events" on public.uno_events for select using (true);

-- Enable Realtime on uno tables
alter publication supabase_realtime add table public.uno_rooms;
alter publication supabase_realtime add table public.uno_players;

-- ========================== HELPERS ================================

-- Build a shuffled classic UNO deck (108 cards) as jsonb array
create or replace function public._uno_build_classic_deck()
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
begin
  foreach c in array colors loop
    -- one 0 per color
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', 0));
    for i in 1..9 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', i));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', i));
    end loop;
    -- 2x action cards per color
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- 4x wild, 4x wild+4
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- Pick N random verbs and return as jsonb array
create or replace function public._uno_pick_verbs(p_count integer default 20)
returns jsonb
language sql as $$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from (select id::text, infinitive, past_simple, past_participle, translation
        from public.irregular_verbs order by random() limit greatest(15, least(p_count, 25))) v;
$$;

-- Build verb-mode deck: each verb in 4 colors + action + wild cards
create or replace function public._uno_build_verb_deck(p_verbs jsonb)
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
  v jsonb;
begin
  for i in 0..jsonb_array_length(p_verbs)-1 loop
    v := p_verbs -> i;
    foreach c in array colors loop
      deck := deck || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'color', c,
        'kind', 'verb',
        'verb', v
      ));
    end loop;
  end loop;
  -- action cards
  foreach c in array colors loop
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- wild
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- Fisher-Yates shuffle on a jsonb array
create or replace function public._uno_shuffle(arr jsonb)
returns jsonb
language plpgsql as $$
declare
  n integer := jsonb_array_length(arr);
  tmp jsonb;
  j integer;
  result jsonb[];
  k integer;
begin
  -- convert to pg array for in-place swap
  result := array(select arr -> i from generate_series(0, n-1) i);
  for i in reverse n-1 .. 1 loop
    j := floor(random() * (i + 1))::integer;
    tmp := result[i+1];
    result[i+1] := result[j+1];
    result[j+1] := tmp;
  end loop;
  return array_to_json(result)::jsonb;
end;
$$;

-- Next player helper
create or replace function public._uno_next_player(p_room_id uuid, p_current uuid)
returns uuid
language plpgsql as $$
declare
  dir integer;
  ids uuid[];
  idx integer;
begin
  select direction into dir from public.uno_rooms where id = p_room_id;
  select array_agg(id order by seat) into ids from public.uno_players where room_id = p_room_id;
  if ids is null or array_length(ids,1) = 0 then return null; end if;
  idx := array_position(ids, p_current);
  if idx is null then return ids[1]; end if;
  idx := idx + dir;
  if idx < 1 then idx := array_length(ids,1);
  elsif idx > array_length(ids,1) then idx := 1;
  end if;
  return ids[idx];
end;
$$;

-- Skip-then-next (for skip / draw specials the NEXT player after skipped)
create or replace function public._uno_skip_next(p_room_id uuid, p_current uuid)
returns uuid
language plpgsql as $$
declare skipped uuid;
begin
  skipped := public._uno_next_player(p_room_id, p_current);
  return public._uno_next_player(p_room_id, skipped);
end;
$$;

-- Deal N cards from draw_pile into a hand (returns updated draw_pile, hand)
create or replace function public._uno_deal(p_pile jsonb, p_hand jsonb, p_count integer)
returns jsonb -- { "pile": [...], "hand": [...] }
language plpgsql as $$
declare
  n integer := least(p_count, jsonb_array_length(p_pile));
begin
  for i in 0..n-1 loop
    p_hand := p_hand || jsonb_build_array(p_pile -> 0);
    p_pile := p_pile - 0;
  end loop;
  return jsonb_build_object('pile', p_pile, 'hand', p_hand);
end;
$$;

-- Build verb-match deck: each verb produces 4 cards (one per form),
-- each card shows ONLY one word. Cards of the same verb share verb_id.
-- Colors are cycled so that the 4 forms get different colors.
create or replace function public._uno_build_match_deck(p_verbs jsonb)
returns jsonb
language plpgsql as $$
declare
  deck jsonb := '[]'::jsonb;
  colors text[] := array['red','yellow','green','blue'];
  c text;
  v jsonb;
  forms text[];
  displays text[];
  cIdx integer;
begin
  for i in 0..jsonb_array_length(p_verbs)-1 loop
    v := p_verbs -> i;
    forms := array['infinitive','past_simple','past_participle','translation'];
    displays := array[
      v ->> 'infinitive',
      v ->> 'past_simple',
      v ->> 'past_participle',
      coalesce(v ->> 'translation', v ->> 'infinitive')
    ];
    for fi in 1..4 loop
      cIdx := ((i * 4 + fi - 1) % 4) + 1;  -- rotate colours
      deck := deck || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'color', colors[cIdx],
        'kind', 'verb-match',
        'verb_id', v ->> 'id',
        'display', displays[fi],
        'form', forms[fi]
      ));
    end loop;
  end loop;
  -- action cards
  foreach c in array colors loop
    for j in 1..2 loop
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  end loop;
  -- wild
  for k in 1..4 loop
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  end loop;
  return deck;
end;
$$;

-- ======================= ROOM CREATION =============================

drop function if exists public.uno_create_room(text, text, integer, text);
create or replace function public.uno_create_room(
  p_code text,
  p_mode text default 'classic',
  p_verb_count integer default 20,
  p_host_name text default 'Host'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  deck jsonb;
  dealt jsonb;
  room_row public.uno_rooms;
  host_row public.uno_players;
begin
  if p_mode = 'verb-match' then
    deck := public._uno_build_match_deck(public._uno_pick_verbs(p_verb_count));
  elsif p_mode = 'irregular-verbs' then
    deck := public._uno_build_verb_deck(public._uno_pick_verbs(p_verb_count));
  else
    deck := public._uno_build_classic_deck();
  end if;
  deck := public._uno_shuffle(deck);

  insert into public.uno_rooms (code, mode, verb_count, draw_pile)
  values (p_code, p_mode, greatest(15, least(p_verb_count, 25)), deck)
  returning * into room_row;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_host_name,''), 'Host'), true, 1)
  returning * into host_row;

  -- deal 7 cards
  dealt := public._uno_deal(room_row.draw_pile, '[]'::jsonb, 7);

  update public.uno_rooms
  set draw_pile = dealt -> 'pile',
      hands = jsonb_build_object(host_row.id::text, dealt -> 'hand'),
      host_id = host_row.id,
      current_player_id = host_row.id,
      state_version = state_version + 1
  where id = room_row.id
  returning * into room_row;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(host_row));
end;
$$;

grant execute on function public.uno_create_room(text, text, integer, text) to anon, authenticated;

-- ======================= JOIN ROOM =================================

drop function if exists public.uno_join_room(text, text);
create or replace function public.uno_join_room(
  p_room_code text,
  p_player_name text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  player_row public.uno_players;
  dealt jsonb;
  seat_no integer;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;

  select coalesce(max(seat),0)+1 into seat_no from public.uno_players where room_id = room_row.id;

  insert into public.uno_players (room_id, name, is_host, seat)
  values (room_row.id, coalesce(nullif(p_player_name,''), 'Игрок'), false, seat_no)
  returning * into player_row;

  -- deal 7 cards if still in lobby
  if room_row.status = 'lobby' then
    dealt := public._uno_deal(room_row.draw_pile, '[]'::jsonb, 7);
    update public.uno_rooms
    set draw_pile = dealt -> 'pile',
        hands = room_row.hands || jsonb_build_object(player_row.id::text, dealt -> 'hand'),
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  end if;

  return jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(player_row));
end;
$$;

grant execute on function public.uno_join_room(text, text) to anon, authenticated;

-- ======================= START GAME ================================

drop function if exists public.uno_start_game(text);
create or replace function public.uno_start_game(p_room_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  first_card jsonb;
  idx integer := 0;
  pile jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;

  pile := room_row.draw_pile;
  -- find first non-wild4 card to start discard
  while idx < jsonb_array_length(pile) loop
    first_card := pile -> idx;
    exit when first_card ->> 'kind' <> 'wild4';
    idx := idx + 1;
  end loop;
  if first_card is null then raise exception 'Колода пуста'; end if;

  pile := pile - idx;  -- remove that card from pile

  update public.uno_rooms
  set draw_pile = pile,
      discard_pile = jsonb_build_array(first_card),
      status = 'playing',
      state_version = state_version + 1,
      updated_at = now()
  where id = room_row.id
  returning * into room_row;

  return to_jsonb(room_row);
end;
$$;

grant execute on function public.uno_start_game(text) to anon, authenticated;

-- ======================= DRAW CARD =================================

drop function if exists public.uno_draw_card(text, uuid);
create or replace function public.uno_draw_card(
  p_room_code text,
  p_player_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  card jsonb;
  hand jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if jsonb_array_length(room_row.draw_pile) = 0 then raise exception 'Колода пуста'; end if;

  card := room_row.draw_pile -> 0;
  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);
  hand := hand || jsonb_build_array(card);

  update public.uno_rooms
  set draw_pile = room_row.draw_pile - 0,
      hands = jsonb_set(room_row.hands, array[p_player_id::text], hand, true),
      current_player_id = public._uno_next_player(room_row.id, p_player_id),
      state_version = state_version + 1,
      updated_at = now()
  where id = room_row.id
  returning * into room_row;

  return jsonb_build_object('card', card, 'room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_draw_card(text, uuid) to anon, authenticated;

-- ======================= PLAY CARD =================================

drop function if exists public.uno_play_card(text, uuid, uuid, text);
create or replace function public.uno_play_card(
  p_room_code text,
  p_player_id uuid,
  p_card_id text,
  p_chosen_color text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  room_row public.uno_rooms;
  hand jsonb;
  card jsonb;
  top_card jsonb;
  idx integer := -1;
  pile jsonb;
  dir integer;
  next_p uuid;
  draw_n integer := 0;
  target_hand jsonb;
  dealt jsonb;
begin
  select * into room_row from public.uno_rooms where code = p_room_code for update;
  if room_row.id is null then raise exception 'Комната не найдена'; end if;
  if room_row.status <> 'playing' then raise exception 'Игра не запущена'; end if;
  if room_row.current_player_id <> p_player_id then raise exception 'Сейчас ход другого игрока'; end if;

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);

  -- find card in hand
  for i in 0..jsonb_array_length(hand)-1 loop
    if (hand -> i) ->> 'id' = p_card_id then
      idx := i; card := hand -> i; exit;
    end if;
  end loop;
  if card is null then raise exception 'Карта не найдена в руке'; end if;

  -- top card
  if jsonb_array_length(room_row.discard_pile) > 0 then
    top_card := room_row.discard_pile -> (jsonb_array_length(room_row.discard_pile) - 1);
  end if;

  -- rule validation
  if card ->> 'kind' not in ('wild','wild4') and top_card is not null then
    if not (
         (card ->> 'color') = (top_card ->> 'color')
      or ((card ->> 'kind') = 'verb-match' and (top_card ->> 'kind') = 'verb-match' and (card ->> 'verb_id') = (top_card ->> 'verb_id'))
      or ((card ->> 'kind') = 'verb' and (top_card ->> 'kind') = 'verb' and (card -> 'verb' ->> 'id') = (top_card -> 'verb' ->> 'id'))
      or ((card ->> 'kind') = 'number' and (top_card ->> 'kind') = 'number' and (card ->> 'value') = (top_card ->> 'value'))
      or ((card ->> 'kind') = (top_card ->> 'kind') and (card ->> 'kind') in ('skip','reverse','draw2'))
    ) then
      raise exception 'Нельзя сходить этой картой';
    end if;
  end if;

  -- wild → override colour
  if card ->> 'kind' in ('wild','wild4') then
    if p_chosen_color is null then raise exception 'Нужно выбрать цвет для wild'; end if;
    card := jsonb_set(card, '{color}', to_jsonb(p_chosen_color));
  end if;

  -- remove card from hand
  hand := hand - idx;

  -- push to discard
  pile := room_row.discard_pile || jsonb_build_array(card);

  -- direction
  dir := room_row.direction;
  if card ->> 'kind' = 'reverse' then dir := dir * -1; end if;

  -- determine next player + specials
  if card ->> 'kind' = 'skip' then
    next_p := public._uno_skip_next(room_row.id, p_player_id);
  elsif card ->> 'kind' = 'draw2' then
    next_p := public._uno_next_player(room_row.id, p_player_id);
    draw_n := 2;
  elsif card ->> 'kind' = 'wild4' then
    next_p := public._uno_next_player(room_row.id, p_player_id);
    draw_n := 4;
  else
    next_p := public._uno_next_player(room_row.id, p_player_id);
  end if;

  -- apply draws to target player
  room_row.hands := jsonb_set(room_row.hands, array[p_player_id::text], hand, true);
  if draw_n > 0 and next_p is not null then
    target_hand := coalesce(room_row.hands -> next_p::text, '[]'::jsonb);
    dealt := public._uno_deal(room_row.draw_pile - 0, target_hand, draw_n); -- we use - 0 just for type safety
    -- actually deal properly
    dealt := public._uno_deal(room_row.draw_pile, target_hand, draw_n);
    room_row.draw_pile := dealt -> 'pile';
    room_row.hands := jsonb_set(room_row.hands, array[next_p::text], dealt -> 'hand', true);
    -- after draw, skip that player
    next_p := public._uno_next_player(room_row.id, next_p);
  end if;

  -- check win
  if jsonb_array_length(hand) = 0 then
    update public.uno_rooms
    set discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = null,
        winner_id = p_player_id,
        status = 'finished',
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  else
    update public.uno_rooms
    set discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = next_p,
        state_version = state_version + 1,
        updated_at = now()
    where id = room_row.id
    returning * into room_row;
  end if;

  -- log event
  insert into public.uno_events (room_id, player_id, event_type, payload)
  values (room_row.id, p_player_id, 'play_card', jsonb_build_object('card', card));

  return jsonb_build_object('room', to_jsonb(room_row));
end;
$$;

grant execute on function public.uno_play_card(text, uuid, text, text) to anon, authenticated;
