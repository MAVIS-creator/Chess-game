begin;

-- Upgrade original session-based Cedar Chess tables in place.
-- Existing profile rows, match records, and session IDs are retained.
alter table public.cedar_ai_profiles add column if not exists profile_key text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cedar_ai_profiles'
      and column_name = 'session_id'
  ) then
    update public.cedar_ai_profiles
    set profile_key = session_id
    where profile_key is null;
    -- The secure client writes profile_key only; retain the legacy PK with
    -- a generated value for new rows.
    alter table public.cedar_ai_profiles
      alter column session_id set default gen_random_uuid()::text;
  end if;
end
$$;

alter table public.cedar_ai_profiles
  alter column profile_key set not null;
create unique index if not exists cedar_ai_profiles_profile_key_unique_idx
  on public.cedar_ai_profiles (profile_key);

alter table public.cedar_ai_profiles
  add column if not exists pressure_index integer not null default 0 check (pressure_index >= 0),
  add column if not exists endgame_prep integer not null default 0 check (endgame_prep >= 0),
  add column if not exists opening_prep integer not null default 0 check (opening_prep >= 0);

alter table public.cedar_match_history
  add column if not exists player_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cedar_match_history'
      and column_name = 'session_id'
  ) then
    -- New secure client writes player_id rather than session_id.
    alter table public.cedar_match_history
      alter column session_id set default gen_random_uuid()::text;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cedar_match_history'::regclass
      and conname = 'cedar_match_history_player_id_fkey'
  ) then
    alter table public.cedar_match_history
      add constraint cedar_match_history_player_id_fkey
      foreign key (player_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

create index if not exists cedar_match_history_player_id_created_at_idx
  on public.cedar_match_history (player_id, created_at desc);

alter table public.cedar_ai_profiles enable row level security;
alter table public.cedar_match_history enable row level security;

-- Remove all legacy open policies and previous revisions.
drop policy if exists "public can read ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can upsert ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can update ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can insert match history" on public.cedar_match_history;
drop policy if exists "public can read own-style match history feed" on public.cedar_match_history;
drop policy if exists "players can read own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can insert own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can update own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can insert own match history" on public.cedar_match_history;
drop policy if exists "players can read own match history" on public.cedar_match_history;

create policy "players can read own ai profile"
  on public.cedar_ai_profiles for select to authenticated
  using (profile_key = (select auth.uid())::text);

create policy "players can insert own ai profile"
  on public.cedar_ai_profiles for insert to authenticated
  with check (profile_key = (select auth.uid())::text);

create policy "players can update own ai profile"
  on public.cedar_ai_profiles for update to authenticated
  using (profile_key = (select auth.uid())::text)
  with check (profile_key = (select auth.uid())::text);

create policy "players can insert own match history"
  on public.cedar_match_history for insert to authenticated
  with check (player_id = (select auth.uid()));

create policy "players can read own match history"
  on public.cedar_match_history for select to authenticated
  using (player_id = (select auth.uid()));

revoke all on table public.cedar_ai_profiles from anon;
revoke all on table public.cedar_match_history from anon;
revoke all on table public.cedar_ai_profiles from authenticated;
revoke all on table public.cedar_match_history from authenticated;
grant select, insert, update on table public.cedar_ai_profiles to authenticated;
grant select, insert on table public.cedar_match_history to authenticated;

-- Legacy rows remain intact. Historical session IDs have no verified
-- relationship to auth.users, so do not assign them to arbitrary users.
commit;
