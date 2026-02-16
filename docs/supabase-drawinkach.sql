-- ================================================================
-- РИСУНКАЧ (Drawinkach): Drawing chain party game
-- Run this file in Supabase SQL Editor
-- Includes: tables, word dictionary, RLS, Realtime
-- ================================================================

-- Drop old tables to recreate cleanly
drop table if exists public.draw_votes cascade;
drop table if exists public.draw_steps cascade;
drop table if exists public.draw_chains cascade;
drop table if exists public.draw_players cascade;
drop table if exists public.draw_rooms cascade;
drop table if exists public.draw_words cascade;

-- ===================== DRAWING WORDS DICTIONARY ===================

create table public.draw_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  category text default 'general',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.draw_words enable row level security;
create policy "Allow read draw_words" on public.draw_words for select using (true);

-- Seed ~100 fun drawing words
insert into public.draw_words (word, category) values
  -- Животные
  ('кот', 'животные'),
  ('собака', 'животные'),
  ('рыба', 'животные'),
  ('слон', 'животные'),
  ('заяц', 'животные'),
  ('медведь', 'животные'),
  ('лошадь', 'животные'),
  ('птица', 'животные'),
  ('змея', 'животные'),
  ('жираф', 'животные'),
  ('черепаха', 'животные'),
  ('бабочка', 'животные'),
  ('корова', 'животные'),
  ('обезьяна', 'животные'),
  ('пингвин', 'животные'),
  ('крокодил', 'животные'),
  ('дельфин', 'животные'),
  ('паук', 'животные'),
  ('мышь', 'животные'),
  ('лягушка', 'животные'),
  ('акула', 'животные'),
  ('краб', 'животные'),
  ('улитка', 'животные'),
  ('осьминог', 'животные'),
  ('кит', 'животные'),
  ('пчела', 'животные'),
  ('лев', 'животные'),
  ('волк', 'животные'),
  ('олень', 'животные'),
  ('ёж', 'животные'),
  -- Еда
  ('пицца', 'еда'),
  ('торт', 'еда'),
  ('мороженое', 'еда'),
  ('банан', 'еда'),
  ('яблоко', 'еда'),
  ('арбуз', 'еда'),
  ('сыр', 'еда'),
  ('бургер', 'еда'),
  ('попкорн', 'еда'),
  ('пончик', 'еда'),
  ('конфета', 'еда'),
  ('виноград', 'еда'),
  ('морковь', 'еда'),
  ('ананас', 'еда'),
  ('вишня', 'еда'),
  -- Предметы
  ('дом', 'предметы'),
  ('машина', 'предметы'),
  ('велосипед', 'предметы'),
  ('зонт', 'предметы'),
  ('ключ', 'предметы'),
  ('часы', 'предметы'),
  ('телефон', 'предметы'),
  ('лампа', 'предметы'),
  ('стул', 'предметы'),
  ('очки', 'предметы'),
  ('книга', 'предметы'),
  ('гитара', 'предметы'),
  ('ножницы', 'предметы'),
  ('самолёт', 'предметы'),
  ('ракета', 'предметы'),
  ('корабль', 'предметы'),
  ('поезд', 'предметы'),
  ('свеча', 'предметы'),
  ('робот', 'предметы'),
  ('меч', 'предметы'),
  -- Природа
  ('дерево', 'природа'),
  ('цветок', 'природа'),
  ('солнце', 'природа'),
  ('луна', 'природа'),
  ('звезда', 'природа'),
  ('облако', 'природа'),
  ('гора', 'природа'),
  ('радуга', 'природа'),
  ('снежинка', 'природа'),
  ('молния', 'природа'),
  ('костёр', 'природа'),
  ('вулкан', 'природа'),
  ('остров', 'природа'),
  ('водопад', 'природа'),
  ('кактус', 'природа'),
  -- Персонажи
  ('пират', 'персонажи'),
  ('космонавт', 'персонажи'),
  ('клоун', 'персонажи'),
  ('принцесса', 'персонажи'),
  ('дракон', 'персонажи'),
  ('привидение', 'персонажи'),
  ('снеговик', 'персонажи'),
  ('ниндзя', 'персонажи'),
  ('русалка', 'персонажи'),
  ('ведьма', 'персонажи'),
  -- Разное
  ('мяч', 'разное'),
  ('корона', 'разное'),
  ('сердце', 'разное'),
  ('якорь', 'разное'),
  ('флаг', 'разное'),
  ('воздушный шар', 'разное'),
  ('подарок', 'разное'),
  ('замок', 'разное'),
  ('маяк', 'разное'),
  ('колесо', 'разное'),
  ('череп', 'разное'),
  ('алмаз', 'разное'),
  ('щит', 'разное'),
  ('барабан', 'разное'),
  ('шляпа', 'разное');

-- ===================== ROOMS ======================================

create table public.draw_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'voting', 'results', 'finished')),
  mode text not null default 'russian'
    check (mode in ('russian', 'english', 'free')),
  current_round integer not null default 0,
  current_step integer not null default 0,
  total_steps integer not null default 0,
  step_started_at timestamptz,
  step_duration integer not null default 60,
  voting_chain_index integer not null default 0,
  host_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ===================== PLAYERS ====================================

create table public.draw_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  seat integer not null default 0,
  score integer not null default 0,
  joined_at timestamptz not null default timezone('utc', now())
);

-- ===================== CHAINS =====================================

create table public.draw_chains (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  round integer not null,
  chain_index integer not null,
  original_word text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ===================== STEPS ======================================

create table public.draw_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.draw_chains(id) on delete cascade,
  step_number integer not null,
  player_id uuid not null references public.draw_players(id) on delete cascade,
  target_word text,
  guess text,
  drawing_data text,
  is_correct boolean not null default false,
  submitted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- ===================== VOTES ======================================

create table public.draw_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draw_rooms(id) on delete cascade,
  round integer not null,
  chain_id uuid not null references public.draw_chains(id) on delete cascade,
  voter_id uuid not null references public.draw_players(id) on delete cascade,
  voted_for_player_id uuid not null references public.draw_players(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(chain_id, voter_id)
);

-- ===================== INDEXES ====================================

create index draw_rooms_code_idx on public.draw_rooms(code);
create index draw_players_room_idx on public.draw_players(room_id);
create index draw_chains_room_round_idx on public.draw_chains(room_id, round);
create index draw_steps_chain_idx on public.draw_steps(chain_id);
create index draw_steps_player_idx on public.draw_steps(player_id);
create index draw_votes_room_idx on public.draw_votes(room_id);

-- ===================== RLS (open for MVP) =========================

alter table public.draw_rooms enable row level security;
alter table public.draw_players enable row level security;
alter table public.draw_chains enable row level security;
alter table public.draw_steps enable row level security;
alter table public.draw_votes enable row level security;

create policy "Allow all on draw_rooms" on public.draw_rooms for all using (true) with check (true);
create policy "Allow all on draw_players" on public.draw_players for all using (true) with check (true);
create policy "Allow all on draw_chains" on public.draw_chains for all using (true) with check (true);
create policy "Allow all on draw_steps" on public.draw_steps for all using (true) with check (true);
create policy "Allow all on draw_votes" on public.draw_votes for all using (true) with check (true);

-- ===================== REALTIME ===================================

alter publication supabase_realtime add table public.draw_rooms;
alter publication supabase_realtime add table public.draw_players;
alter publication supabase_realtime add table public.draw_steps;

-- ===================== VERIFICATION ===============================

select 'draw_words' as "table", count(*) as "rows" from public.draw_words
union all select 'draw_rooms', count(*) from public.draw_rooms
union all select 'draw_players', count(*) from public.draw_players;
