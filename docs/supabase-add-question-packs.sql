-- Adds question-pack support to rooms.
--
-- After applying this migration, the frontend can store which question pack
-- a room is using, so players and host load the same JSON/audio.

begin;

alter table public.rooms
  add column if not exists pack_id text not null default 'classic';

-- Keep values constrained to known packs.
-- (Extend this list when you add new packs.)
alter table public.rooms
  drop constraint if exists rooms_pack_id_check;

alter table public.rooms
  add constraint rooms_pack_id_check
  check (pack_id in ('classic', '03012026'));

create index if not exists rooms_pack_id_idx on public.rooms (pack_id);

commit;
