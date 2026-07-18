-- ================================================================
-- Paid store packs for "Рисункач"
-- Safe to run multiple times.
-- ================================================================

create table if not exists public.draw_packs (
  id text primary key,
  label text not null,
  description text default '',
  is_public boolean not null default false,
  is_active boolean not null default true,
  price integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.draw_packs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'draw_packs'
      and policyname = 'Allow read draw_packs'
  ) then
    create policy "Allow read draw_packs" on public.draw_packs for select using (true);
  end if;
end $$;

alter table public.draw_rooms
  add column if not exists pack_id text references public.draw_packs(id);

insert into public.draw_packs (id, label, description, is_public, is_active, price)
values (
  'classic',
  'Рисункач',
  'Доступ к игре Рисункач: рисуйте, угадывайте и голосуйте за лучшие цепочки.',
  false,
  true,
  200
)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  is_active = true,
  updated_at = timezone('utc', now());

insert into public.game_prices (game, price, updated_at)
values ('draw', 200, timezone('utc', now()))
on conflict (game) do nothing;
