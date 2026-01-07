-- Fix: enable RLS for public.round2_answers (with backup)
-- Project: vqrspimfhimntbrwxvvi
-- Run in Supabase SQL Editor.

begin;

-- 0) Private schema for backups (avoid PostgREST exposure)
create schema if not exists backups;
revoke all on schema backups from public;
revoke all on schema backups from anon;
revoke all on schema backups from authenticated;

-- 1) Backup (structure + data)
-- Creates/refreshes a dated backup table you can roll back to.
-- NOTE: adjust the suffix if you run this on another date.
do $$
begin
  if to_regclass('backups.round2_answers_backup_20251231') is null then
    execute 'create table backups.round2_answers_backup_20251231 (like public.round2_answers including all)';
    execute 'alter table backups.round2_answers_backup_20251231 enable row level security';
    execute 'revoke all on table backups.round2_answers_backup_20251231 from anon';
    execute 'revoke all on table backups.round2_answers_backup_20251231 from authenticated';
  else
    execute 'truncate table backups.round2_answers_backup_20251231';
  end if;
end $$;

insert into backups.round2_answers_backup_20251231
select * from public.round2_answers;

-- 2) Enable RLS
alter table public.round2_answers enable row level security;

-- 3) Policies (MVP / keep existing functionality)
-- This matches your existing pattern in docs/supabase-init-full.sql (open access).
-- If you want stricter policies later, replace this with room-scoped policies.
drop policy if exists "Allow all operations on round2_answers" on public.round2_answers;
create policy "Allow all operations on round2_answers"
on public.round2_answers
for all
using (true)
with check (true);

commit;

-- Quick sanity checks
-- select count(*) as round2_answers_count from public.round2_answers;
-- select count(*) as backup_count from backups.round2_answers_backup_20251231;
